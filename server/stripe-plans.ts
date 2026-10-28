import Stripe from 'stripe';
import { randomUUID, createHash } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { SUBSCRIPTION_PLANS, STORE_ONLY_PURCHASE_MESSAGE, type SubscriptionTier } from '../src/subscriptions';

const live = (subscription:Stripe.Subscription) => !['canceled','incomplete_expired'].includes(subscription.status);
const priceId = (tier:SubscriptionTier) => process.env[tier==='business'?'STRIPE_BUSINESS_PRICE_ID':'STRIPE_PRO_PRICE_ID'];
export const stripePlan = (subscription:Stripe.Subscription):SubscriptionTier|null => {
  if(subscription.items.data.length!==1)return null;
  const id=subscription.items.data[0].price.id;
  return id===priceId('business')?'business':id===priceId('pro')?'pro':subscription.metadata.tier==='business'?'business':subscription.metadata.tier==='pro'?'pro':null;
};
export async function stripeSubscriptions(stripe:Stripe,uid:string,profile:Record<string,any>,allowMultiple=false) {
  const ids=[...new Set([profile.stripeSubscriptionId,profile.subscriptionId,profile.businessStripeSubscriptionId].filter(Boolean))] as string[];
  const found:Stripe.Subscription[]=[];
  for(const id of ids){
    const subscription=await stripe.subscriptions.retrieve(id);
    // Legacy checkouts stored the owner on the session, not the subscription.
    if(subscription.metadata.uid!==uid){
      const sessions=await stripe.checkout.sessions.list({subscription:id,limit:100});
      if(!sessions.data.some(s=>s.client_reference_id===uid))throw Error('Subscription ownership could not be verified. Contact support before paying again.');
    }
    if(live(subscription))found.push(subscription);
  }
  if(profile.stripeCustomerId){
    const subscriptions=await stripe.subscriptions.list({customer:profile.stripeCustomerId,status:'all',limit:100});
    for(const subscription of subscriptions.data)if(live(subscription)&&subscription.metadata.uid===uid&&!found.some(s=>s.id===subscription.id))found.push(subscription);
    if(subscriptions.has_more)throw Error('Subscription history needs support review before changing plans.');
  }
  if(found.length>1&&!allowMultiple)throw Error('More than one web subscription already exists. Contact support to reconcile them before changing plans. No new subscription has been started.');
  return found;
}
async function targetPrice(stripe:Stripe,tier:SubscriptionTier){
  const id=priceId(tier);
  if(!id)throw Error('Plan changes are not configured yet. Contact support; your existing subscription has not changed.');
  const price=await stripe.prices.retrieve(id);
  if(!price.active||price.currency!=='gbp'||price.unit_amount!==SUBSCRIPTION_PLANS[tier].monthlyPence||price.recurring?.interval!=='month'||price.recurring.interval_count!==1)throw Error('The configured monthly subscription price is invalid. No plan change has been started.');
  return price;
}
export async function stripePlanPortal(stripe:Stripe,subscription:Stripe.Subscription,tier:SubscriptionTier,returnUrl:string){
  if(!['active','trialing'].includes(subscription.status)||subscription.items.data.length!==1||subscription.schedule)throw Error('Manage the existing subscription and resolve any outstanding payment or scheduled change before switching plans. No second subscription has been created.');
  const target=await targetPrice(stripe,tier),current=subscription.items.data[0];
  const products=new Map<string,string[]>();
  for(const price of [current.price,target]){
    const product=typeof price.product==='string'?price.product:price.product.id;
    products.set(product,[...new Set([...(products.get(product)||[]),price.id])]);
  }
  const config=await stripe.billingPortal.configurations.create({
    business_profile:{headline:'Manage your Sparkys Mate subscription'},
    features:{subscription_update:{enabled:true,default_allowed_updates:['price'],proration_behavior:'always_invoice',trial_update_behavior:'end_trial',schedule_at_period_end:{conditions:[{type:'decreasing_item_amount'}]},products:[...products].map(([product,prices])=>({product,prices}))}},
  },{idempotencyKey:`plan-portal-${createHash('sha256').update(`${current.price.id}:${target.id}`).digest('hex')}`});
  return stripe.billingPortal.sessions.create({customer:typeof subscription.customer==='string'?subscription.customer:subscription.customer.id,configuration:config.id,return_url:returnUrl,
    flow_data:{type:'subscription_update_confirm',subscription_update_confirm:{subscription:subscription.id,items:[{id:current.id,price:target.id,quantity:1}]},after_completion:{type:'redirect',redirect:{return_url:returnUrl}}},
  });
}

// Serialise checkout/plan changes across devices, not just one disabled UI button.
export async function withBillingLock<T>(uid:string,work:()=>Promise<T>){
  const db=getFirestore(),ref=db.doc(`billingLocks/${uid}`),nonce=randomUUID();
  await db.runTransaction(async tx=>{const current=(await tx.get(ref)).data();if(current?.until>Date.now())throw Error('Another subscription request is in progress. Wait a moment and restore before trying again.');tx.set(ref,{nonce,until:Date.now()+300000});});
  try{return await work();}finally{await db.runTransaction(async tx=>{if((await tx.get(ref)).data()?.nonce===nonce)tx.delete(ref);});}
}

export async function startWebSubscription(stripe:Stripe,uid:string,email:string|undefined,tier:SubscriptionTier,appUrl:string){
  throw Error(STORE_ONLY_PURCHASE_MESSAGE);
}

export async function syncStripeSubscription(stripe:Stripe,subscriptionId:string,ownerHint?:string){
  const subscription=await stripe.subscriptions.retrieve(subscriptionId),db=getFirestore();
  let uid=subscription.metadata.uid||ownerHint;
  if(!uid){
    for(const field of ['stripeSubscriptionId','subscriptionId','businessStripeSubscriptionId']){const users=await db.collection('users').where(field,'==',subscription.id).limit(2).get();if(users.size>1)throw Error('Subscription has multiple owners.');if(users.size===1){uid=users.docs[0].id;break;}}
  }
  if(!uid)return;
  let tier=stripePlan(subscription);
  // Legacy Pro subscriptions had no tier metadata. Only a verified owning
  // checkout session can establish that legacy mapping.
  if(!tier){const sessions=await stripe.checkout.sessions.list({subscription:subscription.id,limit:100});if(sessions.data.some(s=>s.client_reference_id===uid))tier='pro';else throw Error('Unknown subscription price.');}
  const until=Math.max(0,...subscription.items.data.map(item=>item.current_period_end*1000));
  const active=['active','trialing'].includes(subscription.status),ref=db.doc(`users/${uid}`);
  await db.runTransaction(async tx=>{
    const profile=(await tx.get(ref)).data();
    if(profile?.stripeSubscriptionId&&profile.stripeSubscriptionId!==subscription.id&&profile.stripeUntil>Date.now())return;
    tx.set(ref,{stripeSubscriptionId:subscription.id,stripeCustomerId:typeof subscription.customer==='string'?subscription.customer:subscription.customer.id,stripeTier:tier,stripeUntil:active?until:0,
      subscriptionId:tier==='pro'?subscription.id:null,businessStripeSubscriptionId:tier==='business'?subscription.id:null,
      businessStripeUntil:active&&tier==='business'?until:0,isPro:(active&&tier==='pro')||(profile?.nativeSubscription?.tier==='pro'&&profile.nativeSubscription.expiresAt>Date.now()),pendingCheckoutId:null,updatedAt:new Date().toISOString()},{merge:true});
  });
}
