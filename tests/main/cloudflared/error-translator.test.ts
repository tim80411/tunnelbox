import { describe, it, expect, vi } from 'vitest'

// Mock electron app (needed if anything pulls in the logger transitively)
vi.mock('electron', () => ({
  app: { isPackaged: false },
}))

import { translateCloudflaredError } from '../../../src/main/cloudflared/error-translator'

describe('translateCloudflaredError', () => {
  it('translates Cloudflare error 1016 (origin DNS error)', () => {
    const result = translateCloudflaredError('error code: 1016')
    expect(result.human).toContain('來源 DNS')
    expect(result.suggestion).not.toBe('')
    expect(result.raw).toBe('error code: 1016')
  })

  it('translates Cloudflare error 1033 (tunnel not found / argo error)', () => {
    const result = translateCloudflaredError('Error 1033: Argo Tunnel error')
    expect(result.human).toContain('Tunnel')
    expect(result.suggestion).not.toBe('')
    expect(result.raw).toBe('Error 1033: Argo Tunnel error')
  })

  it('translates "Application error 0x0"', () => {
    const result = translateCloudflaredError('the connection was reset: Application error 0x0')
    expect(result.human).toContain('應用程式')
    expect(result.suggestion).not.toBe('')
    expect(result.raw).toBe('the connection was reset: Application error 0x0')
  })

  it('translates "Unauthorized: Invalid tunnel secret"', () => {
    const result = translateCloudflaredError('Unauthorized: Invalid tunnel secret')
    expect(result.human).toContain('認證')
    expect(result.suggestion).not.toBe('')
    expect(result.raw).toBe('Unauthorized: Invalid tunnel secret')
  })

  it('translates a "lookup ... no such host" DNS failure', () => {
    const raw = 'dial tcp: lookup protocol.argotunnel.com: no such host'
    const result = translateCloudflaredError(raw)
    expect(result.human).toContain('網路')
    expect(result.suggestion).not.toBe('')
    expect(result.raw).toBe(raw)
  })

  it('returns a generic fallback for unmatched input', () => {
    const raw = 'some totally unrecognised cloudflared gibberish'
    const result = translateCloudflaredError(raw)
    expect(result.human).not.toBe('')
    expect(result.suggestion).not.toBe('')
    // Fallback preserves the original raw text so it can be surfaced for debugging
    expect(result.raw).toBe(raw)
    expect(result.matched).toBe(false)
  })

  it('reports matched=true for a known signature and false for the fallback', () => {
    expect(translateCloudflaredError('error code: 1016').matched).toBe(true)
    expect(translateCloudflaredError('totally unknown').matched).toBe(false)
  })

  it('maps named-tunnel auth/quota errors to the phrases used downstream', () => {
    expect(translateCloudflaredError('Unauthorized').human).toContain('認證已過期')
    expect(translateCloudflaredError('tunnel limit exceeded').human).toContain('數量上限')
  })

  it('classifies auth and quota errors via a stable category', () => {
    expect(translateCloudflaredError('Unauthorized').category).toBe('auth')
    expect(translateCloudflaredError('Unauthorized: Invalid tunnel secret').category).toBe('auth')
    expect(translateCloudflaredError('certificate has expired').category).toBe('auth')
    expect(translateCloudflaredError('tunnel limit exceeded').category).toBe('quota')
    expect(translateCloudflaredError('error code: 1016').category).toBe('network')
    expect(translateCloudflaredError('totally unknown').category).toBe('unknown')
  })

  it('returns a safe fallback for empty input without throwing', () => {
    const result = translateCloudflaredError('')
    expect(result.human).not.toBe('')
    expect(result.suggestion).not.toBe('')
    expect(result.raw).toBe('')
  })

  it('never throws on malformed (non-string) input and returns a safe fallback', () => {
    // @ts-expect-error deliberately passing a non-string to prove try-catch safety
    const result = translateCloudflaredError(null)
    expect(result.human).not.toBe('')
    expect(result.suggestion).not.toBe('')
    expect(typeof result.raw).toBe('string')
  })

  it('is case-insensitive when matching codes', () => {
    const lower = translateCloudflaredError('unauthorized: invalid tunnel secret')
    expect(lower.human).toContain('認證')
  })

  it('preserves the full raw string for matched codes (for copy/debug)', () => {
    const raw = 'preceding log line\nerror code: 1016\ntrailing context'
    const result = translateCloudflaredError(raw)
    expect(result.raw).toBe(raw)
    expect(result.human).toContain('來源 DNS')
  })
})
