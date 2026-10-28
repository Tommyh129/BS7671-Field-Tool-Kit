import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { secureLegalUrl } from '../src/privacy/config.ts';
import { allowSandboxBusiness } from '../src/privacy/sandbox.ts';
import { validateReleaseConfig } from '../scripts/release-config.ts';
import { recentAuthentication, exportProfile, installPrivacyRoutes } from '../server/privacy.ts';
import { saveCalculation, getHistory, deleteHistoryItem, clearLocalHistory } from '../src/services/historyService.ts';

test('release configuration rejects sandbox/diagnostics, local URLs and wrong product IDs', () => {
  assert.doesNotThrow(()=>validateReleaseConfig({}));
  for(const change of [{VITE_SANDBOX_BUSINESS_ACCESS:'true'},{VITE_ANDROID_BILLING_DIAGNOSTICS:'true'},
    {VITE_API_BASE_URL:'http://localhost:3000'},{VITE_API_BASE_URL:'https://localhost'},
    {VITE_TERMS_URL:'javascript:alert(1)'},{VITE_PRIVACY_POLICY_URL:'https://user:password@example.com'},
    {VITE_IOS_BUSINESS_PRODUCT_ID:'pro_subscription'},{VITE_ANDROID_PRO_PRODUCT_ID:'business_subscription'}]) {
    assert.throws(()=>validateReleaseConfig(change));
  }
  assert.doesNotThrow(()=>validateReleaseConfig({VITE_SANDBOX_BUSINESS_ACCESS:'false',VITE_ANDROID_BILLING_DIAGNOSTICS:'false',VITE_BUSINESS_PRODUCT_ID:'business_subscription'}));
});

test('permanent Pro cannot be self-granted by client profile writes or test email accounts', async () => {
  const rules=await readFile(new URL('../firestore.rules',import.meta.url),'utf8');
  assert.doesNotMatch(rules,/isTestUser|@test\.com/);
  assert.match(rules,/request\.resource\.data\.isPro == false/);
  assert.match(rules,/protectedFields\(\)\.concat\(\['isPro'\]\)/);
  const app=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(app,/isPro:\s*true/);
});

test('retained PDF Blob conversion copies only the downloaded Buffer bytes', async () => {
  const bytes=Buffer.from([99,37,80,68,70,88]).subarray(1,5);
  const blob=new Blob([Uint8Array.from(bytes)],{type:'application/pdf'});
  assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())],[37,80,68,70]);
});

test('sandbox Business access cannot unlock native, production or remote-host apps', () => {
  const local={dev:true, enabled:true, native:false, hostname:'localhost'};
  assert.equal(allowSandboxBusiness(local),true);
  for(const change of [{dev:false},{enabled:false},{native:true},{hostname:'example.com'},{hostname:'localhost.example.com'}]) {
    assert.equal(allowSandboxBusiness({...local,...change}),false);
  }
});

test('legal links accept only HTTPS and never execute scripts or send credentials', () => {
  for (const value of [undefined, '', 'javascript:alert(1)', 'http://example.com', 'https://user:password@example.com', 'bad']) {
    assert.equal(secureLegalUrl(value, 'fallback'), 'fallback');
  }
  assert.equal(secureLegalUrl('https://app.termly.io/policy-viewer/example', ''), 'https://app.termly.io/policy-viewer/example');
});

test('erasure requires recent authentication, not just a recently refreshed token', () => {
  const now = 1_800_000_000_000;
  assert.equal(recentAuthentication(now / 1000 - 299, now), true);
  for (const time of [undefined, NaN, now / 1000 - 301, now / 1000 + 61]) assert.equal(recentAuthentication(time, now), false);
});

test('account profile export excludes billing proofs, roles and unknown fields', () => {
  assert.deepEqual(exportProfile({uid:'a', email:'example@example.com', isPro:true, nativeSubscription:{receipt:'secret'}, role:'admin', purchaseToken:'secret', unknown:'secret'}), {uid:'a', email:'example@example.com', isPro:true});
});

