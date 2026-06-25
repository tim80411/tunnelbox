import { describe, it, expect } from 'vitest'
import type { IncomingMessage } from 'node:http'
import { getClientIp } from '@/main/client-ip'

const req = (over: Partial<{ headers: Record<string, string>; remoteAddress?: string }>): IncomingMessage =>
  ({ headers: over.headers ?? {}, socket: { remoteAddress: over.remoteAddress } }) as unknown as IncomingMessage

describe('getClientIp (local api server — TIM-315 / F18)', () => {
  it('uses the real socket remote address', () => {
    expect(getClientIp(req({ remoteAddress: '127.0.0.1' }))).toBe('127.0.0.1')
  })

  it('IGNORES a client-forged X-Forwarded-For (server is 127.0.0.1-only)', () => {
    // Previously XFF was trusted, letting a local process forge unlimited
    // distinct rate-limit keys to evade the limit / inflate the limiter map.
    expect(
      getClientIp(req({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }, remoteAddress: '127.0.0.1' }))
    ).toBe('127.0.0.1')
  })

  it('falls back to "unknown" when the socket has no address', () => {
    expect(getClientIp(req({}))).toBe('unknown')
  })
})
