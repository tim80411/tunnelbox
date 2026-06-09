/**
 * All framing-sensitive copy strings for Pro friction #3: Background daemon mode.
 * Rule: use-case framing only — never paywall framing.
 * See: .project/specs/pro-features/_overview.md §Copy Guidelines
 *
 * QA audit: every string here must pass the framing check:
 *   ✅ "Pro = 24/7 share mode" / "Free = one-shot demo"
 *   ❌ "Pro lets you close the screen" / "Free can't run in background"
 */
export const DAEMON_COPY = {
  // 1. First-close dialog title
  firstCloseTitle: 'TunnelBox will stop sharing when you close',

  // 2. First-close dialog body (~2 sentences)
  firstCloseBody:
    'Free mode is designed for one-shot demos — closing the window stops all active shares and exits the app. ' +
    'Upgrade to Pro for 24/7 share mode: close the window and your shares keep running in the background.',

  // 3. "Quit & stop shares" button label
  quitLabel: 'Quit & Stop Shares',

  // 4. "Cancel" button label
  cancelLabel: 'Cancel',

  // 5. "Upgrade" button label
  upgradeLabel: 'Upgrade to Pro — Keep Shares Running',

  // 6. "Don't show again" checkbox label
  dontShowAgainLabel: "Got it — don't show this again",

  // 7a. App menu item label (Pro: enabled)
  menuRunInBackgroundPro: 'Run in Background',

  // 7b. App menu item label (Free: disabled)
  menuRunInBackgroundFree: 'Run in Background',

  // 8. App menu tooltip when disabled (Free)
  menuRunInBackgroundTooltip:
    'Pro mode keeps shares running 24/7 — ideal for API endpoints and long-running demos.',

  // 9a. Settings → Launch at startup label
  launchAtStartupLabel: 'Launch at startup',

  // 9b. Settings → Launch at startup description
  launchAtStartupDesc:
    'Start TunnelBox automatically when you log in, restore active shares, and run in the background (Pro).',

  // 10. Pro→Free downgrade notification message
  downgradeNotification:
    'Your Pro license is no longer active. TunnelBox has returned to one-shot demo mode — the main window is now visible. Active shares continue until you close the window.',
} as const

export type DaemonCopy = typeof DAEMON_COPY
