import { blankCompany, businessProfile, decimal, documentOptions, linePence, today, validateProfile, type Company, type DocumentOptions, type Project, type Quote, type SellingItem } from '../model';

export const VAT_TREATMENTS = ['standard', 'reduced', 'zero', 'exempt', 'outside', 'nonVAT', 'reverseCharge'] as const;
export type VatTreatment = typeof VAT_TREATMENTS[number];
export const VAT_LABELS: Record<VatTreatment,string> = {standard:'Standard 20%',reduced:'Reduced 5%',zero:'Zero-rated 0%',exempt:'Exempt',outside:'Outside scope',nonVAT:'Not VAT registered',reverseCharge:'Construction reverse charge - unsupported'};
export interface InvoiceLine extends SellingItem {vat: VatTreatment}
export interface InvoiceDraft {
  projectId: string; projectNumber: string; projectTitle: string;
  sourceQuote?: {id:string; reference:string; revision:number};
  company: Company; businessType: 'soleTrader'|'limited'|'other'|'';
  customer: string; billingAddress: string; siteAddress: string; customerReference: string;
  issueDate: string; supplyDate: string; serviceStart: string; serviceEnd: string; dueDate: string;
  items: InvoiceLine[]; discount: string; terms: string; notes: string; documentOptions: DocumentOptions;
}
export interface InvoiceTotals {lines:{gross:number;discount:number;net:number;vat:number;rate:number;treatment:VatTreatment}[];subtotal:number;discount:number;net:number;vat:number;total:number}
export interface Payment {id:string;date:string;amount:number;method:'Bank transfer'|'Cash'|'Card'|'Other';reference:string;privateNote:string;reversal?:{at:string;reason:string}}
export interface Credit {id:string;reference:string;date:string;reason:string;state:'Preparing'|'Issued';lines:{index:number;net:number;vat:number}[];net:number;vat:number;total:number;pdfPath:string;issuedAt?:string}
export interface Audit {id:string;at:string;action:string;reason?:string;date?:string}
export interface Invoice {id:string;reference:string;state:'Preparing'|'Issued'|'Void';draft:InvoiceDraft;totals:InvoiceTotals;createdAt:string;issuedAt?:string;pdfPath:string;payments:Payment[];credits:Credit[];audit:Audit[];sentDate?:string}
export const addDays=(date:string,days:number)=>{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};
export function newInvoice(projectId='',project?:Project,company:Company=blankCompany()):InvoiceDraft {
  return {projectId,projectNumber:project?.number||'',projectTitle:project?.title||'',company:{...businessProfile(structuredClone(company)),invoiceFooter:company.invoiceFooter||company.footer||''},businessType:company.businessType||'',customer:project?.customer||'',billingAddress:project?.address||'',siteAddress:project?.address||'',customerReference:'',issueDate:today(),supplyDate:today(),serviceStart:'',serviceEnd:'',dueDate:addDays(today(),company.invoiceDueDays??14),items:[],discount:'0.00',terms:company.terms,notes:'',documentOptions:documentOptions()};
}
export function fromQuote(id:string,q:Quote,projectId:string,project?:Project):InvoiceDraft {
  if(q.company.vatRegistered&&![2000,500,0].includes(decimal(q.vatPercent||'0')))throw Error('The quote VAT rate needs manual review before invoice conversion.');
  const value=newInvoice(projectId,project,q.company);
  return {...value,sourceQuote:{id,reference:q.reference,revision:q.revision},customer:q.customer.customer,billingAddress:q.customer.address,siteAddress:project?.address||q.customer.address,projectTitle:q.customer.title,items:q.items.map(({id,category,description,quantity,unit,rate})=>({id,category,description,quantity,unit,rate,vat:!q.company.vatRegistered?'nonVAT':Number(q.vatPercent)===20?'standard':Number(q.vatPercent)===5?'reduced':'zero'})),discount:q.discount,terms:q.terms,notes:q.notes};
}
export function dateField(value:string,label:string,optional=false) {
  if(optional&&!value)return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw Error(`${label}: enter a valid date.`);
}
const round=(n:bigint,d:bigint)=>Number((n+d/2n)/d);
export function invoiceTotals(value:InvoiceDraft):InvoiceTotals {
  if(value.items.length>200)throw Error('Use at most 200 invoice lines.');
  const gross=value.items.map(i=>{if(decimal(i.quantity,3)<=0)throw Error('Quantities must be greater than zero.');return linePence(i.quantity,i.rate)});
  const subtotal=gross.reduce((s,n)=>s+n,0), discount=decimal(value.discount||'0');
  if(subtotal>1_000_000_000)throw Error('Invoice total is too large.');
  if(discount>subtotal)throw Error('Discount cannot exceed the subtotal.');
  // Cumulative proportional allocation gives an exact penny total with deterministic ties.
  let cumulative=0,previous=0;
  const lines=value.items.map((item,index)=>{
    if(!VAT_TREATMENTS.includes(item.vat))throw Error('Choose a VAT treatment for every line.');
    if(item.vat==='reverseCharge')throw Error('Construction domestic reverse charge is unsupported. Do not issue this supply using another treatment.');
    if(!value.company.vatRegistered&&item.vat!=='nonVAT')throw Error('Non-VAT businesses must use Not VAT registered on every line.');
    if(value.company.vatRegistered&&item.vat==='nonVAT')throw Error('Choose the applicable VAT treatment for every line.');
    cumulative+=gross[index];const allocated=subtotal?round(BigInt(cumulative)*BigInt(discount),BigInt(subtotal)):0;
    const lineDiscount=allocated-previous;previous=allocated;
    const net=gross[index]-lineDiscount,rate=item.vat==='standard'?20:item.vat==='reduced'?5:0;
    const vat=round(BigInt(net)*BigInt(rate),100n);
    return {gross:gross[index],discount:lineDiscount,net,vat,rate,treatment:item.vat};
  });
  const net=subtotal-discount,vat=lines.reduce((s,i)=>s+i.vat,0);
  return {lines,subtotal,discount,net,vat,total:net+vat};
}
export function validateInvoice(value:InvoiceDraft) {
  validateProfile(value.company);
  if(!['soleTrader','limited','other'].includes(value.businessType))throw Error('Select the supplier business type.');
  for(const [label,s] of [['Supplier legal name',value.company.legalName],['Supplier name',value.company.name],['Supplier address',value.company.address],['Customer name',value.customer],['Billing address',value.billingAddress],['Payment terms',value.terms],['Project number',value.projectNumber],['Project title',value.projectTitle]])if(!s?.trim())throw Error(`${label} is required before issuing.`);
  if(!value.company.email.trim()&&!value.company.phone.trim())throw Error('Supplier email or phone is required before issuing.');
  if(!value.documentOptions.showContactDetails)throw Error('Invoice supplier contact details must be included.');
  if(value.company.vatRegistered&&!value.company.vatNumber.trim())throw Error('VAT registration number is required for a VAT invoice.');
  if(!value.items.length||value.items.some(i=>!i.description.trim()))throw Error('Add described invoice lines before issuing.');
  if(new Set(value.items.map(i=>i.id)).size!==value.items.length)throw Error('Invoice line identifiers must be distinct.');
  dateField(value.issueDate,'Invoice date');dateField(value.dueDate,'Due date');
  if(value.issueDate>today())throw Error('Invoice date cannot be in the future.');
  if(value.dueDate<value.issueDate)throw Error('Due date cannot precede the invoice date.');
  if(value.supplyDate)dateField(value.supplyDate,'Supply date');
  else {dateField(value.serviceStart,'Service start');dateField(value.serviceEnd,'Service end');if(value.serviceEnd<value.serviceStart)throw Error('Service end cannot precede the start.');}
  if(value.customer.length>300||value.billingAddress.length>2000||value.siteAddress.length>2000||value.notes.length>4000||value.terms.length>4000||value.items.some(i=>i.description.length>2000||i.unit.length>40))throw Error('Invoice text is too long.');
  return invoiceTotals(value);
}
// Network and PDF boundaries deliberately project client-facing fields, not project/private data.
export function cleanDraft(v:InvoiceDraft):InvoiceDraft {
  const c=businessProfile(v.company);
  return {projectId:String(v.projectId||''),projectNumber:String(v.projectNumber||''),projectTitle:String(v.projectTitle||''),...(v.sourceQuote?{sourceQuote:{id:String(v.sourceQuote.id),reference:String(v.sourceQuote.reference),revision:Number(v.sourceQuote.revision)}}:{}),company:{name:c.name,legalName:c.legalName||'',address:c.address,email:c.email,phone:c.phone,website:c.website||'',contactName:c.contactName||'',registrationNumber:c.registrationNumber||'',vatRegistered:c.vatRegistered,vatNumber:c.vatNumber,terms:c.terms,exclusions:'',footer:c.invoiceFooter??c.footer??'',invoiceFooter:c.invoiceFooter??c.footer??'',logoId:c.logoId||'',paymentInstructions:c.paymentInstructions||'',bankDetails:c.bankDetails||''},businessType:v.businessType,customer:String(v.customer||''),billingAddress:String(v.billingAddress||''),siteAddress:String(v.siteAddress||''),customerReference:String(v.customerReference||''),issueDate:String(v.issueDate||''),supplyDate:String(v.supplyDate||''),serviceStart:String(v.serviceStart||''),serviceEnd:String(v.serviceEnd||''),dueDate:String(v.dueDate||''),items:v.items.map(i=>({id:String(i.id),category:i.category,description:String(i.description),quantity:String(i.quantity),unit:String(i.unit),rate:String(i.rate),vat:i.vat})),discount:String(v.discount||'0'),terms:String(v.terms||''),notes:String(v.notes||''),documentOptions:{...documentOptions(v.documentOptions),internal:false}};
}
export function balances(invoice:Invoice) {
  const credited=invoice.credits.filter(c=>c.state==='Issued').reduce((s,c)=>s+c.total,0);
  const paid=invoice.payments.filter(p=>!p.reversal).reduce((s,p)=>s+p.amount,0);
  const due=invoice.state!=='Issued'?0:invoice.totals.total-credited-paid;
  const status=invoice.state!=='Issued'?invoice.state:credited===invoice.totals.total&&credited>0?'Credited':due<=0?'Paid':paid>0?'Partially paid':'Issued';
  return {credited,paid,outstanding:Math.max(0,due),customerCredit:Math.max(0,-due),status,overdue:invoice.state==='Issued'&&due>0&&invoice.draft.dueDate<today()};
}
export function creditLines(invoice:Invoice,amounts:{index:number;net:number}[]) {
  const seen=new Set<number>();
  const lines=amounts.filter(a=>a.net!==0).map(a=>{
    if(!Number.isSafeInteger(a.index)||!Number.isSafeInteger(a.net)||a.net<=0||!invoice.totals.lines[a.index]||seen.has(a.index))throw Error('Choose positive credit amounts against distinct original lines.');seen.add(a.index);
    const original=invoice.totals.lines[a.index];
    const prior=invoice.credits.flatMap(c=>c.lines).filter(l=>l.index===a.index);
    const net=prior.reduce((s,l)=>s+l.net,0),vat=prior.reduce((s,l)=>s+l.vat,0);
    if(net+a.net>original.net)throw Error('Credit exceeds the remaining creditable line amount.');
    const cumulative=original.net?round(BigInt(net+a.net)*BigInt(original.vat),BigInt(original.net)):0;
    return {index:a.index,net:a.net,vat:cumulative-vat};
  });
  if(!lines.length)throw Error('Select at least one credit amount.');
  return lines;
}
export function financialAction(invoice:Invoice,action:string,data:Record<string,unknown>,id:string,now:string):Invoice {
  if(invoice.audit.some(e=>e.id===id))return invoice;
  const copy=structuredClone(invoice), b=balances(copy);
  if(copy.state!=='Issued'&&action!=='void')throw Error('Finish issuing this invoice first.');
  if(copy.audit.length>=500)throw Error('This invoice has reached its audit capacity. Export records and contact support.');
  if(action==='payment'){
    const amount=decimal(String(data.amount));dateField(String(data.date),'Payment date');
    if(String(data.date)>today())throw Error('Payment date cannot be in the future.');
    if(!['Bank transfer','Cash','Card','Other'].includes(String(data.method)))throw Error('Choose a payment method.');
    if(amount<=0||amount>b.outstanding)throw Error('Payment must be positive and no greater than the outstanding balance. Overpayments are not supported.');
    copy.payments.push({id,date:String(data.date),amount,method:data.method as Payment['method'],reference:String(data.reference||'').slice(0,300),privateNote:String(data.privateNote||'').slice(0,2000)});
  } else if(action==='reversePayment'){
    const payment=copy.payments.find(p=>p.id===data.paymentId);if(!payment||payment.reversal)throw Error('This payment is missing or already reversed.');
    if(!String(data.reason||'').trim())throw Error('Enter a reversal reason.');
    payment.reversal={at:now,reason:String(data.reason).slice(0,2000)};
  } else if(action==='sent'){
    dateField(String(data.date),'Sent date');if(String(data.date)>today())throw Error('Sent date cannot be in the future.');copy.sentDate=String(data.date);
  } else if(action==='void'){
    if(copy.state!=='Preparing')throw Error('Issued invoices must be corrected using a credit note, not voided.');
    if(!String(data.reason||'').trim())throw Error('Enter a void reason.');copy.state='Void';
  } else throw Error('Unknown invoice action.');
  copy.audit.push({id,at:now,action,...(data.reason?{reason:String(data.reason).slice(0,2000)}:{}),...(data.date?{date:String(data.date)}:{})});return copy;
}
