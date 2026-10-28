import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';

const port=process.env.INVOICE_TEST_PORT||'3001';
const child=spawn(process.execPath,['build/server/server.cjs'],{cwd:process.cwd(),env:{...process.env,NODE_ENV:'production',PORT:port},stdio:['ignore','pipe','pipe']});
let startup='';child.stdout.on('data',chunk=>{startup+=chunk.toString();});
let errors='';child.stderr.on('data',chunk=>{errors+=chunk.toString();});
const deadline=Date.now()+45000;
try {
  while(!startup.includes('Server running on')){
    if(child.exitCode!==null)throw Error('Server did not start. Check backend build/dependencies.');
    if(Date.now()>deadline)throw Error('Server startup timed out.');
    await new Promise(r=>setTimeout(r,100));
  }
  const origin=`http://127.0.0.1:${port}`;
  assert.equal((await (await fetch(origin+'/api/health')).json()).status,'ok');
  assert.equal((await fetch(origin+'/api/subscriptions/context')).status,401);
  assert.equal((await fetch(origin+'/api/subscriptions/restore',{method:'POST'})).status,401);
  const readiness=await (await fetch(origin+'/api/subscriptions/business/ready')).json();
  assert.equal(typeof readiness.ios,'boolean');assert.equal(typeof readiness.android,'boolean');
  const invalidBusiness=await fetch(origin+'/api/subscriptions/business/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({platform:'web',productId:'pro_subscription'})});
  assert.equal(invalidBusiness.status,400);
  const fakeProof=await fetch(origin+'/api/subscriptions/business/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({platform:'ios',productId:'business_subscription',transactionId:'invalid-proof'})});
  assert.equal(fakeProof.status,503);
  for(const path of ['/api/invoices','/api/invoices/not-owner/pdf','/api/invoices/not-owner/logo']){
    const response=await fetch(origin+path);assert.equal(response.status,401);assert.equal((await response.json()).error,'Sign in to access invoices.');
  }
  for(const action of ['issue','payment','reversePayment','credit','sent','void']){
    const response=await fetch(`${origin}/api/invoices/not-owner/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,401,action);
  }
  const invalid=await fetch(origin+'/api/invoices',{headers:{Authorization:'Bearer invalid-token'}});assert.equal(invalid.status,401);
  console.log('Real production server: health and all invoice read/write authentication gates passed; no financial record was created.');
}finally{
  const exit=once(child,'exit');child.kill();await Promise.race([exit,new Promise(r=>setTimeout(r,3000))]);
}
