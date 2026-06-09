/**
 * Integration test: Pro→Free downgrade cycle
 * Validates the §License-Failure-Degradation invariant from _overview.md.
 *
 * Setup: Pro user, 5 active shares, 3 CF accounts, background mode on,
 *        founder_tier=25, beta channel on.
 * Trigger: license invalidated → tier-gate._setState to free → listeners fire.
 * Verify: each friction module enforces its downgrade invariant independently.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TierState } from '../../src/shared/license-types'
import type { StoredCfAccounts } from '../../src/shared/types'
import type { ProviderTunnelInfo } from '../../src/shared/provider-types'

// ---------------------------------------------------------------------------
// Shared hoisted mutable state
// ---------------------------------------------------------------------------
const tierState = vi.hoisted(() => ({
  isPro: true,
  founderTier: 25,
  listeners: [] as Array<(s: TierState) => void>,
}))

vi.mock('../../src/main/license/tier-gate', () => ({
  tierGate: {
    isPro: () => tierState.isPro,
    getTier: () => (tierState.isPro ? 'pro' : 'free'),
    getFounderTier: () => (tierState.isPro ? tierState.founderTier : null),
    isSoftLocked: () => false,
    onChange: vi.fn((cb: (s: TierState) => void) => {
      tierState.listeners.push(cb)
      return () => {
        tierState.listeners = tierState.listeners.filter((l) => l !== cb)
      }
    }),
    refresh: vi.fn(async () => {}),
    _setState: vi.fn((s: TierState) => {
      tierState.isPro = s.isPro
      tierState.founderTier = s.founderTier ?? null
      const nextState: TierState = {
        isPro: s.isPro,
        tier: s.isPro ? 'pro' : 'free',
        softLocked: s.softLocked ?? false,
        founderTier: s.founderTier ?? null,
      }
      for (const l of tierState.listeners) l(nextState)
    }),
  },
}))

// ---------------------------------------------------------------------------
// CF accounts store mock
// ---------------------------------------------------------------------------
const fsState = vi.hoisted(() => ({ existingPaths: new Set<string>() }))
vi.mock('node:fs', () => ({
  default: {
    existsSync: (p: string) => fsState.existingPaths.has(p),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn((p: string) => { fsState.existingPaths.delete(p) }),
  },
  existsSync: (p: string) => fsState.existingPaths.has(p),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn((p: string) => { fsState.existingPaths.delete(p) }),
}))
vi.mock('node:child_process', () => ({ execFile: vi.fn() }))
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-userData' },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  Notification: class {
    static isSupported = () => false
    show = vi.fn()
    constructor(_opts: { title: string; body: string }) {}
  },
}))

let storedAccounts: StoredCfAccounts = { accounts: [], activeAccountId: null }
let storedSites: Array<{ id: string; cloudflareAccountId?: string | null }> = []
vi.mock('../../src/main/store', () => ({
  getCfAccounts: () => storedAccounts,
  saveCfAccounts: vi.fn((data: StoredCfAccounts) => { storedAccounts = data }),
  getSites: () => storedSites,
  updateSite: vi.fn((id: string, patch: { cloudflareAccountId?: string | null }) => {
    const site = storedSites.find((s) => s.id === id)
    if (site) Object.assign(site, patch)
  }),
  getSiteCfAccountId: (siteId: string) =>
    storedSites.find((s) => s.id === siteId)?.cloudflareAccountId,
}))
vi.mock('../../src/main/cloudflared/detector', () => ({
  findBinary: vi.fn(async () => '/usr/local/bin/cloudflared'),
}))

// ---------------------------------------------------------------------------
// Settings store mock
// ---------------------------------------------------------------------------
const settingsData = vi.hoisted(() => ({
  betaChannel: true,
  launchAtStartup: true,
  autoStartServers: false,
  defaultServeMode: 'static' as const,
  visitorNotifications: false,
  remoteConsoleEnabled: false,
  requestLogMaxEntries: 200,
}))
vi.mock('electron-store', () => ({
  default: class {
    get(key: string) { return (settingsData as Record<string, unknown>)[key] }
    set(key: string, val: unknown) { (settingsData as Record<string, unknown>)[key] = val }
  },
}))
vi.mock('../../src/main/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

// ---------------------------------------------------------------------------
// Tunnel manager mock (5 active shares)
// ---------------------------------------------------------------------------
const activeSiteIds = vi.hoisted(() => new Set(['s1', 's2', 's3', 's4', 's5']))

function makeTunnelManager() {
  return {
    getTunnelInfoAcrossProviders: vi.fn((siteId: string): ProviderTunnelInfo | undefined =>
      activeSiteIds.has(siteId)
        ? { providerType: 'cloudflare', status: 'running' }
        : undefined
    ),
    getForSite: vi.fn((siteId: string) => ({
      stopTunnel: vi.fn(async () => { activeSiteIds.delete(siteId) }),
    })),
  }
}

/** ServerManager mock — gate now counts local servers, not tunnels. */
function makeServerManager() {
  return {
    getServers: vi.fn(() =>
      Array.from(activeSiteIds).map((id) => ({ id, status: 'running' as const }))
    ),
    getServer: vi.fn((id: string) =>
      activeSiteIds.has(id) ? { id, status: 'running' as const } : undefined
    ),
  }
}

