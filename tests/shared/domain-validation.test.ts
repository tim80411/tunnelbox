import { describe, it, expect } from 'vitest'
import { isValidDomain } from '@/shared/types'

describe('isValidDomain (cloudflared argv-injection guard — TIM-317 / F20)', () => {
  it('accepts well-formed domains', () => {
    expect(isValidDomain('example.com')).toBe(true)
    expect(isValidDomain('sub.example.com')).toBe(true)
    expect(isValidDomain('a.b.co')).toBe(true)
    expect(isValidDomain('  trimmed.example.com  ')).toBe(true)
  })

  it('rejects argument-injection payloads (leading dash → cloudflared flag)', () => {
    expect(isValidDomain('--config=/tmp/evil.yaml')).toBe(false)
    expect(isValidDomain('-foo.example.com')).toBe(false)
    expect(isValidDomain('--logfile=/etc/x')).toBe(false)
  })

  it('rejects newline / metachar injection', () => {
    expect(isValidDomain('evil.com\nmalicious')).toBe(false)
    expect(isValidDomain('evil.com\r\nx')).toBe(false)
  })

  it('rejects empty / malformed domains', () => {
    expect(isValidDomain('')).toBe(false)
    expect(isValidDomain('   ')).toBe(false)
    expect(isValidDomain('no-tld')).toBe(false)
    expect(isValidDomain('http://example.com')).toBe(false)
  })
})
