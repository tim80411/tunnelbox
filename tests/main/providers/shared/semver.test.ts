import { describe, it, expect } from 'vitest'
import { parseVersion, compareSemver } from '../../../../src/main/providers/shared/semver'

describe('parseVersion', () => {
  it('extracts version from "frpc version 0.58.1"', () => {
    expect(parseVersion('frpc version 0.58.1')).toBe('0.58.1')
  })

  it('extracts version from "bore-cli 0.5.2"', () => {
    expect(parseVersion('bore-cli 0.5.2')).toBe('0.5.2')
  })

  it('extracts version from string with prefix text', () => {
    expect(parseVersion('some tool v1.2.3 build 456')).toBe('1.2.3')
  })

  it('returns null for no version', () => {
    expect(parseVersion('no version here')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseVersion('')).toBeNull()
  })
})

describe('compareSemver', () => {
  it('returns 0 for equal versions', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0)
  })

  it('returns 1 when a > b (major)', () => {
    expect(compareSemver('2.0.0', '1.9.9')).toBe(1)
  })

  it('returns -1 when a < b (minor)', () => {
    expect(compareSemver('1.2.0', '1.3.0')).toBe(-1)
  })

  it('returns 1 when a > b (patch)', () => {
    expect(compareSemver('0.51.1', '0.51.0')).toBe(1)
  })

  it('returns -1 when a < b (patch)', () => {
    expect(compareSemver('0.5.0', '0.5.1')).toBe(-1)
  })
})
