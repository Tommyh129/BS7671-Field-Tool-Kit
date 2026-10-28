import { cleanDraft, creditLines, dateField, financialAction, validateInvoice, type Credit, type Invoice, type InvoiceDraft } from './model';
import { today } from '../model';

export interface FinanceTx {get<T>(path:string):Promise<T|undefined>;set(path:string,value:unknown):void}
export interface FinanceRepository {
  transaction<T>(action:(tx:FinanceTx)=>Promise<T>):Promise<T>;
  invoicePdf(invoice:Invoice):Promise<Blob>;
  creditPdf(invoice:Invoice,credit:Credit):Promise<Blob>;
  putPdf(path:string,pdf:Blob):Promise<void>;
}
export function financePath(uid:string,id:string){
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid)||!/^[A-Za-z0-9_-]{1,100}$/.test(id))throw Error('Invalid financial record identifier.');
  return `users/${uid}/invoices/${id}`;
}
const now=()=>new Date().toISOString();
function capacity(v:Invoice){if(JSON.stringify(v).length>750000)throw Error('Invoice record is too large. Export records and contact support.');}
export async function issueInvoice(repo:FinanceRepository,uid:string,id:string,input:InvoiceDraft):Promise<Invoice> {
  const path=financePath(uid,id),sequence=`users/${uid}/financeMeta/sequence`;
  const reserved=await repo.transaction(async tx=>{
    const existing=await tx.get<Invoice>(path);if(existing)return existing;
    const draft=cleanDraft(input),totals=validateInvoice(draft);
    const counter=await tx.get<{invoice:number;credit:number}>(sequence)||{invoice:0,credit:0};
    if(counter.invoice>=999999999)throw Error('Invoice numbering limit reached.');
    const number=counter.invoice+1,at=now();
    const value:Invoice={id,reference:`INV-${String(number).padStart(4,'0')}`,state:'Preparing',draft,totals,createdAt:at,pdfPath:`invoices/${uid}/${id}/original.pdf`,payments:[],credits:[],audit:[{id:'reserve',at,action:'Number reserved; issue pending'}]};
    capacity(value);tx.set(sequence,{...counter,invoice:number});tx.set(path,value);return value;
  });
  if(reserved.state==='Void')throw Error('This reserved invoice was voided; its number cannot be reused.');
  if(reserved.state==='Issued')return reserved;
  // A reserved record freezes its contents. File failure leaves the same resumable ID/number.
  await repo.putPdf(reserved.pdfPath,await repo.invoicePdf(reserved));
  return repo.transaction(async tx=>{
    const current=await tx.get<Invoice>(path);if(!current)throw Error('Reserved invoice not found.');
    if(current.state==='Issued')return current;
    if(current.state!=='Preparing')throw Error('Invoice was voided on another device.');
    const at=now(),issued={...current,state:'Issued' as const,issuedAt:at,audit:[...current.audit,{id:'issue',at,action:'Issued; original PDF retained'}]};
    tx.set(path,issued);return issued;
  });
}
export async function applyAction(repo:FinanceRepository,uid:string,invoiceId:string,operationId:string,action:string,data:Record<string,unknown>) {
  const path=financePath(uid,invoiceId);financePath(uid,operationId);
  return repo.transaction(async tx=>{
    const invoice=await tx.get<Invoice>(path);if(!invoice)throw Error('Invoice not found.');
    const updated=financialAction(invoice,action,data,operationId,now());capacity(updated);tx.set(path,updated);return updated;
  });
}
export async function issueCredit(repo:FinanceRepository,uid:string,invoiceId:string,id:string,input:{date:string;reason:string;amounts:{index:number;net:number}[]}):Promise<Invoice> {
  const path=financePath(uid,invoiceId),sequence=`users/${uid}/financeMeta/sequence`;financePath(uid,id);
  const reserved=await repo.transaction(async tx=>{
    const invoice=await tx.get<Invoice>(path);if(!invoice||invoice.state!=='Issued')throw Error('Credit notes require an issued invoice.');
    if(invoice.credits.some(c=>c.id===id))return invoice;
    if(invoice.credits.length>=100||invoice.audit.length>=498)throw Error('Credit capacity reached. Export records and contact support.');
    dateField(input.date,'Credit date');if(input.date<invoice.draft.issueDate||input.date>today())throw Error('Credit date must be between invoice date and today.');
    if(!input.reason?.trim()||input.reason.length>2000)throw Error('Enter a credit reason, up to 2000 characters.');
    const lines=creditLines(invoice,input.amounts),counter=await tx.get<{invoice:number;credit:number}>(sequence)||{invoice:0,credit:0};
    if(counter.credit>=999999999)throw Error('Credit numbering limit reached.');
    const number=counter.credit+1,net=lines.reduce((s,l)=>s+l.net,0),vat=lines.reduce((s,l)=>s+l.vat,0);
    const credit:Credit={id,reference:`CN-${String(number).padStart(4,'0')}`,date:input.date,reason:input.reason.trim(),state:'Preparing',lines,net,vat,total:net+vat,pdfPath:`invoices/${uid}/${invoiceId}/${id}.pdf`};
    const value={...invoice,credits:[...invoice.credits,credit],audit:[...invoice.audit,{id:`reserve-${id}`,at:now(),action:'Credit reserved'}]};capacity(value);
    tx.set(sequence,{...counter,credit:number});tx.set(path,value);return value;
  });
  const credit=reserved.credits.find(c=>c.id===id)!;if(credit.state==='Issued')return reserved;
  await repo.putPdf(credit.pdfPath,await repo.creditPdf(reserved,credit));
  return repo.transaction(async tx=>{
    const invoice=(await tx.get<Invoice>(path))!;const current=invoice.credits.find(c=>c.id===id)!;
    if(current.state==='Issued')return invoice;
    const at=now(),value={...invoice,credits:invoice.credits.map(c=>c.id===id?{...c,state:'Issued' as const,issuedAt:at}:c),audit:[...invoice.audit,{id:`credit-${id}`,at,action:'Credit issued'}]};
    tx.set(path,value);return value;
  });
}
