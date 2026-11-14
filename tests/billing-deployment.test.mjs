import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectBillingDeployment} from '../scripts/check-billing-deployment.mjs';
import {installSubscriptionRoutes} from '../server/subscriptions.ts';
import {assertBusinessVerificationProduct} from '../src/subscriptions.ts';

const mock = data => async () => Response.json(data);
test('live checker distinguishes the exact legacy response from a supported deployment', async () => {
  assert.equal((await inspectBillingDeployment(undefined,{fetchImpl:mock({ios:true,android:true})})).status,'legacy_backend');
  const ready = {android:true,businessProductIds:{android:['business_subsciption','business_subscription']}};
  const result = await inspectBillingDeployment(undefined,{fetchImpl:async (url,options) => {
    assert.ok(new URL(url).searchParams.has('_billingCheck'));
    assert.equal(options.cache,'no-store');
    assert.equal(options.headers['Cache-Control'],'no-cache');
    return Response.json(ready);
  }});
  assert.equal(result.ok,true);
});
test('checker fails closed for wrong products, disabled flags, HTTP and malformed replies', async () => {
  const check = data => inspectBillingDeployment(undefined,{fetchImpl:mock(data)});
  assert.equal((await check({android:true,businessProductIds:{android:['business_subscription']}})).status,'product_not_supported');
  assert.equal((await check({android:false,businessProductIds:{android:['business_subsciption']}})).status,'verification_disabled');
  assert.equal((await check({})).status,'unexpected_response');
  assert.equal((await check({android:true,businessProductIds:{android:['someone@example.com']}})).status,'unexpected_response');
  assert.equal((await inspectBillingDeployment(undefined,{fetchImpl:async () => new Response('Unavailable',{status:503})})).status,'http_error');
  assert.equal((await inspectBillingDeployment(undefined,{fetchImpl:async () => new Response('<html>Old app</html>')})).status,'unexpected_response');
  const failed = await inspectBillingDeployment(undefined,{fetchImpl:async () => {throw Error('private response');}});
  assert.equal(failed.status,'unreachable');
  assert.ok(!JSON.stringify(failed).includes('private response'));
  await assert.rejects(inspectBillingDeployment('https://user:password@example.com'));
});
test('real server readiness advertises Android aliases accepted by the app, without accessing purchases', async () => {
  const old = process.env.PLAY_BILLING_VERIFICATION_ENABLED;
  process.env.PLAY_BILLING_VERIFICATION_ENABLED = 'true';
  try {
    const routes = new Map();
    installSubscriptionRoutes({get:(url,handler) => routes.set(url,handler),post:() => {}});
    let payload;
    routes.get('/api/subscriptions/business/ready')({}, {
      setHeader:(name,value) => assert.equal(`${name}:${value}`,'Cache-Control:no-store'),
      json:value => {payload=value;},
    });
    assert.equal(payload.android,true);
    assert.doesNotThrow(() => assertBusinessVerificationProduct(payload,'android','business_subsciption'));
    assert.ok(!payload.businessProductIds.ios.includes('business_subsciption'));
    assert.equal((await inspectBillingDeployment(undefined,{fetchImpl:mock(payload)})).ok,true);
  } finally {
    if (old === undefined) delete process.env.PLAY_BILLING_VERIFICATION_ENABLED;
    else process.env.PLAY_BILLING_VERIFICATION_ENABLED=old;
  }
});
