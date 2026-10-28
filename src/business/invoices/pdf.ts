import { Document } from '../documents';
import { decimal, money, ukDate, today } from '../model';
import { VAT_LABELS, balances, cleanDraft, invoiceTotals, type Credit, type Invoice, type InvoiceDraft } from './model';

export function invoicePdf(input:InvoiceDraft,reference='TEMP-DRAFT',logo?:string,issued=false) {
  const v=cleanDraft(input),t=invoiceTotals(v);
  const d=new Document(`${issued?'':'DRAFT - '}${v.company.vatRegistered?'VAT invoice':'Invoice'} ${reference}`,v.company,logo,v.documentOptions);
  d.paragraph(`${issued?'':'DRAFT - '}${v.company.vatRegistered?'VAT INVOICE':'INVOICE'} ${reference}`,15,true);
  if(!issued)d.paragraph('DRAFT - not issued. No final invoice number assigned.',9);
  d.paragraph(`Invoice date: ${ukDate(v.issueDate)} | Due: ${ukDate(v.dueDate)}`,9);
  d.paragraph(v.supplyDate?`Supply date / tax point: ${ukDate(v.supplyDate)}`:`Service period: ${ukDate(v.serviceStart)} to ${ukDate(v.serviceEnd)} (tax point: ${ukDate(v.serviceEnd)})`,9);
  d.section('Bill to',[v.customer,v.billingAddress].filter(Boolean).join('\n'));
  d.section('Project / site',`${v.projectNumber} - ${v.projectTitle}${v.siteAddress&&v.siteAddress!==v.billingAddress?'\n'+v.siteAddress:''}`);
  d.section('Purchase order / customer reference',v.customerReference);
  d.table(v.company.vatRegistered?['Description / qty / rate','Net GBP','VAT treatment','VAT GBP']:['Description','Qty / unit','Rate GBP','Net GBP'],v.items.map((l,i)=>v.company.vatRegistered?[`${l.description}\n${l.quantity} ${l.unit} @ ${money(decimal(l.rate||'0'))}`,money(t.lines[i].net),VAT_LABELS[l.vat],money(t.lines[i].vat)]:[l.description,`${l.quantity} ${l.unit}`,money(decimal(l.rate||'0')),money(t.lines[i].net)]),v.company.vatRegistered?[82,30,40,28]:[88,32,30,30]);
  d.totals([['Subtotal',t.subtotal],['Discount',-t.discount],['Net',t.net],...(v.company.vatRegistered?[['VAT',t.vat] as [string,number]]:[]),['Total',t.total],['Payments at issue',0],['Balance at issue',t.total]]);
  if(v.company.vatRegistered){
    const groups=[...new Set(t.lines.map(l=>l.treatment))];
    d.table(['VAT breakdown','Net GBP','VAT GBP'],groups.map(g=>[VAT_LABELS[g],money(t.lines.filter(l=>l.treatment===g).reduce((s,l)=>s+l.net,0)),money(t.lines.filter(l=>l.treatment===g).reduce((s,l)=>s+l.vat,0))]),[100,40,40]);
    d.paragraph('VAT is rounded half-up per discounted line. The fixed discount is apportioned across lines.',8);
  }else d.paragraph('Supplier is not VAT registered. No VAT charged.',9);
  d.section('Payment terms',v.terms);d.section('Customer notes',v.notes);d.payments();
  return d.finish();
}
export function creditPdf(invoice:Invoice,c:Credit,logo?:string) {
  const v=invoice.draft,d=new Document(`Credit note ${c.reference} - ${invoice.reference}`,v.company,logo,v.documentOptions);
  d.paragraph(`CREDIT NOTE ${c.reference}`,15,true);d.paragraph(`Original invoice: ${invoice.reference} dated ${ukDate(v.issueDate)}`,10,true);d.paragraph(`Credit date: ${ukDate(c.date)}`,9);
  d.section('Customer / billing address',`${v.customer}\n${v.billingAddress}`);d.section('Project / site',`${v.projectNumber} - ${v.projectTitle}\n${v.siteAddress}`);d.section('Credit reason',c.reason);
  d.table(['Original item','Net credit GBP','VAT treatment','VAT credit GBP'],c.lines.map(l=>[`${l.index+1}. ${v.items[l.index].description}`,money(l.net),VAT_LABELS[v.items[l.index].vat],money(l.vat)]),[80,32,38,30]);
  d.totals([['Net credit',c.net],...(v.company.vatRegistered?[['VAT credit',c.vat] as [string,number]]:[]),['Total credit',c.total]]);
  d.paragraph('This credit adjusts the original invoice. It does not confirm a refund has been processed.',9);
  return d.finish();
}
export function balancePdf(invoice:Invoice,logo?:string){
  const v=invoice.draft,b=balances(invoice),d=new Document(`Balance summary ${invoice.reference}`,v.company,logo,{...v.documentOptions,showBankDetails:false,showPaymentInstructions:false});
  d.paragraph(`CURRENT BALANCE SUMMARY ${invoice.reference}`,13,true);d.paragraph(`Prepared ${ukDate(today())} - separate from the original invoice`,9);d.section('Customer',`${v.customer}\n${v.billingAddress}`);
  d.totals([['Original invoice',invoice.totals.total],['Issued credits',-b.credited],['Payments recorded',-b.paid],['Outstanding',b.outstanding],['Customer credit balance',b.customerCredit]]);
  d.table(['Payment date','Method','Recorded GBP','Status'],invoice.payments.map(p=>[ukDate(p.date),p.method,money(p.amount),p.reversal?'Reversed':'Recorded']),[40,55,40,45]);
  d.table(['Credit note','Date','Credit GBP'],invoice.credits.filter(c=>c.state==='Issued').map(c=>[c.reference,ukDate(c.date),money(c.total)]),[80,50,50]);
  d.paragraph('Payments are manually entered and not verified bank receipts. No refund has been processed by this app.',9);return d.finish();
}
