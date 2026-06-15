const DEFAULT_API_BASE_URL =
  'https://ais-pre-cudgj6lkyex64hxupsknop-164877439791.europe-west1.run.app';

export function getApiBaseUrl() {
  const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env || {});
  const configuredBase = env.VITE_API_BASE_URL?.trim();

  if (configuredBase) {
    return configuredBase.replace(/\/$/, '');
  }

  // Capacitor serves native apps from a localhost-style origin. API requests
  // must still go to the deployed backend rather than the device itself.
  return DEFAULT_API_BASE_URL;
}

export function getApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}
