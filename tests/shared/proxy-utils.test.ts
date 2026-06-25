import { describe, it, expect } from 'vitest'
import {
  normalizeProxyTarget,
  isValidProxyTarget,
  extractPort,
  isPrivilegedPort,
  getProxyTargetWarnings,
  classifyProxyHost,
  proxyTargetSsrfRisk,
  PORT_MIN,
  PORT_MAX,
  PRIVILEGED_PORT_THRESHOLD,
} from '../../src/shared/proxy-utils'

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

describe('isPrivilegedPort', () => {
  it('returns true for ports 1-1024', () => {
    expect(isPrivilegedPort(1)).toBe(true)
    expect(isPrivilegedPort(22)).toBe(true)
    expect(isPrivilegedPort(80)).toBe(true)
    expect(isPrivilegedPort(443)).toBe(true)
    expect(isPrivilegedPort(1024)).toBe(true)
  })

  it('returns false for ports above 1024', () => {
    expect(isPrivilegedPort(1025)).toBe(false)
    expect(isPrivilegedPort(3000)).toBe(false)
    expect(isPrivilegedPort(8080)).toBe(false)
    expect(isPrivilegedPort(65535)).toBe(false)
  })

  it('returns false for port 0 and negative ports', () => {
    expect(isPrivilegedPort(0)).toBe(false)
    expect(isPrivilegedPort(-1)).toBe(false)
  })

  it('exports correct PRIVILEGED_PORT_THRESHOLD', () => {
    expect(PRIVILEGED_PORT_THRESHOLD).toBe(1024)
  })
})

describe('getProxyTargetWarnings', () => {
  it('returns a warning for privileged ports', () => {
    const warnings = getProxyTargetWarnings('http://localhost:22')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('22')
    expect(warnings[0]).toContain('特權埠')
  })

  it('returns a warning for http default port 80', () => {
    const warnings = getProxyTargetWarnings('http://localhost')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('80')
  })

  it('returns a warning for https default port 443', () => {
    const warnings = getProxyTargetWarnings('https://localhost')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('443')
  })

  it('returns no warnings for non-privileged ports', () => {
    expect(getProxyTargetWarnings('http://localhost:3000')).toHaveLength(0)
    expect(getProxyTargetWarnings('http://localhost:8080')).toHaveLength(0)
  })

  it('returns no warnings for invalid URLs', () => {
    expect(getProxyTargetWarnings('not-a-url')).toHaveLength(0)
  })

  it('warns about cloud-metadata / link-local targets (SSRF — TIM-312)', () => {
    const warnings = getProxyTargetWarnings('http://169.254.169.254')
    expect(warnings.some((w) => w.includes('metadata') || w.includes('link-local'))).toBe(true)
  })

  it('warns about RFC1918 private targets (SSRF — TIM-312)', () => {
    expect(getProxyTargetWarnings('http://192.168.1.1:8080').some((w) => w.includes('內網'))).toBe(true)
    expect(getProxyTargetWarnings('http://10.0.0.5:3000').some((w) => w.includes('內網'))).toBe(true)
  })

  it('does NOT add an SSRF warning for loopback (localhost proxying is the core use case)', () => {
    // localhost:3000 must stay warning-free; 127.0.0.1:3000 likewise.
    expect(getProxyTargetWarnings('http://localhost:3000')).toHaveLength(0)
    expect(getProxyTargetWarnings('http://127.0.0.1:3000')).toHaveLength(0)
  })
})

describe('classifyProxyHost (SSRF host classification — TIM-312)', () => {
  it('classifies loopback', () => {
    expect(classifyProxyHost('localhost')).toBe('loopback')
    expect(classifyProxyHost('app.localhost')).toBe('loopback')
    expect(classifyProxyHost('127.0.0.1')).toBe('loopback')
    expect(classifyProxyHost('127.0.0.53')).toBe('loopback')
    expect(classifyProxyHost('::1')).toBe('loopback')
  })

  it('classifies cloud-metadata / link-local', () => {
    expect(classifyProxyHost('169.254.169.254')).toBe('link-local')
    expect(classifyProxyHost('169.254.0.1')).toBe('link-local')
    expect(classifyProxyHost('metadata.google.internal')).toBe('link-local')
    expect(classifyProxyHost('fe80::1')).toBe('link-local')
  })

  it('classifies RFC1918 / ULA private', () => {
    expect(classifyProxyHost('10.0.0.1')).toBe('private')
    expect(classifyProxyHost('192.168.1.1')).toBe('private')
    expect(classifyProxyHost('172.16.0.1')).toBe('private')
    expect(classifyProxyHost('172.31.255.255')).toBe('private')
    expect(classifyProxyHost('fd00::1')).toBe('private')
  })

  it('does not misclassify public-range neighbours of the private blocks', () => {
    expect(classifyProxyHost('172.15.0.1')).toBe('public')
    expect(classifyProxyHost('172.32.0.1')).toBe('public')
    expect(classifyProxyHost('11.0.0.1')).toBe('public')
    expect(classifyProxyHost('example.com')).toBe('public')
  })
})

describe('proxyTargetSsrfRisk (share-time SSRF gate — TIM-312 / F06)', () => {
  it('flags link-local / cloud-metadata targets as a risk needing confirmation', () => {
    expect(proxyTargetSsrfRisk('http://169.254.169.254/latest/meta-data/')).toBe('link-local')
    expect(proxyTargetSsrfRisk('http://metadata.google.internal')).toBe('link-local')
  })

  it('flags RFC1918 private targets as a risk needing confirmation', () => {
    expect(proxyTargetSsrfRisk('http://192.168.1.5:3000')).toBe('private')
    expect(proxyTargetSsrfRisk('http://10.0.0.7:8080')).toBe('private')
  })

  it('returns null for loopback and public targets (no confirmation needed)', () => {
    expect(proxyTargetSsrfRisk('http://localhost:3000')).toBeNull()
    expect(proxyTargetSsrfRisk('http://127.0.0.1:5173')).toBeNull()
    expect(proxyTargetSsrfRisk('https://example.com')).toBeNull()
  })

  it('returns null for a malformed target', () => {
    expect(proxyTargetSsrfRisk('not a url')).toBeNull()
  })
})
