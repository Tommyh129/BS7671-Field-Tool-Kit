import test from 'node:test';
import assert from 'node:assert/strict';
import {blankCompany,blankProject,sellingItem,documentOptions} from '../src/business/model.ts';
import {newInvoice,fromQuote,invoiceTotals,validateInvoice,balances,creditLines,financialAction,cleanDraft} from '../src/business/invoices/model.ts';
import {issueInvoice,issueCredit,applyAction,financePath} from '../src/business/invoices/engine.ts';
import {invoicePdf,creditPdf,balancePdf} from '../src/business/invoices/pdf.ts';
import {invoiceApiUrl} from '../src/business/invoices/api-location.ts';

function draft(vat=false){
  const company={...blankCompany(),businessType:'soleTrader',name:'QA Trading',legalName:'QA Legal Name',address:'QA supplier address',email:'qa@example.com',vatRegistered:vat,vatNumber:vat?'VAT_QA':''};
  const v=newInvoice('project-001',{...blankProject('001'),title:'QA work',customer:'QA customer',address:'QA billing address'},company);
  return {...v,issueDate:'2026-01-01',supplyDate:'2026-01-01',dueDate:'2026-01-15',items:[{...sellingItem(),quantity:'2.5',rate:'19.99',description:'QA installation',vat:vat?'standard':'nonVAT'}]};
}
function memory(){
  const docs=new Map(),files=new Map();let lock=Promise.resolve(),fail=false;
  return {docs,files,set fail(v){fail=v;},transaction(action){const work=lock.then(async()=>{const writes=new Map();const result=await action({get:async p=>structuredClone(docs.get(p)),set:(p,v)=>writes.set(p,structuredClone(v))});for(const [p,v]of writes)docs.set(p,v);return result;});lock=work.catch(()=>{});return work;},invoicePdf:async i=>invoicePdf(i.draft,i.reference,undefined,true),creditPdf:async(i,c)=>creditPdf(i,c),putPdf:async(p,b)=>{if(fail)throw Error('TEST_STORAGE_FAILURE');if(!files.has(p))files.set(p,Buffer.from(await b.arrayBuffer()));}};
}
test('invoice web requests stay same-origin even when the Capacitor web shim exists',()=>{
  assert.equal(invoiceApiUrl('',false,'http://localhost:3000'),'http://localhost:3000/api/invoices');
  assert.equal(invoiceApiUrl('/invoice/pdf',false,'https://example.com'),'https://example.com/api/invoices/invoice/pdf');
  assert.throws(()=>invoiceApiUrl('',false,'null'),/web server/);
  assert.ok(invoiceApiUrl('',true).startsWith('https://'));
});
test('quote conversion is independent, copies selling fields only and keeps source link',()=>{
  const d=draft(true),q={company:d.company,customer:{customer:'Customer',address:'Address',title:'Work'},items:[{...sellingItem(),cost:'SECRET_COST',rate:'10',description:'Work'}],reference:'Q-001',revision:2,discount:'1.00',vatPercent:'20',terms:'Terms',notes:'Client note'};
  const before=structuredClone(q),v=fromQuote('quote-id',q,'project-001');v.items[0].description='Changed';v.company.name='Changed';assert.deepEqual(q,before);assert.equal(v.sourceQuote.id,'quote-id');assert.equal('cost' in v.items[0],false);
  assert.throws(()=>fromQuote('q',{...q,vatPercent:'17.5'},'p'),/manual review/);
});
test('non-VAT, fractional quantities and fixed discounts use integer pennies',()=>{
  const d=draft();assert.equal(invoiceTotals(d).total,4998);d.discount='0.01';assert.equal(invoiceTotals(d).total,4997);assert.equal(invoiceTotals(d).vat,0);
  d.items[0].quantity='-1';assert.throws(()=>invoiceTotals(d),/non-negative/);
});
test('mixed VAT treatments stay distinct and discount allocation totals exactly',()=>{
  const d=draft(true);d.items=['standard','reduced','zero','exempt','outside'].map(vat=>({...sellingItem(),description:vat,quantity:'1',rate:'10.00',vat}));d.discount='0.03';const t=invoiceTotals(d);
  assert.equal(t.lines.reduce((s,l)=>s+l.discount,0),3);assert.equal(t.net,4997);assert.equal(t.vat,250);assert.equal(t.total,5247);assert.equal(new Set(t.lines.map(l=>l.treatment)).size,5);
});
test('reverse charge cannot silently fall back to ordinary VAT',()=>{
  const d=draft(true);d.items[0].vat='reverseCharge';assert.throws(()=>validateInvoice(d),/reverse charge is unsupported/);
});
test('required supplier/customer, VAT details, dates and positive quantities are validated',()=>{
  const base=draft(true);validateInvoice(base);
  for(const mutate of [v=>v.company.legalName='',v=>v.billingAddress='',v=>v.company.vatNumber='',v=>v.dueDate='2025-01-01',v=>v.supplyDate='2026-02-30',v=>v.items[0].quantity='0',v=>v.documentOptions.showContactDetails=false]){const v=structuredClone(base);mutate(v);assert.throws(()=>validateInvoice(v));}
  const d=draft();d.items[0].vat='standard';assert.throws(()=>validateInvoice(d),/Non-VAT/);
});
test('simultaneous device issuing assigns distinct sequential numbers; same draft retry is idempotent',async()=>{
  const r=memory(),v=draft();const results=await Promise.all(Array.from({length:12},(_,n)=>issueInvoice(r,'owner',`draft-${n}`,v)));
  assert.equal(new Set(results.map(i=>i.reference)).size,12);assert.equal(r.docs.get('users/owner/financeMeta/sequence').invoice,12);
  const [a,b]=await Promise.all([issueInvoice(r,'owner','same',v),issueInvoice(r,'owner','same',v)]);assert.equal(a.reference,b.reference);assert.equal(r.docs.get('users/owner/financeMeta/sequence').invoice,13);
});
test('failed PDF storage reserves one number, freezes contents and resumes without replacement',async()=>{
  const r=memory(),v=draft();r.fail=true;await assert.rejects(issueInvoice(r,'owner','retry',v),/TEST_STORAGE/);
  const reserved=r.docs.get(financePath('owner','retry'));assert.equal(reserved.state,'Preparing');r.fail=false;v.company.name='Different business';v.items[0].rate='999';
  const result=await issueInvoice(r,'owner','retry',v);assert.equal(result.reference,reserved.reference);assert.equal(result.draft.company.name,'QA Trading');assert.equal(result.totals.total,4998);assert.equal(r.docs.get('users/owner/financeMeta/sequence').invoice,1);
});
test('transaction callback retries have no PDF side effects or duplicate number allocation',async()=>{
  const r=memory(),original=r.transaction.bind(r);
  r.transaction=action=>original(async tx=>{await action({get:tx.get,set:()=>{}});return action(tx);});
  const i=await issueInvoice(r,'owner','transaction-retry',draft());assert.equal(i.reference,'INV-0001');assert.equal(r.files.size,1);assert.equal(r.docs.get('users/owner/financeMeta/sequence').invoice,1);
});
test('partial payments, duplicate retries, reversals and overpayment guard preserve original PDF',async()=>{
  const r=memory(),i=await issueInvoice(r,'owner','pay',draft());const original=Buffer.from(r.files.get(i.pdfPath));
  await Promise.all([applyAction(r,'owner',i.id,'pay-1','payment',{date:'2026-01-02',amount:'20.00',method:'Cash'}),applyAction(r,'owner',i.id,'pay-1','payment',{date:'2026-01-02',amount:'20.00',method:'Cash'})]);
  let current=r.docs.get(financePath('owner',i.id));assert.equal(current.payments.length,1);assert.equal(balances(current).outstanding,2998);assert.equal(balances(current).status,'Partially paid');
  await assert.rejects(applyAction(r,'owner',i.id,'too-much','payment',{date:'2026-01-02',amount:'30.00',method:'Cash'}),/Overpayments/);
  current=await applyAction(r,'owner',i.id,'reverse','reversePayment',{paymentId:'pay-1',reason:'Entered twice elsewhere'});assert.equal(balances(current).paid,0);assert.equal(current.payments[0].reversal.reason,'Entered twice elsewhere');assert.deepEqual(r.files.get(i.pdfPath),original);
});
test('concurrent payments cannot exceed the remaining balance',async()=>{
  const r=memory(),i=await issueInvoice(r,'owner','race-payment',draft());const results=await Promise.allSettled(['a','b'].map(id=>applyAction(r,'owner',i.id,id,'payment',{date:'2026-01-02',amount:'30.00',method:'Cash'})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(balances(r.docs.get(financePath('owner',i.id))).paid,3000);
});
test('partial credit rounding uses original VAT, full credits reconcile to the penny',async()=>{
  const r=memory(),v=draft(true);v.items[0].quantity='1';v.items[0].rate='0.03';const i=await issueInvoice(r,'owner','penny',v);
  await issueCredit(r,'owner',i.id,'credit-a',{date:'2026-01-02',reason:'Part return',amounts:[{index:0,net:1}]});
  const result=await issueCredit(r,'owner',i.id,'credit-b',{date:'2026-01-02',reason:'Rest returned',amounts:[{index:0,net:2}]});assert.equal(balances(result).credited,i.totals.total);assert.equal(balances(result).status,'Credited');assert.equal(balances(result).outstanding,0);
  assert.throws(()=>creditLines(result,[{index:0,net:1}]),/exceeds/);
});
test('concurrent and retrying credits reserve amounts and numbers only once',async()=>{
  const r=memory(),i=await issueInvoice(r,'owner','credits',draft());
  const results=await Promise.allSettled(['a','b'].map(id=>issueCredit(r,'owner',i.id,id,{date:'2026-01-02',reason:'Adjustment',amounts:[{index:0,net:3000}]})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const c=r.docs.get(financePath('owner',i.id)).credits[0];await issueCredit(r,'owner',i.id,c.id,{date:'2026-01-02',reason:'Retry',amounts:[{index:0,net:3000}]});assert.equal(r.docs.get('users/owner/financeMeta/sequence').credit,1);
});
test('a failed credit PDF keeps its reservation and original amounts on retry',async()=>{
  const r=memory(),i=await issueInvoice(r,'owner','credit-retry',draft(true));r.fail=true;
  await assert.rejects(issueCredit(r,'owner',i.id,'retry-credit',{date:'2026-01-02',reason:'Original reason',amounts:[{index:0,net:1000}]}));
  const reserved=r.docs.get(financePath('owner',i.id));assert.equal(reserved.credits[0].state,'Preparing');assert.equal(balances(reserved).credited,0);
  r.fail=false;const result=await issueCredit(r,'owner',i.id,'retry-credit',{date:'2026-01-03',reason:'Changed on retry',amounts:[{index:0,net:2000}]});assert.equal(result.credits.length,1);assert.equal(result.credits[0].net,1000);assert.equal(result.credits[0].reason,'Original reason');assert.equal(r.docs.get('users/owner/financeMeta/sequence').credit,1);
});
test('credit on paid invoice creates an explicit customer credit, not a refund or ordinary paid state',async()=>{
  const r=memory(),i=await issueInvoice(r,'owner','paid-credit',draft());await applyAction(r,'owner',i.id,'pay','payment',{date:'2026-01-02',amount:'49.98',method:'Bank transfer'});
  const result=await issueCredit(r,'owner',i.id,'full-credit',{date:'2026-01-02',reason:'Cancelled',amounts:[{index:0,net:4998}]});assert.equal(balances(result).status,'Credited');assert.equal(balances(result).customerCredit,4998);
});
test('void is restricted to unissued reservations and does not reuse their numbers',async()=>{
  const r=memory();r.fail=true;await assert.rejects(issueInvoice(r,'owner','void-me',draft()));r.fail=false;
  const i=await applyAction(r,'owner','void-me','void','void',{reason:'Not supplied'});assert.equal(balances(i).status,'Void');await assert.rejects(issueInvoice(r,'owner',i.id,draft()),/cannot be reused/);
  const next=await issueInvoice(r,'owner','next',draft());assert.equal(next.reference,'INV-0002');await assert.rejects(applyAction(r,'owner',next.id,'v','void',{reason:'Correction'}),/credit note/);
});
test('issued snapshot, source changes and project deletion do not rewrite financial records or files',async()=>{
  const r=memory(),v=draft(),i=await issueInvoice(r,'owner','retained',v),before=Buffer.from(r.files.get(i.pdfPath));
  v.company.address='Changed';v.items[0].rate='999';r.docs.delete('users/owner/business/project-001');const result=await issueInvoice(r,'owner',i.id,v);assert.equal(result.draft.company.address,'QA supplier address');assert.deepEqual(r.files.get(i.pdfPath),before);assert.equal(result.reference,i.reference);
});
test('owner paths partition invoices and reject path traversal',async()=>{
  const r=memory();const a=await issueInvoice(r,'ownerA','invoice',draft()),b=await issueInvoice(r,'ownerB','invoice',draft());assert.equal(a.reference,b.reference);assert.notEqual(a.pdfPath,b.pdfPath);assert.throws(()=>financePath('ownerA','../ownerB'),/identifier/);
});
test('client projection and all PDF types exclude internal fields and private payment notes',async()=>{
  const v=draft();v.items[0].cost='PRIVATE_COST';v.items[0].margin='PRIVATE_MARGIN';v.privateNotes='PRIVATE_NOTES';v.company.bankDetails='BANK_PRIVATE';assert.equal(JSON.stringify(cleanDraft(v)).includes('PRIVATE_COST'),false);
  const r=memory(),i=await issueInvoice(r,'owner','pdf',v),paid=await applyAction(r,'owner',i.id,'p','payment',{date:'2026-01-02',amount:'1.00',method:'Cash',privateNote:'PRIVATE_PAYMENT'});
  const c={id:'c',reference:'CN-QA',date:'2026-01-02',reason:'QA',state:'Issued',lines:[{index:0,net:100,vat:0}],net:100,vat:0,total:100,pdfPath:'qa'};
  for(const pdf of [invoicePdf(v),creditPdf(i,c),balancePdf(paid)]){const text=Buffer.from(await pdf.arrayBuffer()).toString('latin1');assert.ok(text.startsWith('%PDF-'));for(const secret of ['PRIVATE_COST','PRIVATE_MARGIN','PRIVATE_NOTES','PRIVATE_PAYMENT','BANK_PRIVATE'])assert.equal(text.includes(secret),false,secret);}
});
