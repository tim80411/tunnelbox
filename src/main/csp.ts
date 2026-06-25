/**
 * Content-Security-Policy for the app's OWN renderer window (TIM-318, F14).
 *
 * sandbox + contextIsolation stop a compromised renderer from reaching Node,
 * but not from exfiltrating data to an arbitrary origin or loading remote
 * scripts — that's what this CSP adds (defense-in-depth for XSS).
 *
 * Dev (Vite) injects inline scripts, uses eval, and talks to its HMR server
 * over ws://, so the dev policy is deliberately looser. Prod loads a static,
 * self-hosted bundle, so it locks scripts to 'self'. Both keep:
 *  - style-src 'unsafe-inline' (bundled CSS / runtime <style>; note React's
 *    style={{}} sets element.style via JS and is not CSP-governed),
 *  - img-src data:/blob: (QR codes and generated icons),
 *  - object-src/frame-src 'none', base-uri 'none' (clickjacking / base-tag).
 */
export function buildCsp(isDev: boolean): string {
  return [
    "default-src 'self'",
    isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    isDev ? "connect-src 'self' ws: http://localhost:* http://127.0.0.1:*" : "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "form-action 'none'"
  ].join('; ')
}
