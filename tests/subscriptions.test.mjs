import test from 'node:test';
import assert from 'node:assert/strict';
import {SUBSCRIPTION_PLANS,hasBusinessAccess,storeTier,strongestStoreTier,validateBusinessStorePrice,planReplacement,androidReplacementToken,assertAppleSubscriptionGroup} from '../src/subscriptions.ts';
import {stripePlanPortal,stripeSubscriptions,stripePlan} from '../server/stripe-plans.ts';
import {appleBusinessEntitlement,playBusinessEntitlement} from '../server/store-entitlements.ts';
import {checkSubscriptionContext,loadSubscriptionContext} from '../src/subscription-context.ts';
import {businessOfferCopy,businessStoreProductIds,assertBusinessVerificationProduct} from '../src/subscriptions.ts';
import {validateReleaseConfig} from '../scripts/release-config.ts';

test('Android Business uses the exact registered Play spelling for lookup, restores and verification', () => {
  const ids = businessStoreProductIds('android', 'business_subscription');
  assert.deepEqual(ids, ['business_subsciption', 'business_subscription']);
  assert.equal(storeTier('business_subsciption', ['pro_subscription'], ids), 'business');
  assert.equal(planReplacement([{productId:'business_subsciption'}], 'pro', ['pro_subscription'], ids).tier, 'business');
  assert.equal(planReplacement([{productId:'pro_subscription'}], 'business', ['pro_subscription'], ids).productId, 'pro_subscription');
  assert.deepEqual(businessStoreProductIds('ios'), ['business_subscription']);
  assert.doesNotThrow(() => validateReleaseConfig({VITE_ANDROID_BUSINESS_PRODUCT_ID:'business_subsciption'}));
  assert.throws(() => validateReleaseConfig({VITE_IOS_BUSINESS_PRODUCT_ID:'business_subsciption'}));
});
test('Business checkout rejects an old backend or one that cannot verify the selected product', () => {
  assert.throws(() => assertBusinessVerificationProduct({android:true}, 'android', 'business_subsciption'), /server update/);
  assert.throws(() => assertBusinessVerificationProduct({businessProductIds:{android:['business_subscription']}}, 'android', 'business_subsciption'), /no payment/);
  assert.doesNotThrow(() => assertBusinessVerificationProduct({businessProductIds:{android:businessStoreProductIds('android')}}, 'android', 'business_subsciption'));
  assert.throws(() => assertBusinessVerificationProduct({businessProductIds:{android:'business_subsciption'}}, 'android', 'business_subsciption'));
});

const emptyContext = {invoicedBusiness:false,webActive:false,unknownLegacyPro:false,native:null};
test('subscription context retries an unauthorised response once with a fresh token', async () => {
  const refreshes = [];
  const calls = [];
  const context = await loadSubscriptionContext('/context', async refresh => {
    refreshes.push(refresh);
    return refresh ? 'fresh' : 'cached';
  }, async (_url, options) => {
    calls.push(options.headers.Authorization);
    return calls.length === 1 ? new Response(null, {status:401}) : Response.json(emptyContext);
  });
  assert.deepEqual(refreshes,[false,true]);
  assert.deepEqual(calls,['Bearer cached','Bearer fresh']);
  assert.deepEqual(context,emptyContext);
});
test('subscription context fails closed for backend outages and malformed responses', async () => {
  const token = async refresh => { assert.equal(refresh,false); return 'cached'; };
  await assert.rejects(loadSubscriptionContext('/context',token,async () => Response.json({error:'Account check unavailable'},{status:503})),/Account check unavailable/);
  await assert.rejects(loadSubscriptionContext('/context',token,async () => Response.json({})),/unexpected response/);
});
test('a linked subscription must be found on the original store before checkout', () => {
  const context = {...emptyContext,native:{provider:'android',tier:'pro'}};
  assert.throws(()=>checkSubscriptionContext(context,'android',false),/Restore/);
  assert.throws(()=>checkSubscriptionContext(context,'ios',true),/original Apple or Google Play store/);
  assert.doesNotThrow(()=>checkSubscriptionContext(context,'android',true));
  assert.doesNotThrow(()=>checkSubscriptionContext(emptyContext,'android',false));
});

