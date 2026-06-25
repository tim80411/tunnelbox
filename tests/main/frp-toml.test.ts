import { describe, it, expect } from 'vitest'
import { tomlBasicString } from '@/main/providers/frp/toml'

describe('tomlBasicString (frp TOML injection guard — TIM-317 / F21)', () => {
  it('wraps a plain value in quotes', () => {
    expect(tomlBasicString('frp.example.com')).toBe('"frp.example.com"')
  })

  it('escapes embedded double-quotes (cannot close the string early)', () => {
    expect(tomlBasicString('a"b')).toBe('"a\\"b"')
  })

  it('escapes backslashes', () => {
    expect(tomlBasicString('a\\b')).toBe('"a\\\\b"')
  })

  it('neutralizes a TOML-injection payload (quote + newline + new table)', () => {
    // serverAddr = evil.com"<newline>[[proxies]]...  must NOT break out.
    const out = tomlBasicString('evil.com"\n[[proxies]]')
    expect(out).toBe('"evil.com\\"\\n[[proxies]]"')
    // The result is a single TOML line: no raw newline, no unescaped quote.
    expect(out.includes('\n')).toBe(false)
    expect(out).toMatch(/^".*"$/)
  })

  it('escapes carriage return and control chars', () => {
    expect(tomlBasicString('a\rb')).toBe('"a\\rb"')
    expect(tomlBasicString('ab')).toBe('"a\\u0001b"')
  })
})
