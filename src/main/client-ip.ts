import type { IncomingMessage } from 'node:http'

/**
 * Resolve the client IP for a request hitting the LOCAL api server.
 *
 * This server binds 127.0.0.1 only and authenticates with a bearer token; it
 * is never legitimately behind a reverse proxy. Trusting `X-Forwarded-For`
 * here (the previous behaviour) let any local process forge unlimited distinct
 * rate-limit keys — evading the per-IP limit and inflating the limiter map.
 * Always use the real socket address. (TIM-315, F18)
 */
export function getClientIp(req: IncomingMessage): string {
  return req.socket?.remoteAddress || 'unknown'
}
