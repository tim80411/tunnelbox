/**
 * URL navigation / open policy for the main window. (TIM-310)
 *
 * The main window holds the preload bridge and all `window.electron.*` IPC, so
 * if it could be navigated to a remote attacker page (F10) that page would
 * inherit the bridge; and `shell.openExternal` would hand any scheme straight
 * to the OS (F11/F08). These two pure predicates back the will-navigate guard
 * and the setWindowOpenHandler allowlist wired in index.ts.
 */

/** Schemes safe to hand to shell.openExternal — everything else is blocked. */
export function isAllowedExternalUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl)
    return u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:'
  } catch {
    return false
  }
}

/**
 * True when `rawUrl` is the app's own content and may be navigated to: the
 * prod `file://` bundle, or (in dev) the same origin as the Vite renderer URL.
 * Origin comparison avoids treating a port-prefix neighbour (e.g. :51730 vs
 * :5173) as internal. Everything else is treated as external navigation.
 */
export function isInternalUrl(rawUrl: string, devUrl?: string): boolean {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    return false
  }
  if (u.protocol === 'file:') return true
  if (devUrl) {
    try {
      if (u.origin === new URL(devUrl).origin) return true
    } catch {
      // ignore malformed devUrl
    }
  }
  return false
}
