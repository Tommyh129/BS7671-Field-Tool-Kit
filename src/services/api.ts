import { Capacitor } from '@capacitor/core';

export const DEFAULT_API_BASE_URL =
  'https://the-sparkys-mate-29962838005.europe-west1.run.app';

const getFallbackBaseUrl = () => {
  return DEFAULT_API_BASE_URL;
};

export function getApiBaseUrl() {
  // Use current location origin if running in a standard web browser (non-Capacitor)
  if (typeof window !== 'undefined' && window.location) {
    const isCapacitor = Capacitor.isNativePlatform();
    if (!isCapacitor) {
      const origin = window.location.origin;
      if (origin && origin !== 'null') {
        return origin;
      }
      try {
        const parsedOrigin = new URL(window.location.href).origin;
        if (parsedOrigin && parsedOrigin !== 'null') {
          return parsedOrigin;
        }
      } catch (e) {
        // ignore
      }
      return getFallbackBaseUrl();
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
