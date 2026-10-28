import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLicence, assertGrantEligible } from '../server/invoiced-licences.ts';
import { hasBusinessAccess } from '../src/subscriptions.ts';
import { installWebBillingRoutes } from '../server/web-billing.ts';
import { startWebSubscription } from '../server/stripe-plans.ts';
import { Capacitor } from '@capacitor/core';
import { getApiBaseUrl, DEFAULT_API_BASE_URL } from '../src/services/api.ts';

const example = {licenceId:'example', plan:'business', organisation:'Example Ltd', invoiceReference:'INV-001', seats:2, memberUids:['one','two'], startsAt:'2026-10-01T00:00:00Z', expiresAt:'2026-11-01T00:00:00Z'};
test('invoice licences validate seats, dates and account identifiers', () => {
  assert.equal(validateLicence(example).memberUids.length,2);
  for (const change of [{seats:1},{memberUids:['one','one']},{memberUids:['bad/path']},{expiresAt:example.startsAt},{plan:'pro'},{startsAt:'2026-10-01'}]) assert.throws(()=>validateLicence({...example,...change}));
});
test('invoice grants expire, revoke, and include Business access', () => {
  const invoicedBusiness = {licenceId:'example', startsAt:100, expiresAt:200, revoked:false};
  assert.equal(hasBusinessAccess({invoicedBusiness},150),true);
  for (const now of [99,200,201]) assert.equal(hasBusinessAccess({invoicedBusiness},now),false);
  assert.equal(hasBusinessAccess({invoicedBusiness:{...invoicedBusiness,revoked:true}},150),false);
});
test('grant assignment blocks overlapping providers and other licences', () => {
  assert.doesNotThrow(()=>assertGrantEligible({},'example'));
  for (const profile of [null,{deletionPending:true},{isPro:true},{isBusiness:true},{nativeSubscription:{}},{stripeSubscriptionId:'sub'},{pendingCheckoutId:'checkout'},{businessUntil:1},{invoicedBusiness:{licenceId:'other',expiresAt:Date.now()+10000,revoked:false}}]) assert.throws(()=>assertGrantEligible(profile,'example'));
});
test('website checkout is disabled without contacting Stripe; management requires authentication', async () => {
  const routes = new Map();
  const app = {post:(path,handler)=>routes.set(path,handler)};
  installWebBillingRoutes(app,{stripe:null,verify:async()=>{throw Error('invalid');},profile:async()=>({}),returnUrl:'https://example.com'});
  const response = () => ({code:200,body:null,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
  const checkout=response();
  await routes.get('/api/create-checkout-session')({},checkout);
  assert.equal(checkout.code,410);
  assert.match(checkout.body.error,/Google Play or Apple/);
  const management=response();
  await routes.get('/api/subscriptions/manage-web')({header:()=>undefined},management);
  assert.equal(management.code,401);
});

test('legacy management permits cancellation, disables plan changes and verifies the account owner', async () => {
  const routes = new Map();
  const configs = [], sessions = [];
  const stripe = {
    subscriptions:{retrieve:async id=>({id,status:'active',customer:'cus_owner',metadata:{uid:'owner'}})},
    checkout:{sessions:{list:async()=>({data:[]})}},
    billingPortal:{configurations:{create:async config=>{configs.push(config);return {id:'config'};}},sessions:{create:async session=>{sessions.push(session);return {url:'https://billing.stripe.com/test'};}}},
  };
  installWebBillingRoutes({post:(path,handler)=>routes.set(path,handler)},{stripe,verify:async token=>({uid:token}),profile:async()=>({subscriptionId:'sub_one',businessStripeSubscriptionId:'sub_two'}),returnUrl:'https://example.com'});
  const response = () => ({code:200,body:null,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
  const owner=response();
  await routes.get('/api/subscriptions/manage-web')({header:()=> 'Bearer owner'},owner);
  assert.equal(owner.code,200);
  assert.equal(configs[0].features.subscription_cancel.enabled,true);
  assert.equal(configs[0].features.subscription_update.enabled,false);
  assert.equal(sessions[0].customer,'cus_owner');
  const stranger=response();
  await routes.get('/api/subscriptions/manage-web')({header:()=> 'Bearer stranger'},stranger);
  assert.equal(stranger.code,503);
  assert.equal(sessions.length,1);
  await assert.rejects(()=>startWebSubscription(null,'owner',undefined,'business','https://example.com'),/Google Play or Apple/);
});

test('ordinary web browsers use their own origin even with a Capacitor shim; native uses the corrected backend', () => {
  const originalWindow=globalThis.window, originalNative=Capacitor.isNativePlatform;
  try {
    globalThis.window={location:{origin:'http://localhost:3000',href:'http://localhost:3000/'},Capacitor:{}};
    Capacitor.isNativePlatform=()=>false;
    assert.equal(getApiBaseUrl(),'http://localhost:3000');
    Capacitor.isNativePlatform=()=>true;
    assert.equal(getApiBaseUrl(),DEFAULT_API_BASE_URL);
    assert.equal(DEFAULT_API_BASE_URL,'https://the-sparkys-mate-29962838005.europe-west1.run.app');
  } finally { globalThis.window=originalWindow; Capacitor.isNativePlatform=originalNative; }
});
