/**
 * Single source of truth for "is any modal / overlay currently open?".
 *
 * Two independent code paths must agree on this answer:
 *   - useKeyboardNavigation (suspends ↑/↓ list navigation while a modal is up)
 *   - useMenuCommands       (suspends global accelerators ⌘O/⌘R/⌘⌫)
 *
 * They previously drifted: several *blocking* overlays (the un-dismissable
 * force-update wall, the update-ready modal, the upgrade-pro modal) were absent
 * from the gate, so the destructive Remove shortcut (⌘⌫) could fire against the
 * background site while one of those walls was on screen (K1). Every overlay —
 * blocking or not — MUST be represented here.
 */
export interface OverlayState {
  addModal: boolean
  settings: boolean
  shortcuts: boolean
  shareHistory: boolean
  confirmRemove: boolean
  shareGate: boolean
  sensitivePort: boolean
  ssrfRisk: boolean
  proActivated: boolean
  pendingLicenseReplace: boolean
  downloadsLicensePrompt: boolean
  upgradePro: boolean
  updateReady: boolean
  forceUpdateBlocked: boolean
  remoteConsole: boolean
}

export function isAnyOverlayOpen(s: OverlayState): boolean {
  return Object.values(s).some(Boolean)
}
