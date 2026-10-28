import { createHash } from 'node:crypto';
import { assertDraft, ramsIssues, outstandingActions, type RamsDraft, type IssuedRams } from './model';

interface Transaction { get<T>(path:string):Promise<T|undefined>; set(path:string,value:unknown):void }
export interface RamsRepository {
  transaction<T>(work:(tx:Transaction)=>Promise<T>):Promise<T>;
  pdf(record:IssuedRams):Promise<Blob>;
  putPdf(path:string,blob:Blob,record:IssuedRams):Promise<void>;
}
export const ramsPath=(uid:string,id:string)=>{
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid)||!/^[A-Za-z0-9_-]{1,100}$/.test(id))throw Error('RAMS identity is invalid.');
  return `users/${uid}/rams/${id}`;
};
type Family={latestId:string;revision:number;reservedId:string;projectId:string;reference:string};
export function canonicalJson(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalJson(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
export async function issueRams(repo:RamsRepository,uid:string,projectId:string,id:string,input:RamsDraft,reviewed:boolean,controlsAcknowledged:boolean,confirmedName:string,now=()=>new Date().toISOString()) {
  const path=ramsPath(uid,id);ramsPath(uid,projectId);assertDraft(input);
  const issues=ramsIssues(input);if(issues.length)throw Error(issues.join('\n'));
  if(!reviewed||!confirmedName?.trim()||confirmedName.trim().length>200||outstandingActions(input).length&&!controlsAcknowledged)throw Error('Confirm the task/site review and that outstanding required controls must be implemented before relevant work begins.');
  const fingerprint=createHash('sha256').update(canonicalJson({input,confirmedName:confirmedName.trim(),reviewed,controlsAcknowledged})).digest('hex');
  const familyPath=`users/${uid}/ramsFamilies/${input.familyId}`;
  const referencePath=`users/${uid}/ramsReferences/${createHash('sha256').update(input.reference.trim().toLowerCase()).digest('hex')}`;
  const reserved=await repo.transaction(async tx=>{
    const existing=await tx.get<IssuedRams>(path);
    if(existing){if(existing.fingerprint!==fingerprint)throw Error('This issue attempt already has a saved snapshot. Retry the original content; do not change it or create a replacement.');return existing;}
    const project=await tx.get<{deleted:boolean;kind:string}>(`users/${uid}/business/${projectId}`);
    const family=await tx.get<Family>(familyPath), reference=await tx.get<{familyId:string}>(referencePath);
    if(!project||project.deleted||project.kind!=='project')throw Error('Project must be synced and active before issue.');
    if(reference&&reference.familyId!==input.familyId)throw Error('RAMS reference is already in use. Choose another reference.');
    if(family&&(family.projectId!==projectId||family.reference!==input.reference))throw Error('RAMS family cannot be moved or renamed after issue. Duplicate it as a new document.');
    if(family?.reservedId&&family.reservedId!==id)throw Error('Another revision is being issued. Finish its retry before issuing another.');
    if(input.revision!==(family?.revision||0)+1||input.previousIssuedId!==(family?.latestId||''))throw Error('A newer revision exists. Create a revision from the latest issued document.');
    const at=now();
    const record:IssuedRams={id,projectId,familyId:input.familyId,reference:input.reference,revision:input.revision,state:'Preparing',kind:'document',snapshot:structuredClone(input),fingerprint,
      pdfPath:`rams/${uid}/${id}/original.pdf`,issuedAt:at,updatedAt:at,declaration:{uid,name:confirmedName.trim(),at,controlsAcknowledged}};
    tx.set(path,record);tx.set(familyPath,{latestId:family?.latestId||'',revision:family?.revision||0,reservedId:id,projectId,reference:input.reference});
    tx.set(referencePath,{familyId:input.familyId});tx.set(`users/${uid}/ramsProjectLocks/${projectId}`,{retained:true});
    return record;
  });
  if(reserved.state==='Issued')return reserved;
  // PDF failure leaves only a Preparing reservation. Retry uses the same snapshot and file path.
  await repo.putPdf(reserved.pdfPath,await repo.pdf(reserved),reserved);
  return repo.transaction(async tx=>{
    const current=await tx.get<IssuedRams>(path),family=await tx.get<Family>(familyPath);
    const previous=input.previousIssuedId?await tx.get<IssuedRams>(ramsPath(uid,input.previousIssuedId)):undefined;
    if(current?.state==='Issued')return current;
    if(!current||family?.reservedId!==id)throw Error('RAMS issue reservation is unavailable. Contact support.');
    if(previous?.supersededBy&&previous.supersededBy!==id)throw Error('A different revision has already replaced this document.');
    const at=now(),issued={...current,state:'Issued' as const,issuedAt:at,updatedAt:at};
    tx.set(path,issued);tx.set(familyPath,{...family,latestId:id,revision:input.revision,reservedId:''});
    if(previous)tx.set(ramsPath(uid,previous.id),{...previous,supersededBy:id,supersededAt:at,updatedAt:at});
    return issued;
  });
}
