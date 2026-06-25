/**
 * Explicit security flags for the main window's webPreferences. Electron 33's
 * defaults already match these, but declaring them explicitly — from a single
 * exported, asserted source — means a future Electron upgrade or an accidental
 * edit can't silently weaken the window's process isolation. (TIM-318, F31)
 */
export const SECURE_WEB_PREFERENCES = {
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  webSecurity: true
} as const
