export function secureLegalUrl(value: string | undefined, fallback: string): string {
  if (!value?.trim()) return fallback;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : fallback;
  } catch { return fallback; }
}

export const PUBLISHED_PRIVACY_POLICY_URL = 'https://app.termly.io/policy-viewer/policy.html?policyUUID=6b10edd9-015b-429b-88bc-e8e2c415ed7d';
export const PUBLISHED_TERMS_URL = 'https://app.termly.io/policy-viewer/policy.html?policyUUID=91dde6aa-55a2-4e06-bd83-2ae1c31dd091';
export const PRIVACY_NOTICE_VERSION = '2026-10-25';
