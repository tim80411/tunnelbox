import { describe, it, expect } from 'vitest'
import { buildCsp } from '@/main/csp'

describe('buildCsp (renderer Content-Security-Policy — TIM-318 / F14)', () => {
  it('locks scripts to self in production (no inline/eval)', () => {
    const csp = buildCsp(false)
    expect(csp).toContain("script-src 'self'")
    expect(csp).not.toContain("'unsafe-eval'")
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(csp).toContain("connect-src 'self'")
    expect(csp).not.toContain('ws:')
  })

  it('relaxes scripts + connect for Vite HMR in dev', () => {
    const csp = buildCsp(true)
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'")
    expect(csp).toContain('ws:')
  })

  it('always allows data:/blob: images (QR codes) and locks down object/frame/base', () => {
    for (const csp of [buildCsp(true), buildCsp(false)]) {
      expect(csp).toContain('img-src')
      expect(csp).toContain('data:')
      expect(csp).toContain("object-src 'none'")
      expect(csp).toContain("frame-src 'none'")
      expect(csp).toContain("base-uri 'none'")
      expect(csp).toContain("style-src 'self' 'unsafe-inline'")
    }
  })
})