const pro=['pro_subscription'],business=['business_subscription'];
test('Business offers eligible Google Play accounts one month free; Apple and Pro are unchanged',()=>{
  assert.equal(SUBSCRIPTION_PLANS.business.monthlyPence,1499);
  assert.equal(SUBSCRIPTION_PLANS.business.trialDays,0);
  assert.equal(SUBSCRIPTION_PLANS.business.androidTrialMonths,1);
  assert.equal(SUBSCRIPTION_PLANS.pro.monthlyPence,599);
  assert.equal(SUBSCRIPTION_PLANS.pro.trialDays,30);
});
test('Business trial wording is platform-specific and does not promise another trial for plan changes',()=>{
  assert.match(businessOfferCopy('android').price,/1 month free if eligible/);
  assert.match(businessOfferCopy('android').terms,/paid monthly plan may be offered/);
  for (const platform of ['ios','web']) assert.equal(businessOfferCopy(platform).price,'£14.99/month');
  assert.equal(businessOfferCopy('android',true).price,'£14.99/month');
  assert.match(businessOfferCopy('android',true).terms,/do not promise a new trial/);
});
test('Business validates the recurring monthly price after a zero-price trial',()=>{
  const product={currency:'GBP',priceAsDecimal:0,recurringPriceAsDecimal:14.99,recurringCurrency:'GBP',recurringBillingPeriod:'P1M'};
  assert.doesNotThrow(()=>validateBusinessStorePrice(product));
  assert.throws(()=>validateBusinessStorePrice({...product,recurringPriceAsDecimal:5.99}));
  assert.throws(()=>validateBusinessStorePrice({...product,recurringBillingPeriod:'P1Y'}));
  assert.throws(()=>validateBusinessStorePrice({currency:'GBP',priceAsDecimal:0}));
});
test('Business validates native UK pricing before payment and accepts positive local prices',()=>{
  assert.doesNotThrow(()=>validateBusinessStorePrice({currency:'GBP',priceAsDecimal:14.99}));
  assert.doesNotThrow(()=>validateBusinessStorePrice({currencyCode:'GBP',price:'14.99'}));
  assert.doesNotThrow(()=>validateBusinessStorePrice({currency:'EUR',priceAsDecimal:12}));
  for(const price of [0,5.99,10,14,100]) assert.throws(()=>validateBusinessStorePrice({currency:'GBP',priceAsDecimal:price}));
  assert.throws(()=>validateBusinessStorePrice({price:'N/A'}));
});
test('restores recognise exact tier IDs, not arbitrary products or Pro as Business',()=>{
  assert.equal(storeTier('pro_subscription',pro,business),'pro');
  assert.equal(storeTier('business_subscription',pro,business),'business');
  assert.equal(storeTier('unknown',pro,business),null);
  assert.equal(storeTier(null,pro,business),null);
  assert.equal(storeTier('same',['same'],['same']),null);
  assert.equal(strongestStoreTier([{productId:'pro_subscription'},{productId:'business_subscription'}],pro,business),'business');
  assert.equal(strongestStoreTier([{productId:'unknown'}],pro,business),null);
});
test('Business expiry, manual grants and independent Stripe/native sources',()=>{
  assert.equal(hasBusinessAccess({isPro:true},100),false);
  assert.equal(hasBusinessAccess(null,100),false);
  assert.equal(hasBusinessAccess({businessUntil:101},100),true);
  assert.equal(hasBusinessAccess({businessUntil:100},100),false);
  assert.equal(hasBusinessAccess({businessUntil:0,businessStripeUntil:102},100),true);
  assert.equal(hasBusinessAccess({businessUntil:102,businessStripeUntil:0},100),true);
  assert.equal(hasBusinessAccess({isBusiness:true},100),true);
});
test('Apple proof must belong to the exact app, product and requested transaction',()=>{
  const valid={bundleId:'app',productId:'business_subscription',transactionId:'123',originalTransactionId:'100',expiresDate:200};
  assert.deepEqual(appleBusinessEntitlement(valid,business[0],'app','123'),{expiresAt:200,key:'ios:100'});
  for(const change of [{bundleId:'another-app'},{productId:'pro_subscription'},{transactionId:'456'},{originalTransactionId:undefined}]) assert.throws(()=>appleBusinessEntitlement({...valid,...change},business[0],'app','123'));
  assert.equal(appleBusinessEntitlement({...valid,revocationDate:50},business[0],'app','123').expiresAt,0);
  assert.throws(()=>appleBusinessEntitlement({...valid,isUpgraded:true},business[0],'app','123'),/replaced/);
});
test('Google Play active, grace and cancelled-to-period-end states; no paused/pending/expired grants',()=>{
  const lineItems=[{productId:business[0],expiryTime:'2027-01-01T00:00:00Z'}];
  for(const state of ['ACTIVE','IN_GRACE_PERIOD','CANCELED']) assert.equal(playBusinessEntitlement({subscriptionState:`SUBSCRIPTION_STATE_${state}`,lineItems},business[0],'secret-token').expiresAt,Date.parse(lineItems[0].expiryTime));
  for(const state of ['EXPIRED','PENDING','ON_HOLD','PAUSED','PENDING_PURCHASE_CANCELED']) assert.equal(playBusinessEntitlement({subscriptionState:`SUBSCRIPTION_STATE_${state}`,lineItems},business[0],'secret-token').expiresAt,0);
  assert.equal(playBusinessEntitlement({subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',lineItems:[{...lineItems[0],productId:pro[0]}]},business[0],'token').expiresAt,0);
});

test('both upgrade and downgrade identify the original store plan rather than a new subscription',()=>{
  const receipt=JSON.stringify({purchaseToken:'private-test-token'});
  const upgrade=planReplacement([{productId:pro[0],receipt}],'business',pro,business);
  assert.equal(upgrade.productId,pro[0]);assert.equal(upgrade.samePlan,false);
  assert.equal(androidReplacementToken(upgrade.purchase.receipt),'private-test-token');
  const downgrade=planReplacement([{productId:business[0],receipt}],'pro',pro,business);
  assert.equal(downgrade.productId,business[0]);assert.equal(downgrade.samePlan,false);
  assert.equal(planReplacement([{productId:pro[0]}],'pro',pro,business).samePlan,true);
  assert.equal(planReplacement([],'pro',pro,business),null);
  assert.throws(()=>planReplacement([{productId:pro[0]},{productId:business[0]}],'business',pro,business),/More than one/);
});
test('missing or malformed old tokens fail closed instead of buying a second plan',()=>{
  for(const receipt of [undefined,'','invalid','{}','{"purchaseToken":null}','{"purchaseToken":123}'])assert.throws(()=>androidReplacementToken(receipt),/No new payment/);
});
test('Apple rejects missing products, missing groups and separate subscription groups',()=>{
  const products=[{productId:pro[0],subscriptionGroupId:'one'},{productId:business[0],subscriptionGroupId:'one'}];
  assert.doesNotThrow(()=>assertAppleSubscriptionGroup(products,pro,business));
  assert.throws(()=>assertAppleSubscriptionGroup([products[0]],pro,business),/same Apple subscription group/);
  assert.throws(()=>assertAppleSubscriptionGroup([products[0],{...products[1],subscriptionGroupId:'two'}],pro,business));
  assert.throws(()=>assertAppleSubscriptionGroup([{productId:pro[0]},products[1]],pro,business));
});

function stripeFixture(){
  const calls=[];
  const prices={price_pro:{id:'price_pro',product:'prod_pro',currency:'gbp',unit_amount:599,active:true,recurring:{interval:'month',interval_count:1}},price_business:{id:'price_business',product:'prod_business',currency:'gbp',unit_amount:1499,active:true,recurring:{interval:'month',interval_count:1}}};
  const subscription={id:'sub_existing',status:'active',customer:'cus_owner',metadata:{uid:'owner',tier:'pro'},items:{data:[{id:'si_existing',price:prices.price_pro}]}};
  const stripe={prices:{retrieve:async id=>prices[id]},billingPortal:{configurations:{create:async(...args)=>{calls.push(['config',...args]);return {id:'bpc_test'};}},sessions:{create:async args=>{calls.push(['portal',args]);return {url:'https://billing.stripe.com/test'};}}},checkout:{sessions:{list:async()=>({data:[]}),create:()=>{throw Error('Must never start Checkout for an existing subscription');}}},subscriptions:{retrieve:async()=>subscription,list:async()=>({data:[subscription],has_more:false})}};
  return {stripe,calls,prices,subscription};
}
test('web upgrade and downgrade confirm replacement of exactly the same subscription item',async()=>{
  process.env.STRIPE_PRO_PRICE_ID='price_pro';process.env.STRIPE_BUSINESS_PRICE_ID='price_business';
  try{
    for(const tier of ['business','pro']){
      const f=stripeFixture();if(tier==='pro'){f.subscription.items.data[0].price=f.prices.price_business;f.subscription.metadata.tier='business';}
      await stripePlanPortal(f.stripe,f.subscription,tier,'https://app.example/');
      const portal=f.calls.find(c=>c[0]==='portal')[1];
      assert.equal(portal.flow_data.subscription_update_confirm.subscription,'sub_existing');
      assert.deepEqual(portal.flow_data.subscription_update_confirm.items,[{id:'si_existing',price:`price_${tier}`,quantity:1}]);
      const config=f.calls.find(c=>c[0]==='config')[1];
      assert.deepEqual(config.features.subscription_update.schedule_at_period_end.conditions,[{type:'decreasing_item_amount'}]);
      assert.equal(config.features.subscription_update.proration_behavior,'always_invoice');
      assert.equal(config.features.subscription_update.trial_update_behavior,'end_trial');
      // A formerly Business subscription's metadata is stale after a portal downgrade.
      f.subscription.items.data[0].price=f.prices.price_pro;f.subscription.metadata.tier='business';
      assert.equal(stripePlan(f.subscription),'pro');
    }
  }finally{delete process.env.STRIPE_PRO_PRICE_ID;delete process.env.STRIPE_BUSINESS_PRICE_ID;}
});
test('web replacement blocks invalid pricing, unpaid subscriptions and missing configuration without new Checkout',async()=>{
  process.env.STRIPE_BUSINESS_PRICE_ID='price_business';
  try{
    const f=stripeFixture();f.prices.price_business.unit_amount=599;
    await assert.rejects(()=>stripePlanPortal(f.stripe,f.subscription,'business','https://app.example/'),/price is invalid/);
    f.prices.price_business.unit_amount=1499;f.subscription.status='past_due';
    await assert.rejects(()=>stripePlanPortal(f.stripe,f.subscription,'business','https://app.example/'),/No second subscription/);
    f.subscription.status='active';delete process.env.STRIPE_BUSINESS_PRICE_ID;
    await assert.rejects(()=>stripePlanPortal(f.stripe,f.subscription,'business','https://app.example/'),/not configured/);
    assert.equal(f.calls.length,0);
  }finally{delete process.env.STRIPE_BUSINESS_PRICE_ID;}
});
test('legacy web ownership and duplicate subscriptions are checked before offering a plan change',async()=>{
  const f=stripeFixture();
  assert.equal((await stripeSubscriptions(f.stripe,'owner',{subscriptionId:'sub_existing',businessStripeSubscriptionId:'sub_existing'})).length,1);
  await assert.rejects(()=>stripeSubscriptions(f.stripe,'another-owner',{subscriptionId:'sub_existing'}),/ownership/);
  f.subscription.metadata={};f.stripe.checkout.sessions.list=async()=>({data:[{client_reference_id:'owner'}]});
  assert.equal((await stripeSubscriptions(f.stripe,'owner',{subscriptionId:'sub_existing'})).length,1);
  f.subscription.metadata={uid:'owner'};
  f.stripe.subscriptions.list=async()=>({data:[f.subscription,{...f.subscription,id:'sub_duplicate'}],has_more:false});
  await assert.rejects(()=>stripeSubscriptions(f.stripe,'owner',{stripeCustomerId:'cus_owner'}),/More than one web subscription/);
});
