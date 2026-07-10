const DEFAULT_API_BASE_URL =
  'https://ais-pre-cudgj6lkyex64hxupsknop-164877439791.europe-west1.run.app';

const getFallbackBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location) {
    const href = window.location.href;
    if (href.includes('-dev-')) {
      return 'https://ais-dev-cudgj6lkyex64hxupsknop-164877439791.europe-west1.run.app';
    }
  }
  return DEFAULT_API_BASE_URL;
};

export function getApiBaseUrl() {
  // Use current location origin if running in a standard web browser (non-Capacitor)
  if (typeof window !== 'undefined' && window.location) {
    const isCapacitor = !!(window as any).Capacitor;
    if (!isCapacitor) {
      const origin = window.location.origin;
      if (origin && origin !== 'null') {
        return origin;
      }
      return ''; // Fallback to relative path so browser resolves it against the document URL
    }
  }

  const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env || {});
  const configuredBase = env.VITE_API_BASE_URL?.trim();

  if (configuredBase) {
    return configuredBase.replace(/\/$/, '');
  }

  // Capacitor serves native apps from a localhost-style origin. API requests
  // must still go to the deployed backend rather than the device itself.
  return getFallbackBaseUrl();
}

export function getApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}
