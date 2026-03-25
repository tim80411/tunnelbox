import { describe, it, expect } from 'vitest'
import { normalizeProxyTarget, isValidProxyTarget, extractPort, PORT_MIN, PORT_MAX } from '../../src/shared/proxy-utils'

describe('normalizeProxyTarget', () => {
  it('normalizes pure port number to localhost URL', () => {
    expect(normalizeProxyTarget('3000')).toBe('http://localhost:3000')
    expect(normalizeProxyTarget('8080')).toBe('http://localhost:8080')
    expect(normalizeProxyTarget('1')).toBe('http://localhost:1')
    expect(normalizeProxyTarget('65535')).toBe('http://localhost:65535')
  })

  it('normalizes colon-prefixed port to localhost URL', () => {
    expect(normalizeProxyTarget(':3000')).toBe('http://localhost:3000')
    expect(normalizeProxyTarget(':8080')).toBe('http://localhost:8080')
  })

  it('trims whitespace before normalizing', () => {
    expect(normalizeProxyTarget('  3000  ')).toBe('http://localhost:3000')
    expect(normalizeProxyTarget('  :3000  ')).toBe('http://localhost:3000')
  })

  it('passes through full URLs unchanged', () => {
    expect(normalizeProxyTarget('http://localhost:3000')).toBe('http://localhost:3000')
    expect(normalizeProxyTarget('https://example.com')).toBe('https://example.com')
    expect(normalizeProxyTarget('http://192.168.1.1:8080')).toBe('http://192.168.1.1:8080')
  })

  it('throws RangeError for port 0', () => {
    expect(() => normalizeProxyTarget('0')).toThrow(RangeError)
    expect(() => normalizeProxyTarget(':0')).toThrow(RangeError)
  })

  it('throws RangeError for port > 65535', () => {
    expect(() => normalizeProxyTarget('65536')).toThrow(RangeError)
    expect(() => normalizeProxyTarget('99999')).toThrow(RangeError)
    expect(() => normalizeProxyTarget('100000')).toThrow(RangeError)
  })

  it('passes through non-numeric strings', () => {
    expect(normalizeProxyTarget('not-a-url')).toBe('not-a-url')
    expect(normalizeProxyTarget('http://foo')).toBe('http://foo')
  })

  it('exports correct port constants', () => {
    expect(PORT_MIN).toBe(1)
    expect(PORT_MAX).toBe(65535)
  })
})

describe('isValidProxyTarget', () => {
  it('accepts http URLs', () => {
    expect(isValidProxyTarget('http://localhost:3000')).toBe(true)
    expect(isValidProxyTarget('http://192.168.1.1:8080')).toBe(true)
  })

  it('accepts https URLs', () => {
    expect(isValidProxyTarget('https://example.com')).toBe(true)
  })

  it('rejects non-http protocols', () => {
    expect(isValidProxyTarget('ftp://example.com')).toBe(false)
    expect(isValidProxyTarget('ws://localhost:3000')).toBe(false)
  })

  it('rejects invalid URLs', () => {
    expect(isValidProxyTarget('not-a-url')).toBe(false)
    expect(isValidProxyTarget('3000')).toBe(false)
    expect(isValidProxyTarget('')).toBe(false)
  })
})

describe('extractPort', () => {
  it('extracts explicit port from URL', () => {
    expect(extractPort('http://localhost:3000')).toBe(3000)
    expect(extractPort('http://localhost:8080')).toBe(8080)
    expect(extractPort('https://example.com:4433')).toBe(4433)
  })

  it('returns 80 for http without explicit port', () => {
    expect(extractPort('http://localhost')).toBe(80)
    expect(extractPort('http://example.com')).toBe(80)
  })

  it('returns 443 for https without explicit port', () => {
    expect(extractPort('https://example.com')).toBe(443)
    expect(extractPort('https://localhost')).toBe(443)
  })
})
