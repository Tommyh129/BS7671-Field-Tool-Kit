export function allowSandboxBusiness(options: { dev: boolean; enabled: boolean; native: boolean; hostname: string }) {
  return options.dev && options.enabled && !options.native && ['localhost', '127.0.0.1', '[::1]'].includes(options.hostname);
}
