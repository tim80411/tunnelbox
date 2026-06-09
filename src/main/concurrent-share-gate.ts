import { tierGate } from './license/tier-gate'
import type { ServerManager } from './server-manager'

export const FREE_SHARE_LIMIT = 2

/**
 * Active local-server statuses that count toward the friction limit.
 *
 * Design note: the gate counts LOCAL servers running, not WAN tunnels.
 * Rationale: TunnelBox surfaces local servers via the "運行中" badge, which
 * is the user's primary mental model for "what's active right now". WAN
 * tunnels can't exist without a running local server, so capping at local
 * also caps WAN by transitivity — but the friction fires earlier (at the
 * moment the user clicks the LOCAL play button), making the Pro upsell
 * appear at the natural attention spot rather than only when the user
 * tries to expose the site publicly.
 *
 * 'error' is treated as still-active: cloudflared/proxy may flip a running
 * server into error transiently; we don't want the count to mysteriously
 * drop and let the user start a 3rd while the 2nd is mid-recovery.
 */
const ACTIVE_STATUSES = new Set<'running' | 'error'>(['running', 'error'])

export function getActiveShareIds(serverManager: ServerManager): string[] {
  return serverManager.getServers()
    .filter((s) => ACTIVE_STATUSES.has(s.status as 'running' | 'error'))
    .map((s) => s.id)
}

export function countActiveShares(serverManager: ServerManager): number {
  return getActiveShareIds(serverManager).length
}

/**
 * Check if starting a new active site for `targetSiteId` is allowed.
 * Returns `allowed: true` for Pro or when under the free limit.
 * Returns `allowed: false` with the list of currently active siteIds for Free users at limit.
 */
export function checkShareGate(
  serverManager: ServerManager,
  targetSiteId: string
): { allowed: true } | { allowed: false; activeIds: string[] } {
  if (tierGate.isPro()) return { allowed: true }

  // Already running for this site — not a new start, allow (covers WAN-start while LOCAL is already up)
  const existing = serverManager.getServer(targetSiteId)
  if (existing && ACTIVE_STATUSES.has(existing.status as 'running' | 'error')) return { allowed: true }

  const activeIds = getActiveShareIds(serverManager)
  if (activeIds.length < FREE_SHARE_LIMIT) return { allowed: true }

  return { allowed: false, activeIds }
}
