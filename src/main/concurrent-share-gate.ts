import { tierGate } from './license/tier-gate'
import type { ServerManager } from './server-manager'

export const FREE_SHARE_LIMIT = 2

// Counts running LOCAL servers, not WAN tunnels: a tunnel can't exist without a
// running local server, so this caps WAN too while firing the upsell at the LOCAL
// play button. 'error' counts as active so a transient flip can't drop the count
// and let a Free user open a 3rd share mid-recovery.
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