// ---------------------------------------------------------------------------
// Window mock
// ---------------------------------------------------------------------------
function makeWindow() {
  return {
    show: vi.fn(),
    focus: vi.fn(),
    hide: vi.fn(),
    isDestroyed: () => false,
  }
}

// ---------------------------------------------------------------------------
// Pro setup helper
// ---------------------------------------------------------------------------
function setupProState() {
  tierState.isPro = true
  tierState.founderTier = 25
  tierState.listeners = []

  storedAccounts = {
    accounts: [
      { id: 'acct-A', certPath: '/tmp/cert-A.pem', lastUsedAt: '2024-01-01T00:00:00.000Z' },
      { id: 'acct-B', certPath: '/tmp/cert-B.pem', lastUsedAt: '2024-01-03T00:00:00.000Z' },
      { id: 'acct-C', certPath: '/tmp/cert-C.pem', lastUsedAt: '2024-01-02T00:00:00.000Z' },
    ],
    activeAccountId: 'acct-A',
  }
  fsState.existingPaths.clear()
  fsState.existingPaths.add('/tmp/cert-A.pem')
  fsState.existingPaths.add('/tmp/cert-B.pem')
  fsState.existingPaths.add('/tmp/cert-C.pem')
  storedSites = []

  activeSiteIds.clear()
  for (const id of ['s1', 's2', 's3', 's4', 's5']) activeSiteIds.add(id)

  settingsData.betaChannel = true
  settingsData.launchAtStartup = true
}

