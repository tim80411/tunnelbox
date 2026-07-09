/**
 * Framing-sensitive copy for Pro friction #3 (background daemon mode).
 * Rule: use-case framing only — never paywall framing.
 * See .project/specs/pro-features/_overview.md §Copy Guidelines:
 *   ✅ "Pro = 24/7 share mode" / "Free = one-shot demo"
 *   ❌ "Pro lets you close the screen" / "Free can't run in background"
 */
export const DAEMON_COPY = {
  firstCloseTitle: '關閉視窗後 TunnelBox 會停止分享',

  firstCloseBody:
    'Free 適合單次展示：關閉視窗會停止所有進行中的分享並結束應用程式。' +
    '升級 Pro 使用 24/7 分享模式，關閉視窗後分享仍會在背景持續執行。',

  quitLabel: '結束並停止分享',

  cancelLabel: '取消',

  upgradeLabel: '升級 Pro，讓分享持續執行',

  dontShowAgainLabel: '了解，不要再顯示',

  menuRunInBackgroundPro: '在背景執行',

  menuRunInBackgroundFree: '在背景執行',

  menuRunInBackgroundTooltip:
    'Pro 的 24/7 分享模式讓分享持續執行，適合 API 端點與長時間展示。',

  launchAtStartupLabel: '開機時啟動',

  launchAtStartupDesc:
    'Pro：登入系統時自動啟動 TunnelBox、還原進行中的分享並在背景執行。',

  downgradeNotification:
    '你的 Pro 授權已失效。TunnelBox 已回到單次展示模式，主視窗會重新顯示；進行中的分享會持續到你關閉視窗為止。',
} as const

export type DaemonCopy = typeof DAEMON_COPY
