import test from 'node:test';
import assert from 'node:assert/strict';
import {ramsFixture} from './rams-fixture.mjs';
import {blankCompany,blankProject} from '../src/business/model.ts';
import {newRams,copyRams,ramsIssues,outstandingActions,riskValue,assertDraft} from '../src/business/rams/model.ts';
import {issueRams,ramsPath,canonicalJson} from '../src/business/rams/engine.ts';
import {ramsPdf} from '../src/business/rams/pdf.ts';
import {capacityUsed,reserveStorage} from '../server/storage-allowance.ts';
import {readFile} from 'node:fs/promises';

function repository(){
  const data=new Map([['users/a/business/project-a',{kind:'project',deleted:false}]]),files=new Map();let queue=Promise.resolve();
  const controls={pdfFail:false,saveFail:false,commitFail:false};
  return {data,files,controls,
    transaction(work){const action=queue.then(async()=>{const copy=structuredClone(data);const result=await work({get:async path=>structuredClone(copy.get(path)),set:(path,value)=>copy.set(path,structuredClone(value))});if(controls.commitFail&&result?.state==='Issued')throw Error('Final commit failed');data.clear();copy.forEach((value,key)=>data.set(key,value));return result;});queue=action.catch(()=>{});return action;},
    async pdf(record){if(controls.pdfFail)throw Error('PDF failed');return new Blob([record.reference+'|'+record.revision+'|'+record.snapshot.company.name]);},
    async putPdf(path,blob){if(controls.saveFail)throw Error('Storage full');if(!files.has(path))files.set(path,await blob.text());},
  };
}
const issue=(repo,draft,id='doc-a',uid='a')=>issueRams(repo,uid,'project-a',id,draft,true,true,'QA confirmer',()=> '2026-10-20T12:00:00Z');

