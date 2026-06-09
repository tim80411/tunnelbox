import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkShareGate, getActiveShareIds, FREE_SHARE_LIMIT } from '@/main/concurrent-share-gate'
import type { ServerManager, SiteServer } from '@/main/server-manager'
import type { TierState } from '@/shared/license-types'

// Mock tierGate before importing concurrent-share-gate
const tierState = vi.hoisted(() => ({ isPro: false }))

vi.mock('@/main/license/tier-gate', () => ({
  tierGate: {
    isPro: () => tierState.isPro,
    getTier: () => (tierState.isPro ? 'pro' : 'free'),
    getFounderTier: () => null,
    isSoftLocked: () => false,
    onChange: vi.fn(() => () => {}),
    refresh: vi.fn(async () => {}),
    _setState: vi.fn((s: TierState) => {
      tierState.isPro = s.isPro
    }),
  },
}))

/** Build a fake ServerManager whose listed sites have status='running'; others return undefined. */
function makeServerManager(activeSiteIds: string[]): ServerManager {
  const servers: SiteServer[] = activeSiteIds.map((id) => ({
    id,
    name: id,
    folderPath: `/tmp/${id}`,
    port: 3000,
    status: 'running' as const,
    serveMode: 'static' as const,
  } as SiteServer))
  return {
    getServers: vi.fn(() => servers),
    getServer: vi.fn((id: string) => servers.find((s) => s.id === id)),
  } as unknown as ServerManager
}

beforeEach(() => {
  tierState.isPro = false
})

describe('FREE_SHARE_LIMIT', () => {
  it('is 2', () => {
    expect(FREE_SHARE_LIMIT).toBe(2)
  })
})

describe('getActiveShareIds', () => {
  it('returns ids of sites with running local servers', () => {
    const mgr = makeServerManager(['site-a', 'site-c'])
    expect(getActiveShareIds(mgr)).toEqual(['site-a', 'site-c'])
  })

  it('returns empty when no servers running', () => {
    const mgr = makeServerManager([])
    expect(getActiveShareIds(mgr)).toEqual([])
  })
})

describe('checkShareGate — Pro user', () => {
  beforeEach(() => {
    tierState.isPro = true
  })

  it('allows starting when already 4 servers running', () => {
    const mgr = makeServerManager(['site-a', 'site-b', 'site-c', 'site-d'])
    const result = checkShareGate(mgr, 'site-e')
    expect(result.allowed).toBe(true)
  })

  it('allows starting when zero servers running', () => {
    const mgr = makeServerManager([])
    const result = checkShareGate(mgr, 'site-a')
    expect(result.allowed).toBe(true)
  })
})

describe('checkShareGate — Free user blocked', () => {
  it('blocks and returns active ids when at limit', () => {
    const mgr = makeServerManager(['site-a', 'site-b'])
    const result = checkShareGate(mgr, 'site-c')
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.activeIds).toEqual(expect.arrayContaining(['site-a', 'site-b']))
      expect(result.activeIds).toHaveLength(2)
    }
  })

  it('does not block when only 1 active', () => {
    const mgr = makeServerManager(['site-a'])
    const result = checkShareGate(mgr, 'site-b')
    expect(result.allowed).toBe(true)
  })
})

describe('checkShareGate — Free user sequential switch', () => {
  it('allows starting after stopping down to 1', () => {
    // A stopped, only B running, want to start C
    const mgr = makeServerManager(['site-b'])
    const result = checkShareGate(mgr, 'site-c')
    expect(result.allowed).toBe(true)
  })
})

describe('checkShareGate — already running is not a new start', () => {
  it('allows when target site is already running (idempotent start)', () => {
    // Two sites active; clicking play on one of them shouldn't be blocked
    const mgr = makeServerManager(['site-a', 'site-b'])
    const result = checkShareGate(mgr, 'site-a')
    expect(result.allowed).toBe(true)
  })

  it('counts error state as active (prevents flap-bypass)', () => {
    const servers: SiteServer[] = [
      { id: 's1', status: 'running' } as SiteServer,
      { id: 's2', status: 'error' } as SiteServer,
    ]
    const mgr = {
      getServers: vi.fn(() => servers),
      getServer: vi.fn((id: string) => servers.find((s) => s.id === id)),
    } as unknown as ServerManager
    const result = checkShareGate(mgr, 'site-new')
    expect(result.allowed).toBe(false)
  })
})

describe('getActiveShareIds — downgrade ordering', () => {
  it('returns all active sites for downgrade limit application', () => {
    const mgr = makeServerManager(['s1', 's2', 's3', 's4', 's5'])
    const active = getActiveShareIds(mgr)
    expect(active).toHaveLength(5)
    expect(active.slice(2)).toEqual(['s3', 's4', 's5'])
  })
})
