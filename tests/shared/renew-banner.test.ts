import { describe, it, expect } from 'vitest'
import { majorMinor, shouldShowRenewBanner } from '../../src/shared/renew-banner'

describe('majorMinor', () => {
  it('keeps major.minor and drops patch', () => {
    expect(majorMinor('1.4.2')).toBe('1.4')
    expect(majorMinor('2.10.0')).toBe('2.10')
  })
})

describe('shouldShowRenewBanner (Story 107)', () => {
  const base = { isPro: true, softLocked: true, appVersion: '2.1.0', dismissedVersion: '' }

  it('scenario 1: not soft-locked → hidden', () => {
    expect(shouldShowRenewBanner({ ...base, softLocked: false })).toBe(false)
  })

  it('Free / no license → hidden', () => {
    expect(shouldShowRenewBanner({ ...base, isPro: false })).toBe(false)
  })

  it('scenario 2: soft-locked, never dismissed → shown', () => {
    expect(shouldShowRenewBanner(base)).toBe(true)
  })

  it('scenario 3: dismissed for this major.minor → hidden', () => {
    expect(shouldShowRenewBanner({ ...base, dismissedVersion: '2.1' })).toBe(false)
  })

  it('scenario 4: patch bump after dismiss → still hidden', () => {
    // dismissed 2.1, now on 2.1.5 (same minor) → no re-show
    expect(shouldShowRenewBanner({ ...base, appVersion: '2.1.5', dismissedVersion: '2.1' })).toBe(false)
  })

  it('scenario 5: next minor after dismiss → shown again', () => {
    expect(shouldShowRenewBanner({ ...base, appVersion: '2.2.0', dismissedVersion: '2.1' })).toBe(true)
  })

  it('scenario 6: renewed (no longer soft-locked) → hidden', () => {
    expect(shouldShowRenewBanner({ ...base, softLocked: false, dismissedVersion: '' })).toBe(false)
  })
})