test('blank RAMS has neutral empty prompts, optional unscored risk and no bank details',()=>{
  const d=newRams(blankProject('001'),{...blankCompany(),bankDetails:'private',paymentInstructions:'private'});
  assert.equal(d.hazards[0].controls,'');assert.equal(d.hazards[0].residual,null);assert.equal(d.company.bankDetails,'');
  assert.ok(d.sections.every(s=>!s.content&&!s.notApplicable));assert.ok(ramsIssues(d).length>0);
});
test('complete user assessment validates without scoring and explicit review is required',async()=>{
  const d=ramsFixture();assertDraft(d);assert.deepEqual(ramsIssues(d),[]);
  await assert.rejects(()=>issueRams(repository(),'a','project-a','doc-a',d,false,false,'Name'),/Confirm/);
  d.hazards[0].further='QA required action';assert.ok(ramsIssues(d).some(s=>s.includes('responsible person')));
  Object.assign(d.hazards[0],{responsible:'QA person',due:'2026-10-21'});assert.equal(outstandingActions(d).length,1);
  await assert.rejects(()=>issueRams(repository(),'a','project-a','doc-a',d,true,false,'Name'),/Confirm/);
});
test('risk ratings reject incomplete/out-of-range scores and never imply safety',()=>{
  const d=ramsFixture();d.hazards[0].residual={likelihood:1,severity:null};assert.ok(ramsIssues(d).some(s=>s.includes('select both')));
  assert.equal(riskValue(null),null);assert.equal(riskValue({likelihood:5,severity:5}),25);
});
test('duplication and templates reset review and all briefing/signature information',()=>{
  const d=ramsFixture();Object.assign(d,{reviewedBy:'old reviewer',reviewDate:'2026-12-01',copiedReviewed:true});
  d.briefings=[{id:'b',person:'old',date:'2026-10-20',revision:1,acknowledged:true,signature:'old signature'}];
  const copy=copyRams(d);assert.notEqual(copy.familyId,d.familyId);assert.notEqual(copy.reference,d.reference);
  assert.deepEqual(copy.briefings,[]);assert.equal(copy.reviewedBy,'');assert.equal(copy.reviewDate,'');assert.equal(copy.copiedReviewed,false);
  assert.ok(ramsIssues(copy).some(s=>s.includes('copied')));assert.equal(d.briefings.length,1);
  const revision=copyRams(d,true,'old-id');assert.equal(revision.familyId,d.familyId);assert.equal(revision.revision,2);assert.equal(revision.previousIssuedId,'old-id');
});
test('PDF generation/storage failures are not issued and retry uses the same identity',async()=>{
  const repo=repository(),d=ramsFixture();repo.controls.pdfFail=true;
  await assert.rejects(()=>issue(repo,d),/PDF failed/);assert.equal(repo.data.get(ramsPath('a','doc-a')).state,'Preparing');
  assert.equal(repo.files.size,0);repo.controls.pdfFail=false;repo.controls.saveFail=true;
  await assert.rejects(()=>issue(repo,d),/Storage full/);assert.equal(repo.data.get(ramsPath('a','doc-a')).state,'Preparing');
  repo.controls.saveFail=false;const result=await issue(repo,d);assert.equal(result.state,'Issued');assert.equal(repo.files.size,1);
  await issue(repo,d);assert.equal(repo.files.size,1);assert.equal(repo.data.get('users/a/ramsProjectLocks/project-a').retained,true);
});
test('reserved issue rejects changed content; canonical ordering survives Firestore map ordering',async()=>{
  const repo=repository(),d=ramsFixture();repo.controls.saveFail=true;await assert.rejects(()=>issue(repo,d));
  await assert.rejects(()=>issue(repo,{...d,title:'different'}),/saved snapshot/);
  repo.controls.saveFail=false;
  const reordered=JSON.parse(canonicalJson(d));assert.equal((await issue(repo,reordered)).state,'Issued');
});
test('a stored PDF survives a failed final commit and the same issue safely completes on retry',async()=>{
  const repo=repository(),draft=ramsFixture();repo.controls.commitFail=true;
  await assert.rejects(()=>issue(repo,draft),/Final commit/);
  const original=repo.files.get('rams/a/doc-a/original.pdf');assert.ok(original);
  assert.equal(repo.data.get(ramsPath('a','doc-a')).state,'Preparing');
  repo.controls.commitFail=false;assert.equal((await issue(repo,draft)).state,'Issued');
  assert.equal(repo.files.size,1);assert.equal(repo.files.get('rams/a/doc-a/original.pdf'),original);
});
test('new revisions preserve previous snapshots and stored originals, superseding only after success',async()=>{
  const repo=repository(),d=ramsFixture();const first=await issue(repo,d),original=repo.files.get(first.pdfPath);
  const revision=copyRams(d,true,first.id);revision.copiedReviewed=true;revision.company.name='Changed business';
  repo.controls.saveFail=true;await assert.rejects(()=>issue(repo,revision,'doc-b'));assert.equal(repo.data.get(ramsPath('a','doc-a')).supersededBy,undefined);
  repo.controls.saveFail=false;await issue(repo,revision,'doc-b');
  const retained=repo.data.get(ramsPath('a','doc-a'));assert.equal(retained.supersededBy,'doc-b');assert.deepEqual(retained.snapshot,first.snapshot);assert.equal(repo.files.get(first.pdfPath),original);
});
test('simultaneous revision attempts cannot both replace the same revision',async()=>{
  const repo=repository(),d=ramsFixture();const first=await issue(repo,d);
  const revised=copyRams(d,true,first.id);revised.copiedReviewed=true;
  const results=await Promise.allSettled([issue(repo,revised,'doc-b'),issue(repo,revised,'doc-c')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});
test('issued records are account-scoped and cannot be moved across projects',async()=>{
  const repo=repository(),d=ramsFixture();await issue(repo,d);
  await assert.rejects(()=>issue(repo,d,'doc-a','other-owner'),/Project/);
  assert.throws(()=>ramsPath('a','../other'),/identity/);
  const revision=copyRams(d,true,'doc-a');revision.copiedReviewed=true;
  repo.data.set('users/a/business/project-b',{kind:'project',deleted:false});
  await assert.rejects(()=>issueRams(repo,'a','project-b','next',revision,true,true,'Name'),/cannot be moved/);
});
test('storage usage counts originals/attachments once and releases expired unuploaded reservations',()=>{
  const files=[{path:'pdf-a',bytes:80},{path:'photo-a',bytes:20}];
  assert.equal(capacityUsed(files,[{path:'pdf-a',bytes:80,expiresAt:200},{path:'pending',bytes:30,expiresAt:200},{path:'abandoned',bytes:50,expiresAt:99}],100),130);
});
test('storage reservations enforce capacity, permit retry at full capacity and avoid concurrent overbooking',async()=>{
  const original=process.env.BUSINESS_STORAGE_LIMIT_BYTES;process.env.BUSINESS_STORAGE_LIMIT_BYTES=String(8*1024*1024);
  try{
    const reservations=new Map();let queue=Promise.resolve();
    const collection={limit:()=>collection,doc:id=>({id})};
    const db={collection:()=>collection,runTransaction:work=>{const action=queue.then(()=>work({get:async()=>({size:reservations.size,docs:[...reservations].map(([id,value])=>({id,data:()=>value}))}),set:(ref,data)=>reservations.set(ref.id,data),delete:ref=>reservations.delete(ref.id)}));queue=action.catch(()=>{});return action;}};
    let stored=[];const bucket={getFiles:async({prefix})=>[stored.filter(file=>file.name.startsWith(prefix)),null]};
    const attempts=await Promise.allSettled([reserveStorage(db,bucket,'a','first','rams/a/first/original.pdf',8*1024*1024,'first','rams'),reserveStorage(db,bucket,'a','second','rams/a/second/original.pdf',1,'second','rams')]);
    assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(reservations.size,1);
    await reserveStorage(db,bucket,'a','first','rams/a/first/original.pdf',8*1024*1024,'first','rams');assert.equal(reservations.size,1);
    stored=[{name:'rams/a/first/original.pdf',metadata:{size:String(8*1024*1024)}}];
    await reserveStorage(db,bucket,'a','first','rams/a/first/original.pdf',8*1024*1024,'first','rams');
    await assert.rejects(()=>reserveStorage(db,bucket,'a','third','rams/a/third/original.pdf',1,'third','rams'),/storage is full/);
  }finally{if(original===undefined)delete process.env.BUSINESS_STORAGE_LIMIT_BYTES;else process.env.BUSINESS_STORAGE_LIMIT_BYTES=original;}
});
test('RAMS PDFs generate with multipage long assessments, watermark drafts and omit private financial data',async()=>{
  const d=ramsFixture();d.hazards=Array.from({length:12},(_,i)=>({...d.hazards[0],id:'h'+i,hazard:'QA long description '.repeat(100)}));
  const draft=ramsPdf(d),issued=ramsPdf(d,undefined,true,{name:'QA confirmer',at:'2026-10-20T12:00:00Z'});
  const raw=await draft.text();assert.match(raw,/DRAFT/);assert.doesNotMatch(await issued.text(),/PRIVATE_BANK_SENTINEL/);
  assert.ok((raw.match(/\/Type \/Page\b/g)||[]).length>5);assert.ok(issued.size>10000);
});
test('backend rules protect original RAMS, private templates, signatures and retained project deletion',async()=>{
  const rules=await readFile(new URL('../firestore.rules',import.meta.url),'utf8'),storage=await readFile(new URL('../storage.rules',import.meta.url),'utf8');
  assert.match(rules,/match \/rams\/\{id\}.*isOwner\(userId\).*write: if false/);
  assert.match(rules,/ramsProjectLocks\/\$\(recordId\)/);assert.match(rules,/'ramsDraft','ramsTemplate'/);
  assert.match(storage,/match \/rams\/\{uid\}\/\{documentId\}\/\{fileId\}/);assert.match(storage,/permit.expiresAt > request.time/);
});
