import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import type { Bucket } from '@google-cloud/storage';

export const DEFAULT_BUSINESS_STORAGE_BYTES = 100 * 1024 * 1024;
export const storageLimit = () => {
  const value = Number(process.env.BUSINESS_STORAGE_LIMIT_BYTES || DEFAULT_BUSINESS_STORAGE_BYTES);
  if (!Number.isSafeInteger(value) || value < 8*1024*1024) throw Error('Storage allowance is not configured correctly.');
  return value;
};
export function capacityUsed(files: {path:string;bytes:number}[], reservations: {path:string;bytes:number;expiresAt:number}[], now:number) {
  const present=new Set(files.map(f=>f.path));
  return files.reduce((sum,f)=>sum+f.bytes,0)+reservations.filter(r=>r.expiresAt>now&&!present.has(r.path)).reduce((sum,r)=>sum+r.bytes,0);
}
export async function accountFiles(bucket: Bucket, uid:string) {
  const result:{path:string;bytes:number}[]=[];
  for(const prefix of [`business/${uid}/`,`invoices/${uid}/`,`rams/${uid}/`]) {
    const [files,next]=await bucket.getFiles({prefix,autoPaginate:false,maxResults:5000});
    if(next)throw Error('Storage inventory is too large. Contact support for a capacity review.');
    for(const file of files)result.push({path:file.name,bytes:Number(file.metadata.size||0)});
  }
  return result;
}
export async function reserveStorage(db:Firestore,bucket:Bucket,uid:string,id:string,path:string,bytes:number,recordId:string,kind:string) {
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(id)||!Number.isSafeInteger(bytes)||bytes<1||bytes>8*1024*1024)throw Error('File must be between 1 byte and 8 MB.');
  const files=await accountFiles(bucket,uid), now=Date.now(),limit=storageLimit();
  const collection=db.collection(`users/${uid}/storageReservations`),ref=collection.doc(id);
  return db.runTransaction(async tx=>{
    const reservations=await tx.get(collection.limit(5000));
    if(reservations.size===5000)throw Error('Storage inventory needs maintenance. Contact support.');
    const values=reservations.docs.map(d=>({...d.data(),id:d.id})) as {id:string;path:string;bytes:number;expiresAt:Timestamp;recordId?:string}[];
    const existing=values.find(v=>v.id===id);
    if(existing&&(existing.path!==path||existing.bytes!==bytes||existing.recordId!==undefined&&existing.recordId!==recordId))throw Error('File reservation differs from the original upload.');
    const used=capacityUsed(files,values.filter(r=>r.id!==id).map(r=>({...r,expiresAt:r.expiresAt.toMillis()})),now);
    const additional=files.some(f=>f.path===path)?0:bytes;
    if(additional>0&&used+additional>limit)throw Error('Business storage is full. Existing documents can still be viewed and exported. Remove unneeded drafts/files or contact support.');
    // Expired unuploaded reservations stop charging automatically; prune metadata only.
    // Actual stored files are never removed here, including partially issued originals.
    for(const stale of values.filter(v=>v.id!==id&&v.expiresAt.toMillis()<=now).slice(0,200))tx.delete(collection.doc(stale.id));
    tx.set(ref,{path,bytes,recordId,kind,expiresAt:Timestamp.fromMillis(now+15*60*1000)});
    return {used:used+additional,limit};
  });
}
