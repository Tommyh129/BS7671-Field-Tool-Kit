export type SubscriptionTier = 'pro' | 'business';
export type BillingProvider = 'ios' | 'android' | 'stripe';
// Play Console's existing Business product was registered with this spelling.
// Keep the canonical ID as an alias for existing configuration and purchases.
export function businessStoreProductIds(platform: string, configured?: string) {
  return [...new Set([
    ...(platform === 'android' ? ['business_subsciption'] : []),
    configured?.trim(),
    'business_subscription',
  ].filter((id): id is string => Boolean(id)))];
}
export function assertBusinessVerificationProduct(ready: {businessProductIds?:Record<string, unknown>}, platform: string, productId: string) {
  const ids = ready.businessProductIds?.[platform];
  if (!Array.isArray(ids) || !ids.includes(productId)) {
    throw Error('Business purchase verification needs a server update for this product. Contact support; no payment has been started.');
  }
}
export interface StoreSubscription {provider:'ios'|'android';tier:SubscriptionTier;expiresAt:number}
export const SUBSCRIPTION_PLANS = {
  pro: { name: 'Pro', monthlyPence: 599, price: '£5.99/month', trialDays: 30 },
  business: { name: 'Business', monthlyPence: 1499, price: '£14.99/month', trialDays: 0, androidTrialMonths: 1 },
} as const;

export interface BusinessAccess {
  invoicedBusiness?: { licenceId: string; startsAt: number; expiresAt: number; revoked: boolean };
  // Manual grants are Admin SDK/console only. Store/Stripe grants have an expiry.
  isBusiness?: boolean;
  businessUntil?: number;
  businessStripeUntil?: number;
  nativeSubscription?: StoreSubscription;
  stripeTier?: SubscriptionTier;
  stripeUntil?: number;
}
export function hasBusinessAccess(profile: BusinessAccess | null | undefined, now = Date.now()) {
  return hasInvoicedBusinessAccess(profile, now) || profile?.isBusiness === true || Math.max(profile?.businessUntil || 0, profile?.businessStripeUntil || 0) > now;
}
export function hasInvoicedBusinessAccess(profile: BusinessAccess | null | undefined, now = Date.now()) {
  const grant = profile?.invoicedBusiness;
  return !!grant && typeof grant.licenceId === 'string' && !!grant.licenceId && grant.revoked === false
    && Number.isSafeInteger(grant.startsAt) && Number.isSafeInteger(grant.expiresAt)
    && grant.startsAt <= now && grant.expiresAt > now;
}
export const STORE_ONLY_PURCHASE_MESSAGE = 'New subscriptions are available only in the Android or iOS app through Google Play or Apple. Existing subscribers can sign in and restore access.';
export function storeTier(productId: string | null | undefined, proIds: string[], businessIds: string[]): SubscriptionTier | null {
  if (!productId || (proIds.includes(productId) && businessIds.includes(productId))) return null;
  if (businessIds.includes(productId)) return 'business';
  return proIds.includes(productId) ? 'pro' : null;
}
export function strongestStoreTier(purchases: {productId?: string | null}[], proIds: string[], businessIds: string[]) {
  const tiers = purchases.map(purchase => storeTier(purchase.productId, proIds, businessIds));
  return tiers.includes('business') ? 'business' : tiers.includes('pro') ? 'pro' : null;
}
export function subscriptionApiUrl(path: string, native: boolean, nativeUrl: (path: string) => string) {
  return native ? nativeUrl(path) : new URL(path, window.location.origin).href;
}
export function businessOfferCopy(platform: string, changingPlan = false) {
  const trial = platform === 'android' && !changingPlan;
  return {
    price: trial ? '1 month free if eligible, then £14.99/month' : SUBSCRIPTION_PLANS.business.price,
    button: trial ? 'View 1 Month Free Trial Offer' : 'Subscribe for £14.99/month',
    terms: trial
      ? 'Eligible Google Play accounts receive 1 month free, then £14.99/month. If you are not eligible, the paid monthly plan may be offered instead. Google Play confirms eligibility, local price and when billing starts before you agree. '
      : changingPlan
        ? 'Business costs £14.99/month. Plan changes use your existing subscription and do not promise a new trial. The store confirms the effective date, local price and any credit before you agree. '
        : 'Business costs £14.99/month, billed monthly. The store confirmation shows your local price. ',
  };
}
export function validateBusinessStorePrice(product: {currency?:string;currencyCode?:string;priceAsDecimal?:number;price?:string;recurringPriceAsDecimal?:number;recurringCurrency?:string;recurringBillingPeriod?:string}) {
  if (product.recurringBillingPeriod && product.recurringBillingPeriod !== 'P1M') throw Error('Business requires a monthly plan. No payment has been started.');
  const currency=product.recurringCurrency || product.currencyCode || product.currency;
  const amount=product.recurringPriceAsDecimal ?? product.priceAsDecimal ?? Number(product.price);
  if (!currency || !Number.isFinite(amount) || amount<=0) throw Error('The store did not return a paid Business price. No payment has been started.');
  if (currency==='GBP' && Math.round(amount*100)!==SUBSCRIPTION_PLANS.business.monthlyPence) throw Error(`The Business price in the store does not match ${SUBSCRIPTION_PLANS.business.price}. Contact support; no payment has been started.`);
}

export function planReplacement(purchases: {productId?:string|null;receipt?:string}[], target:SubscriptionTier, proIds:string[], businessIds:string[]) {
  const active=purchases.filter(p=>storeTier(p.productId,proIds,businessIds));
  const products=[...new Set(active.map(p=>p.productId))];
  if(products.length>1)throw Error('More than one subscription is already active. Manage the existing subscriptions with your payment provider before changing plans. No new payment has been started.');
  const purchase=active[0];
  if(!purchase)return null;
  const tier=storeTier(purchase.productId,proIds,businessIds)!;
  return {tier,productId:purchase.productId!,samePlan:tier===target,purchase};
}
export function androidReplacementToken(receipt?:string) {
  try {const data=JSON.parse(receipt||'');const token=data.purchaseToken||data.token;if(typeof token==='string'&&token.length>0&&token.length<=10000)return token;}catch{}
  throw Error('The existing Google Play subscription could not be identified. Restore Purchases before changing plans. No new payment has been started.');
}
export function assertAppleSubscriptionGroup(products:{productId:string;subscriptionGroupId?:string}[],proIds:string[],businessIds:string[]) {
  const pro=products.find(p=>proIds.includes(p.productId)),business=products.find(p=>businessIds.includes(p.productId));
  if(!pro?.subscriptionGroupId||!business?.subscriptionGroupId||pro.subscriptionGroupId!==business.subscriptionGroupId)throw Error('Pro and Business must be in the same Apple subscription group before purchasing or changing plans. Contact support; no new payment has been started.');
}
