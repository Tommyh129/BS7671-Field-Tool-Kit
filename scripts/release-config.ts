export function validateReleaseConfig(env: Record<string, string | undefined>) {
  for (const key of ['VITE_SANDBOX_BUSINESS_ACCESS','VITE_ANDROID_BILLING_DIAGNOSTICS']) {
    if (env[key] && env[key] !== 'false') throw Error(`${key} must be false or unset for a release build.`);
  }
  for (const key of ['VITE_API_BASE_URL','VITE_APP_URL','VITE_PRIVACY_POLICY_URL','VITE_TERMS_URL','VITE_PRIVACY_REQUEST_URL','VITE_DATA_PROCESSING_TERMS_URL']) {
    if (!env[key]?.trim()) continue;
    const url = new URL(env[key]!.trim());
    if (url.protocol !== 'https:' || url.username || url.password || ['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw Error(`${key} must be a public HTTPS URL without credentials.`);
  }
  for (const tier of ['PRO','BUSINESS']) {
    const expected = tier==='PRO'?'pro_subscription':'business_subscription';
    for (const key of [`VITE_${tier}_PRODUCT_ID`,`VITE_IOS_${tier}_PRODUCT_ID`,`VITE_ANDROID_${tier}_PRODUCT_ID`]) {
      if (env[key]?.trim() && env[key]!.trim()!==expected) throw Error(`${key} differs from the confirmed product ID ${expected}; verify the release configuration.`);
    }
  }
}
