// Inputs to these functions must come from authenticated store server APIs.
export function appleBusinessEntitlement(transaction: Record<string,unknown>, productId: string, bundleId: string, transactionId: string) {
  if (transaction.bundleId !== bundleId || transaction.productId !== productId || transaction.transactionId !== transactionId || typeof transaction.originalTransactionId !== 'string') throw Error('Apple did not return a Business subscription for this app.');
  if (transaction.isUpgraded === true) throw Error('Apple transaction has been replaced. Restore the current plan instead.');
  return {expiresAt:transaction.revocationDate ? 0 : Number(transaction.expiresDate),key:`ios:${transaction.originalTransactionId}`};
}
export function playBusinessEntitlement(data: {subscriptionState:string;lineItems?:{productId:string;expiryTime:string}[]}, productId: string, token: string) {
  const active=['SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED'].includes(data.subscriptionState);
  return {expiresAt:active?Math.max(0,...(data.lineItems || []).filter(item=>item.productId===productId).map(item=>Date.parse(item.expiryTime))):0,key:`android:${token}`};
}