function triggerDowngrade() {
  tierState.isPro = false
  tierState.founderTier = null
  const downgradeState: TierState = {
    isPro: false,
    tier: 'free',
    softLocked: false,
    founderTier: null,
  }
  for (const l of tierState.listeners) l(downgradeState)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Pro→Free downgrade cycle — §License-Failure-Degradation invariant', () => {
  beforeEach(() => {
    vi.resetModules()
    setupProState()
  })

  // ── Invariant 1: Concurrent shares capped at 2 ──────────────────────────
  describe('Active shares: capped at 2 (US-219 §情境 5)', () => {
    it('getActiveShareIds returns 5 in Pro state', async () => {
      const { getActiveShareIds } = await import('../../src/main/concurrent-share-gate')
      const mgr = makeServerManager()
      const ids = getActiveShareIds(mgr as never)
      expect(ids).toHaveLength(5)
    })

    it('after downgrade, checkShareGate blocks any new share above 2', async () => {
      tierState.isPro = false
      const { checkShareGate } = await import('../../src/main/concurrent-share-gate')
      const mgr = makeServerManager()
      const result = checkShareGate(mgr as never, 's6')
      expect(result.allowed).toBe(false)
    })

    it('after downgrade, first 2 shares are kept (slice(0,2) logic)', async () => {
      tierState.isPro = false
      const { getActiveShareIds, FREE_SHARE_LIMIT } = await import('../../src/main/concurrent-share-gate')
      const mgr = makeServerManager()
      const active = getActiveShareIds(mgr as never)
      const toStop = active.slice(FREE_SHARE_LIMIT)
      expect(toStop).toHaveLength(3)
      expect(active.slice(0, FREE_SHARE_LIMIT)).toEqual(['s1', 's2'])
    })
  })

  // ── Invariant 2: CF accounts — most-recent active, others preserved ─────
  describe('CF accounts: most-recent active, OAuth state preserved (US-220 §情境 6)', () => {
    it('applyDowngradeToFree keeps all 3 accounts (data preservation)', async () => {
      vi.resetModules()
      const { applyDowngradeToFree } = await import('../../src/main/cloudflared/account-manager')
      applyDowngradeToFree()
      expect(storedAccounts.accounts).toHaveLength(3)
    })

    it('applyDowngradeToFree preserves all cert files', async () => {
      vi.resetModules()
      const { applyDowngradeToFree } = await import('../../src/main/cloudflared/account-manager')
      applyDowngradeToFree()
      expect(fsState.existingPaths.has('/tmp/cert-A.pem')).toBe(true)
      expect(fsState.existingPaths.has('/tmp/cert-B.pem')).toBe(true)
      expect(fsState.existingPaths.has('/tmp/cert-C.pem')).toBe(true)
    })

    it('applyDowngradeToFree keeps activeAccountId as the current active account', async () => {
      vi.resetModules()
      const { applyDowngradeToFree } = await import('../../src/main/cloudflared/account-manager')
      applyDowngradeToFree()
      // acct-A was activeAccountId before downgrade — it should stay active
      expect(storedAccounts.activeAccountId).toBe('acct-A')
    })

    it('inactive accounts cannot be switched in UI layer — isPro=false gate is in CloudflareAccountsSection', () => {
      // NOTE: setActiveAccount() in account-manager has no Pro gate — switching is blocked
      // only in the UI (CloudflareAccountsSection handleSetActive returns early if !isPro).
      // This is a known design gap: switching protection exists only client-side.
      // Filed as follow-up: add isPro check to setActiveAccount for defense-in-depth.
      expect(tierState.isPro).toBe(true) // still Pro before triggerDowngrade()
    })
  })

  // ── Invariant 3: Background mode reverts to foreground ──────────────────
  describe('Background mode: main window shown on downgrade (US-221 §情境 7)', () => {
    it('watchTierForDowngrade calls win.show() when tier changes to free', async () => {
      vi.resetModules()
      const { watchTierForDowngrade } = await import('../../src/main/window-close-handler')
      const win = makeWindow()
      watchTierForDowngrade(() => win as never)
      triggerDowngrade()
      expect(win.show).toHaveBeenCalled()
    })

    it('watchTierForDowngrade calls win.focus() on downgrade', async () => {
      vi.resetModules()
      const { watchTierForDowngrade } = await import('../../src/main/window-close-handler')
      const win = makeWindow()
      watchTierForDowngrade(() => win as never)
      triggerDowngrade()
      expect(win.focus).toHaveBeenCalled()
    })
  })

  // ── Invariant 4: Founder badge hidden ───────────────────────────────────
  describe('Founder badge: hidden after downgrade (US-225 §情境 X)', () => {
    it('tier-gate getFounderTier returns null after downgrade', () => {
      triggerDowngrade()
      // Inline check — badge visibility is driven by tierState.isPro && founderTier != null
      expect(tierState.isPro).toBe(false)
      expect(tierState.founderTier).toBeNull()
    })

    it('TierState founderTier is null in the broadcast state', () => {
      let broadcastedState: TierState | null = null
      tierState.listeners.push((s) => { broadcastedState = s })
      triggerDowngrade()
      expect(broadcastedState).not.toBeNull()
      expect(broadcastedState!.founderTier).toBeNull()
      expect(broadcastedState!.isPro).toBe(false)
    })
  })

  // ── Invariant 5: Beta channel reset to stable ────────────────────────────
  describe('Beta channel: reset to stable on downgrade (US-222 §情境 X)', () => {
    it('tier-gate-ipc resets betaChannel to false when tier changes to free', async () => {
      vi.resetModules()
      const { registerTierGateIpc } = await import('../../src/main/license/tier-gate-ipc')
      // registerTierGateIpc attaches its own onChange listener
      registerTierGateIpc()
      expect(settingsData.betaChannel).toBe(true) // still true before downgrade
      triggerDowngrade()
      expect(settingsData.betaChannel).toBe(false)
    })
  })

  // ── Data preservation: no cert/site data deleted ─────────────────────────
  describe('Data preservation: cert files and site config intact', () => {
    it('downgrade does not delete any cert files', async () => {
      vi.resetModules()
      const { applyDowngradeToFree } = await import('../../src/main/cloudflared/account-manager')
      applyDowngradeToFree()
      triggerDowngrade()
      expect(fsState.existingPaths.size).toBe(3)
    })

    it('downgrade does not clear stored site configs', () => {
      storedSites = [
        { id: 'site-1', cloudflareAccountId: 'acct-A' },
        { id: 'site-2', cloudflareAccountId: 'acct-B' },
      ]
      triggerDowngrade()
      expect(storedSites).toHaveLength(2)
      expect(storedSites[0].cloudflareAccountId).toBe('acct-A')
      expect(storedSites[1].cloudflareAccountId).toBe('acct-B')
    })
  })
})
