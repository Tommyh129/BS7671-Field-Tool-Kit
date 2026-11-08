type SubscriptionContext = {
  invoicedBusiness: boolean;
  webActive: boolean;
  unknownLegacyPro: boolean;
  native: { provider: 'android' | 'ios'; tier: 'pro' | 'business' } | null;
};

export async function loadSubscriptionContext(url: string, getToken: (refresh?: boolean) => Promise<string>, request = fetch): Promise<SubscriptionContext> {
  const signal = AbortSignal.timeout(20000);
  const check = async (refresh: boolean) => request(url, {
    headers: { Authorization: `Bearer ${await getToken(refresh)}` },
    signal,
    cache: 'no-store',
  });
  let response = await check(false);
  if (response.status === 401) response = await check(true);
  const context = await response.json().catch(() => null);
  if (!response.ok) throw Error(context?.error || 'Existing subscriptions could not be checked. No payment has been started.');
  if (!context || typeof context.invoicedBusiness !== 'boolean' || typeof context.webActive !== 'boolean' ||
      typeof context.unknownLegacyPro !== 'boolean' ||
      (context.native !== null && (!['android', 'ios'].includes(context.native?.provider) || !['pro', 'business'].includes(context.native?.tier)))) {
    throw Error('The subscription service returned an unexpected response. No payment has been started.');
  }
  return context;
}

export function checkSubscriptionContext(context: SubscriptionContext, platform: string, hasOwnedPlan: boolean) {
  if (context.invoicedBusiness) throw Error('Your organisation provides or has scheduled Business access. Contact your administrator before buying a personal subscription.');
  if (context.webActive) throw Error('Manage your existing subscription where it was purchased. A separate subscription will not be started.');
  if (context.native && context.native.provider !== platform) throw Error('Change your subscription through the original Apple or Google Play store. A second subscription will not be started.');
  if (!hasOwnedPlan && (context.native || context.unknownLegacyPro)) {
    throw Error('Restore your existing subscription using the original store account before changing plans. No payment has been started.');
  }
}
