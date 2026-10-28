import { auth } from '../../firebase';
import { invoiceApiUrl } from './api-location';
import type { Invoice } from './model';

interface Pending {invoiceId:string;action:string;operationId:string;data?:unknown;draft?:unknown}
let opening:Promise<IDBDatabase>;
function owner(uid:string){if(!uid||auth.currentUser?.uid!==uid)throw Error('Sign in to your own account to access invoices.');}
async function cache<T>(uid:string,key:string,value?:T,remove=false):Promise<T|undefined>{
  owner(uid);
  opening??=new Promise((resolve,reject)=>{const r=indexedDB.open('sparkys-invoice-cache-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('cache');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('Invoice device storage is unavailable.'));});
  const db=await opening;return new Promise((resolve,reject)=>{const tx=db.transaction('cache',value!==undefined||remove?'readwrite':'readonly'),s=tx.objectStore('cache');const r=remove?s.delete(`${uid}/${key}`):value!==undefined?s.put(value,`${uid}/${key}`):s.get(`${uid}/${key}`);let result:T;r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(Error('Invoice device save failed. Check available storage.'));});
}
async function call(uid:string,path:string,body?:unknown){
  owner(uid);const token=await auth.currentUser!.getIdToken();owner(uid);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
  let response:Response;
  try{response=await fetch(invoiceApiUrl(path),{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal});}finally{clearTimeout(timer);}owner(uid);
  if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error||'Invoice server is unavailable. Retry when connected.');}return response;
}
export async function cachedInvoices(uid:string){return await cache<Invoice[]>(uid,'invoices')||[];}
export async function loadInvoices(uid:string){
  const list:Invoice[]=[];let cursor='';
  do {const result=await (await call(uid,cursor?`?after=${encodeURIComponent(cursor)}`:'')).json();if(!Array.isArray(result.invoices))throw Error('Invoice API is not configured.');list.push(...result.invoices);cursor=result.next||'';}while(cursor);
  await cache(uid,'invoices',list);return list;
}
export const pendingAction=(uid:string)=>cache<Pending>(uid,'pending');
export async function clearInvoiceDeviceData(uid:string){
  owner(uid);
  if(await pendingAction(uid))throw Error('Reconcile the pending invoice action before clearing device data.');
  const database=await opening;
  await new Promise<void>((resolve,reject)=>{
    const tx=database.transaction('cache','readwrite'),request=tx.objectStore('cache').openCursor();
    let pending=false;
    request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;if(cursor.key===`${uid}/pending`){pending=true;tx.abort();return;}if(String(cursor.key).startsWith(`${uid}/`))cursor.delete();cursor.continue();};
    tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(Error(pending?'Reconcile the pending invoice action before clearing device data.':'Invoice device data could not be cleared.'));
  });
}
export async function voidReservation(uid:string,invoice:Invoice,reason:string){
  if(!reason.trim())throw Error('Enter a void reason.');
  const op=await pendingAction(uid);
  if(op&&(op.invoiceId!==invoice.id||op.action!=='issue'))throw Error('Reconcile the pending financial action first.');
  const result=await (await call(uid,`/${invoice.id}/void`,{operationId:`void-${invoice.id}`,data:{reason}})).json();
  const list=await cachedInvoices(uid);await cache(uid,'invoices',[...list.filter(i=>i.id!==invoice.id),result.invoice]);
  if(op)await cache(uid,'pending',undefined,true);return result.invoice as Invoice;
}
export async function retainedLogo(uid:string,invoice:Invoice){
  if(!invoice.draft.company.logoId)return undefined;
  const key=`logo/${invoice.id}`,cached=await cache<string>(uid,key);if(cached)return cached;
  const data=await (await call(uid,`/${invoice.id}/logo`)).json();if(data.logo)await cache(uid,key,data.logo);return data.logo as string|undefined;
}
export async function mutateInvoice(uid:string,invoiceId:string,action:string,data?:unknown,draft?:unknown){
  if(await pendingAction(uid))throw Error('Retry the pending financial action before starting another.');
  const operation:Pending={invoiceId,action,operationId:crypto.randomUUID(),...(data!==undefined?{data}:{}),...(draft!==undefined?{draft}:{})};
  await cache(uid,'pending',operation);return retryAction(uid);
}
export async function retryAction(uid:string){
  const operation=await pendingAction(uid);if(!operation)throw Error('No pending financial action.');
  const {invoice}=await (await call(uid,`/${operation.invoiceId}/${operation.action}`,operation)).json();
  if(!invoice?.id)throw Error('Invoice server returned an invalid response. Retry the same action.');
  const list=await cachedInvoices(uid);await cache(uid,'invoices',[...list.filter(i=>i.id!==invoice.id),invoice]);await cache(uid,'pending',undefined,true);return invoice as Invoice;
}
// Validation failures may be discarded only after a server reconciliation confirms the action did not commit.
export async function discardPending(uid:string){
  const op=await pendingAction(uid);if(!op)return;
  const list=await loadInvoices(uid),invoice=list.find(i=>i.id===op.invoiceId);
  if(op.action==='issue'&&invoice)throw Error('This invoice already has a reserved number. Retry issuing or void the reserved invoice.');
  if(invoice?.audit.some(a=>a.id===op.operationId)||invoice?.credits.some(c=>c.id===op.operationId))throw Error('This action is already recorded. Retry to reconcile it.');
  await cache(uid,'pending',undefined,true);
}
export async function originalPdf(uid:string,invoice:Invoice,creditId?:string){
  const key=`pdf/${invoice.id}/${creditId||'original'}`;
  const saved=await cache<Blob>(uid,key);if(saved)return saved;
  const blob=await (await call(uid,`/${invoice.id}/pdf${creditId?`?credit=${encodeURIComponent(creditId)}`:''}`)).blob();if(blob.type!=='application/pdf')throw Error('Original PDF response is invalid.');await cache(uid,key,blob);return blob;
}
export async function exportInvoiceRecords(uid:string,drafts:unknown[],onlyIds?:string[]){
  const all=await loadInvoices(uid),invoices=onlyIds?all.filter(i=>onlyIds.includes(i.id)):all,files:{reference:string;pdf:string}[]=[];let bytes=0;
  const base64=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});
  for(const invoice of invoices){
    const documents=[...(invoice.state==='Issued'?[{id:undefined,reference:invoice.reference}]:[]),...invoice.credits.filter(c=>c.state==='Issued').map(c=>({id:c.id,reference:c.reference}))];
    for(const doc of documents){const blob=await originalPdf(uid,invoice,doc.id);bytes+=blob.size;if(bytes>100*1024*1024)throw Error('PDF export exceeds 100 MB. Export individual invoices/PDFs in smaller batches.');files.push({reference:doc.reference,pdf:await base64(blob)});}
  }
  return new Blob([JSON.stringify({format:'sparkys-invoices-export-v1',exportedAt:new Date().toISOString(),private:true,drafts,invoices,files},null,2)],{type:'application/json'});
}
