import {pathToFileURL} from 'node:url';
import path from 'node:path';

const defaultOrigin = 'https://the-sparkys-mate-29962838005.europe-west1.run.app';
export async function inspectBillingDeployment(origin = defaultOrigin, {
  fetchImpl = fetch,
  platform = 'android',
  productId = 'business_subsciption',
} = {}) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.username || base.password || !['android','ios'].includes(platform) || !/^[A-Za-z0-9_.-]{1,128}$/.test(productId)) {
    throw Error('Use a public HTTPS origin without credentials and an Android or iOS platform.');
  }
  const url = new URL('/api/subscriptions/business/ready', base.origin);
  url.searchParams.set('_billingCheck', String(Date.now()));
  const report = {origin:base.origin, platform, productId, ok:false, status:'unreachable', products:[]};
  try {
    const response = await fetchImpl(url.href, {
      headers:{Accept:'application/json','Cache-Control':'no-cache'},
      cache:'no-store', signal:AbortSignal.timeout(15000),
    });
    if (!response.ok) return {...report,status:'http_error',httpStatus:response.status};
    const ready = await response.json().catch(() => null);
    if (!ready || typeof ready !== 'object' || typeof ready[platform] !== 'boolean') {
      return {...report,status:'unexpected_response'};
    }
    const ids = ready.businessProductIds?.[platform];
    if (!Array.isArray(ids)) return {...report,status:'legacy_backend'};
    if (!ids.every(id => typeof id === 'string' && /^[A-Za-z0-9_.-]{1,128}$/.test(id)) || ids.length > 20) {
      return {...report,status:'unexpected_response'};
    }
    const products = [...new Set(ids)];
    if (!ready[platform]) return {...report,products,status:'verification_disabled'};
    if (!products.includes(productId)) return {...report,products,status:'product_not_supported'};
    return {...report,products,status:'ready',ok:true};
  } catch {
    // Do not print arbitrary response bodies, credentials or exception details.
    return report;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const report = await inspectBillingDeployment(process.argv[2] || defaultOrigin, {
      platform:process.argv[3] || 'android',
      productId:process.argv[4] || (process.argv[3] === 'ios' ? 'business_subscription' : 'business_subsciption'),
    });
    console.log(JSON.stringify(report,null,2));
    console.log(report.ok
      ? 'Backend contract supports this product. Store permissions, payment, replacement and entitlement still require device testing.'
      : report.status === 'legacy_backend'
        ? 'The server still uses the old readiness contract. Push and deploy the updated server source; changing environment variables alone cannot fix this.'
        : 'Backend readiness failed. Do not start a payment or publish another mobile build until this check passes.');
    process.exitCode = report.ok ? 0 : 1;
  } catch {
    console.error('Invalid deployment-check configuration. Use an HTTPS service URL without credentials.');
    process.exitCode = 1;
  }
}
