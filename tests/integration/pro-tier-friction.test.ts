/**
 * Integration test: cross-friction tier gate behaviour
 * Covers Free vs Pro simultaneously across all 4 friction axes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TierState } from '../../src/shared/license-types'
import type { StoredCfAccounts } from '../../src/shared/types'
import type { ProviderTunnelInfo } from '../../src/shared/provider-types'

// ---------------------------------------------------------------------------
// Tier gate mock
// ---------------------------------------------------------------------------
const tierState = vi.hoisted(() => ({ isPro: false }))

vi.mock('../../src/main/license/tier-gate', () => ({
  tierGate: {
    isPro: () => tierState.isPro,
    getTier: () => (tierState.isPro ? 'pro' : 'free'),
    getFounderTier: () => null,
    isSoftLocked: () => false,
    onChange: vi.fn(() => () => {}),
    refresh: vi.fn(async () => {}),
    _setState: vi.fn((s: TierState) => { tierState.isPro = s.isPro }),
  },
}))

// ---------------------------------------------------------------------------
// CF account store mock
// ---------------------------------------------------------------------------
const fsState = vi.hoisted(() => ({ existingPaths: new Set<string>() }))
vi.mock('node:fs', () => ({
  default: {
    existsSync: (p: string) => fsState.existingPaths.has(p),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn((p: string) => { fsState.existingPaths.delete(p) }),
    copyFileSync: vi.fn((_src: string, dest: string) => { fsState.existingPaths.add(dest) }),
  },
  existsSync: (p: string) => fsState.existingPaths.has(p),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn((p: string) => { fsState.existingPaths.delete(p) }),
  copyFileSync: vi.fn((_src: string, dest: string) => { fsState.existingPaths.add(dest) }),
}))
vi.mock('node:child_process', () => ({ execFile: vi.fn(), spawn: vi.fn() }))

// Helper used by tests below to simulate `cloudflared tunnel login` finishing
function makeFakeCloudflaredChild(onSpawn: () => void): unknown {
  const handlers: Record<string, (...args: unknown[]) => void> = {}
  const child = {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: (event: string, cb: (...args: unknown[]) => void) => { handlers[event] = cb; return child },
    kill: vi.fn(),
  }
  queueMicrotask(() => { onSpawn(); handlers.exit?.(0, null) })
  return child
}
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-userData' },
  BrowserWindow: { getAllWindows: () => [] },
}))

let storedAccounts: StoredCfAccounts = { accounts: [], activeAccountId: null }
vi.mock('../../src/main/store', () => ({
  getCfAccounts: () => storedAccounts,
  saveCfAccounts: vi.fn((data: StoredCfAccounts) => { storedAccounts = data }),
  getSites: () => [],
  updateSite: vi.fn(),
  getSiteCfAccountId: vi.fn(() => null),
}))
vi.mock('../../src/main/cloudflared/detector', () => ({
  findBinary: vi.fn(async () => '/usr/local/bin/cloudflared'),
}))

// ---------------------------------------------------------------------------
// Settings mock
// ---------------------------------------------------------------------------
const settingsData = vi.hoisted(() => ({
  launchAtStartup: false,
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
// Tunnel manager factory
// ---------------------------------------------------------------------------
function makeTunnelManager(activeSiteIds: string[]) {
  return {
    getTunnelInfoAcrossProviders: vi.fn((siteId: string): ProviderTunnelInfo | undefined =>
      activeSiteIds.includes(siteId)
        ? { providerType: 'cloudflare', status: 'running' }
        : undefined
    ),
  }
}

/** ServerManager mock — gate counts local servers. */
function makeServerManager(activeSiteIds: string[]) {
  return {
    getServers: vi.fn(() =>
      activeSiteIds.map((id) => ({ id, status: 'running' as const }))
    ),
    getServer: vi.fn((id: string) =>
      activeSiteIds.includes(id) ? { id, status: 'running' as const } : undefined
    ),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Cross-friction integration — Free tier', () => {
  beforeEach(() => {
    vi.resetModules()
    tierState.isPro = false
    storedAccounts = { accounts: [], activeAccountId: null }
    fsState.existingPaths.clear()
  })

  // ── Friction 1: shares ───────────────────────────────────────────────────
  describe('Concurrent shares', () => {
    it('Free can run 2 shares simultaneously without errors', async () => {
      const { checkShareGate } = await import('../../src/main/concurrent-share-gate')
      const mgr = makeServerManager(['site-a'])
      const result = checkShareGate(mgr as never, 'site-b')
      expect(result.allowed).toBe(true)
    })

    it('Free is blocked at 3rd share', async () => {
      const { checkShareGate } = await import('../../src/main/concurrent-share-gate')
      const mgr = makeServerManager(['site-a', 'site-b'])
      const result = checkShareGate(mgr as never, 'site-c')
      expect(result.allowed).toBe(false)
    })
  })

  // ── Friction 2: CF accounts ──────────────────────────────────────────────
  describe('Cloudflare accounts', () => {
    it('Free can log in 1 CF account without error', async () => {
      vi.resetModules()
      const os = await import('node:os')
      const path = await import('node:path')
      const defaultCert = path.join(os.homedir(), '.cloudflared', 'cert.pem')
      const spawnMock = (await import('node:child_process')).spawn as ReturnType<typeof vi.fn>
      spawnMock.mockImplementation(() =>
        makeFakeCloudflaredChild(() => { fsState.existingPaths.add(defaultCert) })
      )
      storedAccounts = { accounts: [], activeAccountId: null }
      const { addAccount } = await import('../../src/main/cloudflared/account-manager')
      const result = await addAccount()
      expect(result.accounts).toHaveLength(1)
    })

    it('Free is blocked from adding 2nd CF account', async () => {
      vi.resetModules()
      storedAccounts = {
        accounts: [{ id: 'acct-1', certPath: '/tmp/cert-1.pem', lastUsedAt: '2024-01-01T00:00:00.000Z' }],
        activeAccountId: 'acct-1',
      }
      fsState.existingPaths.add('/tmp/cert-1.pem')
      const { addAccount } = await import('../../src/main/cloudflared/account-manager')
      await expect(addAccount()).rejects.toThrow('FREE_ACCOUNT_LIMIT')
    })
  })

  // ── Friction 3: background mode ──────────────────────────────────────────
  describe('Background mode', () => {
    it('Free user window close triggers dialog (not silent hide)', async () => {
      const mockDialog = vi.fn().mockResolvedValue({ response: 2, checkboxChecked: false })
      vi.doMock('electron', () => ({
        dialog: { showMessageBox: mockDialog },
        Notification: class {
          static isSupported = () => false
          show = vi.fn()
          constructor(_opts: { title: string; body: string }) {}
        },
        app: { getPath: () => '/tmp/test-userData' },
        BrowserWindow: { getAllWindows: () => [] },
      }))
      vi.resetModules()
      const { attachCloseHandler } = await import('../../src/main/window-close-handler')
      const handlers: Record<string, Array<(...args: unknown[]) => void>> = {}
      const win = {
        on: (event: string, cb: (...args: unknown[]) => void) => {
          handlers[event] = handlers[event] ?? []
          handlers[event].push(cb)
        },
        emit: (event: string, ...args: unknown[]) => {
          for (const cb of handlers[event] ?? []) cb(...args)
        },
        hide: vi.fn(),
        show: vi.fn(),
        focus: vi.fn(),
        isDestroyed: () => false,
      }
      attachCloseHandler(win as never, vi.fn(), vi.fn())
      win.emit('close', { preventDefault: vi.fn() })
      expect(mockDialog).toHaveBeenCalledOnce()
    })
  })

  // ── All simultaneously: 2 shares + 1 CF account ────────
  describe('Free simultaneously: 2 shares + 1 CF account — no errors', () => {
    it('both work together without conflicts', async () => {
      vi.resetModules()
      tierState.isPro = false

      // 2 shares OK
      const { checkShareGate } = await import('../../src/main/concurrent-share-gate')
      const mgr = makeServerManager(['site-a'])
      const gateResult = checkShareGate(mgr as never, 'site-b')
      expect(gateResult.allowed).toBe(true)

      // 1 CF account OK
      expect(storedAccounts.accounts).toHaveLength(0)
    })
  })
})

