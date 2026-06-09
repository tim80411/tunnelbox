/**
 * Framing-sensitive copy for Pro friction #3 (background daemon mode).
 * Rule: use-case framing only — never paywall framing.
 * See .project/specs/pro-features/_overview.md §Copy Guidelines:
 *   ✅ "Pro = 24/7 share mode" / "Free = one-shot demo"
 *   ❌ "Pro lets you close the screen" / "Free can't run in background"
 */
export const DAEMON_COPY = {
  firstCloseTitle: 'TunnelBox will stop sharing when you close',

  firstCloseBody:
    'Free mode is designed for one-shot demos — closing the window stops all active shares and exits the app. ' +
    'Upgrade to Pro for 24/7 share mode: close the window and your shares keep running in the background.',

  quitLabel: 'Quit & Stop Shares',

  cancelLabel: 'Cancel',

  upgradeLabel: 'Upgrade to Pro — Keep Shares Running',

  dontShowAgainLabel: "Got it — don't show this again",

  menuRunInBackgroundPro: 'Run in Background',

  menuRunInBackgroundFree: 'Run in Background',

  menuRunInBackgroundTooltip:
    'Pro mode keeps shares running 24/7 — ideal for API endpoints and long-running demos.',

  launchAtStartupLabel: 'Launch at startup',

  launchAtStartupDesc:
    'Start TunnelBox automatically when you log in, restore active shares, and run in the background (Pro).',

  downgradeNotification:
    'Your Pro license is no longer active. TunnelBox has returned to one-shot demo mode — the main window is now visible. Active shares continue until you close the window.',
} as const

export type DaemonCopy = typeof DAEMON_COPY
