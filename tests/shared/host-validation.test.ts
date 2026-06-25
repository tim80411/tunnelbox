import { describe, it, expect } from 'vitest'
import { isValidServerHost } from '@/shared/host-validation'

describe('isValidServerHost (frp/bore serverAddr guard — TIM-317 / F27)', () => {
  it('accepts hostnames and IP literals', () => {
    expect(isValidServerHost('frp.example.com')).toBe(true)
    expect(isValidServerHost('my-server.io')).toBe(true)
    expect(isValidServerHost('1.2.3.4')).toBe(true)
    expect(isValidServerHost('a')).toBe(true)
    expect(isValidServerHost('[2001:db8::1]')).toBe(true)
    expect(isValidServerHost('  trimmed.example.com  ')).toBe(true)
  })

  it('rejects shell/argv metacharacter injection', () => {
    expect(isValidServerHost('evil.com; rm -rf /')).toBe(false)
    expect(isValidServerHost('host$(whoami)')).toBe(false)
    expect(isValidServerHost('a b')).toBe(false)
    expect(isValidServerHost('--secret')).toBe(false)
  })

  it('rejects newline / quote (config smuggling)', () => {
    expect(isValidServerHost('evil.com"\n[x]')).toBe(false)
    expect(isValidServerHost('a\r\nb')).toBe(false)
  })

  it('rejects empty / out-of-range / malformed', () => {
    expect(isValidServerHost('')).toBe(false)
    expect(isValidServerHost('   ')).toBe(false)
    expect(isValidServerHost('-leadingdash.com')).toBe(false)
    expect(isValidServerHost('trailingdash-')).toBe(false)
    expect(isValidServerHost('a'.repeat(254))).toBe(false)
  })
})
