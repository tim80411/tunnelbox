import { describe, it, expect } from 'vitest'
import { isAnyOverlayOpen, type OverlayState } from '../../../src/renderer/src/utils/overlay-gate'

// Every overlay closed — the baseline the app is in most of the time.
const NONE: OverlayState = {
  addModal: false,
  settings: false,
  shortcuts: false,
  shareHistory: false,
  confirmRemove: false,
  shareGate: false,
  sensitivePort: false,
  ssrfRisk: false,
  proActivated: false,
  pendingLicenseReplace: false,
  downloadsLicensePrompt: false,
  upgradePro: false,
  updateReady: false,
  forceUpdateBlocked: false,
  remoteConsole: false
}

describe('isAnyOverlayOpen — the single source of truth for shortcut gating', () => {
  it('is false when nothing is open', () => {
    expect(isAnyOverlayOpen(NONE)).toBe(false)
  })

  it('is true for an ordinary dialog (confirm remove)', () => {
    expect(isAnyOverlayOpen({ ...NONE, confirmRemove: true })).toBe(true)
  })

  // K1 regression guards: each blocking overlay was previously absent from the
  // gate, so the destructive Remove shortcut (⌘⌫) could fire behind it. Each
  // must trip the gate on its own.
  it('trips for the un-dismissable force-update wall (K1)', () => {
    expect(isAnyOverlayOpen({ ...NONE, forceUpdateBlocked: true })).toBe(true)
  })

  it('trips for the update-ready modal (K1)', () => {
    expect(isAnyOverlayOpen({ ...NONE, updateReady: true })).toBe(true)
  })

  it('trips for the upgrade-pro modal (K1)', () => {
    expect(isAnyOverlayOpen({ ...NONE, upgradePro: true })).toBe(true)
  })
})