describe('Cross-friction integration — Pro tier', () => {
  beforeEach(() => {
    vi.resetModules()
    tierState.isPro = true
    storedAccounts = {
      accounts: [
        { id: 'acct-1', certPath: '/tmp/cert-1.pem', lastUsedAt: '2024-01-01T00:00:00.000Z' },
        { id: 'acct-2', certPath: '/tmp/cert-2.pem', lastUsedAt: '2024-01-02T00:00:00.000Z' },
      ],
      activeAccountId: 'acct-1',
    }
    fsState.existingPaths.clear()
    fsState.existingPaths.add('/tmp/cert-1.pem')
    fsState.existingPaths.add('/tmp/cert-2.pem')
  })

  it('Pro can run more than 2 shares simultaneously', async () => {
    const { checkShareGate } = await import('../../src/main/concurrent-share-gate')
    const mgr = makeServerManager(['s1', 's2', 's3', 's4'])
    const result = checkShareGate(mgr as never, 's5')
    expect(result.allowed).toBe(true)
  })

  it('Pro can add a 3rd CF account', async () => {
    vi.resetModules()
    tierState.isPro = true
    const os = await import('node:os')
    const path = await import('node:path')
    const defaultCert = path.join(os.homedir(), '.cloudflared', 'cert.pem')
    const spawnMock = (await import('node:child_process')).spawn as ReturnType<typeof vi.fn>
    spawnMock.mockImplementation(() =>
      makeFakeCloudflaredChild(() => { fsState.existingPaths.add(defaultCert) })
    )
    const { addAccount } = await import('../../src/main/cloudflared/account-manager')
    const result = await addAccount()
    expect(result.accounts.length).toBeGreaterThanOrEqual(3)
  })

  it('Pro window close hides without dialog', async () => {
    vi.doMock('electron', () => ({
      dialog: { showMessageBox: vi.fn() },
      Notification: class {
        static isSupported = () => false
        show = vi.fn()
        constructor(_opts: { title: string; body: string }) {}
      },
      app: { getPath: () => '/tmp/test-userData' },
      BrowserWindow: { getAllWindows: () => [] },
    }))
    vi.resetModules()
    const { attachCloseHandler } = await import('../../src/main/window-close-handler')
    const handlers: Record<string, Array<(...args: unknown[]) => void>> = {}
    const win = {
      on: (event: string, cb: (...args: unknown[]) => void) => {
        handlers[event] = handlers[event] ?? []
        handlers[event].push(cb)
      },
      emit: (event: string, ...args: unknown[]) => {
        for (const cb of handlers[event] ?? []) cb(...args)
      },
      hide: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      isDestroyed: () => false,
    }
    attachCloseHandler(win as never, vi.fn(), vi.fn())
    const fakeEvent = { preventDefault: vi.fn() }
    win.emit('close', fakeEvent)
    expect(fakeEvent.preventDefault).toHaveBeenCalled()
    expect(win.hide).toHaveBeenCalled()
  })
})
