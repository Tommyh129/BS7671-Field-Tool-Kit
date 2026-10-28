import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/business/model.ts';
import {quotePdf,materialsPdf,snapshotPdf,clientTechnicalData} from '../src/business/pdf.ts';
import {validateLogoFile,MAX_LOGO_BYTES} from '../src/business/logo.ts';

test('legacy profiles acquire safe defaults without rewriting issued snapshots',()=>{
  const old={name:'Original name',address:'Original address',vatRegistered:false};const copy=structuredClone(old);const profile=M.businessProfile(old);
  assert.equal(profile.quoteValidityDays,30);assert.equal(profile.bankDetails,'');assert.equal(profile.legalName,'');assert.deepEqual(old,copy);assert.deepEqual(M.documentOptions(),{showContactDetails:true,showPaymentInstructions:false,showBankDetails:false,internal:false});
});
test('validity defaults respect calendar boundaries, leap days and no-expiry',()=>{
  assert.equal(M.quoteValidUntil('2026-12-20',{...M.blankCompany(),quoteValidityDays:30}),'2027-01-19');
  assert.equal(M.quoteValidUntil('2028-02-28',{...M.blankCompany(),quoteValidityDays:1}),'2028-02-29');
  assert.equal(M.quoteValidUntil('2026-10-17',{...M.blankCompany(),quoteValidityDays:0}),'');
  assert.throws(()=>M.validateProfile({...M.blankCompany(),quoteValidityDays:-1}));assert.throws(()=>M.validateProfile({...M.blankCompany(),quoteValidityDays:1.5}));
  assert.throws(()=>M.validateProfile({...M.blankCompany(),footer:'\n'.repeat(10)}));
});
test('bank and payment information are omitted unless explicitly enabled per document',()=>{
  const profile={...M.blankCompany(),name:'Trading',legalName:'Legal',contactName:'CONTACT_SENTINEL',email:'CONTACT_EMAIL_SENTINEL',website:'WEBSITE_SENTINEL',bankDetails:'BANK_SENTINEL',paymentInstructions:'PAYMENT_SENTINEL',registrationNumber:'REG123'};
  const safe=M.documentBranding(profile,{showContactDetails:false});assert.equal(safe.bankDetails,'');assert.equal(safe.paymentInstructions,'');assert.equal(safe.email,'');assert.equal(safe.contactName,'');assert.equal(safe.website,'');assert.equal(safe.legalName,'Legal');assert.equal(safe.registrationNumber,'REG123');
  const enabled=M.documentBranding(profile,{showBankDetails:true,showPaymentInstructions:true});assert.equal(enabled.bankDetails,'BANK_SENTINEL');assert.equal(enabled.paymentInstructions,'PAYMENT_SENTINEL');
  assert.equal(M.documentBranding(profile).bankDetails,'');
});
test('issued branding and visibility settings cannot be changed in place',()=>{
  const issued={reference:'Q',revision:1,company:{...M.blankCompany(),name:'Old',logoId:'old-logo'},documentOptions:M.documentOptions({showBankDetails:true}),issuedAt:'2026-10-17',pdfId:'retained-pdf',status:'Sent',items:[]};
  const changed={...issued,company:{...issued.company,name:'New',logoId:'new-logo'}};assert.equal(M.immutableIssuedUpdate(issued,changed),false);assert.equal(M.immutableIssuedUpdate(issued,{...issued,documentOptions:M.documentOptions()}),false);
  const revision=M.revisionOf(issued,[issued]);revision.company.name='Revised';assert.equal(issued.company.name,'Old');assert.equal(issued.company.logoId,'old-logo');assert.equal(issued.pdfId,'retained-pdf');
});
test('logo validation checks byte signatures, MIME, empty input and size',async()=>{
  const png=new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0])],{type:'image/png'});assert.equal(await validateLogoFile(png),'image/png');
  const jpg=new Blob([new Uint8Array([255,216,255,224])],{type:'image/jpeg'});assert.equal(await validateLogoFile(jpg),'image/jpeg');
  await assert.rejects(()=>validateLogoFile(new Blob(['<svg/>'],{type:'image/png'})),/valid PNG/);
  await assert.rejects(()=>validateLogoFile(new Blob([new Uint8Array([255,216,255])],{type:'image/png'})),/valid PNG/);
  await assert.rejects(()=>validateLogoFile(new Blob([])),/5 MB/);
  await assert.rejects(()=>validateLogoFile(new Blob([new Uint8Array(MAX_LOGO_BYTES+1)],{type:'image/png'})),/5 MB/);
});
test('client calculation projection excludes private fields recursively',()=>{
  const input={current:10,privateNotes:'PRIVATE_SENTINEL',nested:{margin:100,cost:50,purchased:true,voltage:230},items:[{unitCost:25,description:'Cable'}]};
  const projected=clientTechnicalData(input);assert.deepEqual(projected,{current:10,nested:{voltage:230},items:[{description:'Cable'}]});assert.equal(input.nested.cost,50);
});
test('client and internal PDFs are separate and share branding without requiring a logo',async()=>{
  const company={...M.blankCompany(),name:'Brand sentinel',footer:'Footer sentinel',bankDetails:'BANK_SENTINEL',paymentInstructions:'PAYMENT_SENTINEL'};
  const project={...M.blankProject('01'),customer:'Client',title:'Project',notes:'PRIVATE_PROJECT_NOTES'};
  const list={name:'List',notes:'PRIVATE_LIST_NOTES',items:[{...M.materialItem(),description:'Cable',cost:'1234.56',supplier:'PRIVATE_SUPPLIER',notes:'PRIVATE_ITEM_NOTES'}]};
  const client=await materialsPdf(project,list,company).text();for(const forbidden of ['BANK_SENTINEL','PAYMENT_SENTINEL','PRIVATE_LIST_NOTES','PRIVATE_ITEM_NOTES','PRIVATE_SUPPLIER','Purchased'])assert.equal(client.includes(forbidden),false,forbidden);
  assert.ok(client.includes('Brand sentinel'));assert.ok(client.includes('Footer sentinel'));
  const internal=await materialsPdf(project,list,company,undefined,{internal:true,showBankDetails:true}).text();assert.ok(internal.includes('INTERNAL'));assert.ok(internal.includes('PRIVATE_SUPPLIER'));assert.ok(internal.includes('BANK_SENTINEL'));assert.equal(internal.includes('PAYMENT_SENTINEL'),false);
});