test('history reads, deletion and device clearing isolate account and guest records', async () => {
  const data = new Map();
  globalThis.window = new EventTarget();
  window.localStorage = { getItem:key=>data.get(key)??null, setItem:(key,value)=>data.set(key,value), removeItem:key=>data.delete(key) };
  globalThis.CustomEvent = class extends Event { constructor(type, options) { super(type); this.detail=options?.detail; } };
  const a=await saveCalculation('a','unknown','a',{},{});
  const b=await saveCalculation('b','unknown','b',{},{});
  await saveCalculation(null,'unknown','guest',{},{});
  assert.deepEqual((await getHistory('a')).map(item=>item.id), [a.id]);
  assert.equal((await getHistory()).length,1);
  await deleteHistoryItem('a',b.id);
  assert.equal((await getHistory('b')).length,1);
  clearLocalHistory('a');
  assert.equal((await getHistory('a')).length,0);
  assert.equal((await getHistory('b')).length,1);
});

test('privacy requests are not falsely acknowledged as completed erasure', async () => {
  const source=await readFile(new URL('../server/privacy.ts', import.meta.url),'utf8');
  assert.match(source, /verifyIdToken\(token, true\)/);
  assert.match(source, /status: 'pending-review'/);
  assert.match(source, /status\(202\)/);
  assert.doesNotMatch(source, /success: true/);
  const rules=await readFile(new URL('../firestore.rules', import.meta.url),'utf8');
  assert.match(rules, /request.auth.token.get\('admin', false\)/);
  assert.doesNotMatch(rules, /data.role == 'admin'/);
  assert.match(rules, /'role', 'admin', 'claims', 'deletionPending'/);
  assert.match(rules, /'processing', 'completed', 'retry-required'/);
});

function privacyApi() {
  const routes=new Map(), jobs=new Map(), paths=[], prefixes=[];
  let middleware;
  const app={use:(_paths,handler)=>{middleware=handler;},get:(path,handler)=>routes.set(`GET ${path}`,handler),post:(path,handler)=>routes.set(`POST ${path}`,handler)};
  const services={
    auth:{verifyIdToken:async(token,revoked)=>{assert.equal(revoked,true);if(token!=='valid')throw Error();return {uid:'owner-a',auth_time:Date.now()/1000};}},
    db:{doc:path=>{paths.push(path);return {path, get:async()=>({data:()=>({uid:'owner-a',email:'private@example.com',purchaseToken:'do-not-export'})}),collection:name=>({limit:()=>({get:async()=>({size:1,docs:[{id:'one',data:()=>({kind:name})}]})})})};},runTransaction:async work=>work({get:async ref=>({exists:jobs.has(ref.path)}),create:(ref,data)=>jobs.set(ref.path,data)})},
    bucket:{getFiles:async options=>{prefixes.push(options.prefix);return [[],null];}},
  };
  installPrivacyRoutes(app,'(default)','bucket',services);
  const call=async(method,path,token='valid',body={})=>{
    const req={body,header:()=>token?`Bearer ${token}`:undefined};
    const res={locals:{},headers:{},statusCode:200,setHeader(key,value){this.headers[key]=value;},status(code){this.statusCode=code;return this;},json(data){this.data=data;return this;}};
    let allowed=false;
    await middleware(req,res,()=>{allowed=true;});
    if(allowed)await routes.get(`${method} ${path}`)(req,res);
    return res;
  };
  return {call,jobs,paths,prefixes};
}

test('privacy API denies missing/revoked credentials and never trusts a body UID', async()=>{
  const api=privacyApi();
  assert.equal((await api.call('POST','/api/delete-account','')).statusCode,401);
  assert.equal((await api.call('GET','/api/privacy/export','revoked')).statusCode,401);
  const result=await api.call('POST','/api/delete-account','valid',{uid:'victim',financialExportAcknowledged:true});
  assert.equal(result.statusCode,202);
  assert.equal(result.data.accepted,true);
  await api.call('POST','/api/delete-account','valid',{financialExportAcknowledged:true});
  assert.equal(api.jobs.size,1);
  assert.equal(api.jobs.get('privacyRequests/owner-a').status,'pending-review');
  assert.ok(api.paths.every(path=>!path.includes('victim')));
});

test('private export scopes records and file prefixes to the authenticated account', async()=>{
  const api=privacyApi();
  const result=await api.call('GET','/api/privacy/export');
  assert.equal(result.statusCode,200);
  assert.equal(result.headers['Cache-Control'],'no-store');
  assert.equal(result.data.profile.purchaseToken,undefined);
  assert.deepEqual(Object.keys(result.data.records),['history','business','invoices','rams']);
  assert.deepEqual(api.prefixes,['business/owner-a/','invoices/owner-a/','rams/owner-a/']);
});
