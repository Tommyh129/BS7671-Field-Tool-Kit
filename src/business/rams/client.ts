import {auth} from '../../firebase';
import {getApiUrl} from '../../services/api';
import type {IssuedRams,RamsDraft} from './model';

let opening:Promise<IDBDatabase>;
const owner=(uid:string)=>{if(!uid||auth.currentUser?.uid!==uid)throw Error('Sign in to your own account to access RAMS.');};
export async function ramsCache<T>(uid:string,key:string,value?:T,remove=false):Promise<T|undefined>{
  owner(uid);
  opening??=new Promise((resolve,reject)=>{const r=indexedDB.open('sparkys-rams-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('cache');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('RAMS device storage is unavailable.'));});
  const database=await opening;owner(uid);
  return new Promise((resolve,reject)=>{const tx=database.transaction('cache',value!==undefined||remove?'readwrite':'readonly'),s=tx.objectStore('cache');
    const r=remove?s.delete(`${uid}/${key}`):value!==undefined?s.put(value,`${uid}/${key}`):s.get(`${uid}/${key}`);let result:T;
    r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(Error('RAMS device save failed. Your change was not saved.'));});
}
async function call(uid:string,path:string,body?:unknown){
  owner(uid);const token=await auth.currentUser!.getIdToken();owner(uid);
  const response=await fetch(getApiUrl('/api/rams'+path),{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(90000)});
  owner(uid);if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error||'RAMS server is unavailable. Your local draft is retained.');}return response;
}
export const cachedRams=async(uid:string)=>(await ramsCache<IssuedRams[]>(uid,'records'))||[];
export async function loadRams(uid:string){
  const records:IssuedRams[]=[];let cursor='';
  do{const result=await(await call(uid,cursor?`?after=${encodeURIComponent(cursor)}`:'')).json();if(!Array.isArray(result.records))throw Error('RAMS backend is not configured.');records.push(...result.records);cursor=result.next||'';}while(cursor);
  await ramsCache(uid,'records',records);return records;
}
export async function ramsOriginal(uid:string,id:string){
  const cached=await ramsCache<Blob>(uid,`pdf/${id}`);if(cached)return cached;
  const blob=await(await call(uid,`/${encodeURIComponent(id)}/pdf`)).blob();if(blob.type!=='application/pdf')throw Error('RAMS PDF response was invalid.');
  await ramsCache(uid,`pdf/${id}`,blob);return blob;
}
export interface PendingRams {id:string;action:'issue'|'attachment';body:Record<string,unknown>}
export const pendingRams=(uid:string,id:string)=>ramsCache<PendingRams>(uid,`pending/${id}`);
export async function listPendingRams(uid:string){
  await ramsCache(uid,'records');const database=await opening;
  return new Promise<PendingRams[]>((resolve,reject)=>{const tx=database.transaction('cache'),s=tx.objectStore('cache'),keys=s.getAllKeys(),values=s.getAll();
    tx.oncomplete=()=>resolve(values.result.filter((_,i)=>String(keys.result[i]).startsWith(`${uid}/pending/`)));
    tx.onerror=()=>reject(Error('Pending RAMS could not be loaded.'));});
}
export async function submitRams(uid:string,id:string,action:PendingRams['action'],body:Record<string,unknown>){
  const existing=await pendingRams(uid,id);
  const pending=existing||{id,action,body};
  if(!existing)await ramsCache(uid,`pending/${id}`,pending);
  return retryRams(uid,pending);
}
export async function retryRams(uid:string,pending:PendingRams){
  const {record}=await(await call(uid,`/${encodeURIComponent(pending.id)}/${pending.action}`,pending.body)).json();
  if(record?.state!=='Issued')throw Error('RAMS was not confirmed as issued. Retry the saved attempt.');
  const records=await cachedRams(uid);await ramsCache(uid,'records',[...records.filter(r=>r.id!==record.id),record]);
  await ramsCache(uid,`pending/${pending.id}`,undefined,true);
  try{await ramsOriginal(uid,record.id);}catch{/* The issued PDF remains stored on the server; retry download when online. */}
  return record as IssuedRams;
}
export async function unlockRamsDraft(uid:string,id:string){
  if((await loadRams(uid)).some(record=>record.id===id))throw Error('This issue attempt has a retained snapshot. Retry it rather than changing the original content.');
  await ramsCache(uid,`pending/${id}`,undefined,true);
}
export const ramsCapacity=async(uid:string)=>(await call(uid,'/capacity')).json() as Promise<{used:number;limit:number}>;
export async function exportRamsRecords(uid:string){
  const records=await loadRams(uid),files:{reference:string;revision:number;pdf:string}[]=[];let bytes=0;
  for(const record of records.filter(r=>r.state==='Issued')){
    const blob=await ramsOriginal(uid,record.id);bytes+=blob.size;
    if(bytes>100*1024*1024)throw Error('RAMS archive exceeds 100 MB. Contact support for a staged export.');
    const pdf=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(Error('PDF could not be read for export.'));r.readAsDataURL(blob);});
    files.push({reference:record.reference,revision:record.revision,pdf});
  }
  return new Blob([JSON.stringify({format:'sparkys-rams-archive-v1',private:true,exportedAt:new Date().toISOString(),records,files})],{type:'application/json'});
}
export async function clearRamsDeviceData(uid:string){
  await ramsCache(uid,'records');const database=await opening;
  await new Promise<void>((resolve,reject)=>{const tx=database.transaction('cache','readwrite'),r=tx.objectStore('cache').openCursor();let pending=false;
    r.onsuccess=()=>{const c=r.result;if(!c)return;if(String(c.key).startsWith(`${uid}/pending/`)){pending=true;tx.abort();return;}if(String(c.key).startsWith(`${uid}/`))c.delete();c.continue();};
    tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(Error(pending?'Retry pending RAMS issues before clearing device data.':'RAMS cache could not be cleared.'));});
}
export async function hasPendingRams(uid:string){
  await ramsCache(uid,'records');const database=await opening;
  return new Promise<boolean>((resolve,reject)=>{const r=database.transaction('cache').objectStore('cache').getAllKeys();r.onsuccess=()=>resolve(r.result.some(key=>String(key).startsWith(`${uid}/pending/`)));r.onerror=()=>reject(Error('RAMS cache could not be checked.'));});
}
