import { describe, it, expect, vi } from 'vitest'
import { tunnelQuick, tunnelStop } from '@/cli/commands/tunnel'
import { CLIError } from '@/cli/errors'
import type { IStore } from '@/core/store-interface'
import type { ServerManager, SiteServer } from '@/main/server-manager'
import type { StoredSite } from '@/shared/types'

// --- Helpers ---

function createMockStore(sites: StoredSite[] = []): IStore {
  return {
    getSites: vi.fn(() => sites),
    saveSites: vi.fn(),
    addSite: vi.fn(),
    removeSite: vi.fn(),
    getAuth: vi.fn(() => null),
    saveAuth: vi.fn(),
    clearAuth: vi.fn(),
    getTunnels: vi.fn(() => []),
    saveTunnel: vi.fn(),
    removeTunnel: vi.fn(),
    getDomainBinding: vi.fn(() => null),
    saveDomainBinding: vi.fn(),
    removeDomainBinding: vi.fn(),
  }
}

function createMockServerManager(servers: Map<string, Partial<SiteServer>> = new Map()) {
  return {
    getServer: vi.fn((id: string) => servers.get(id) as SiteServer | undefined),
    startServer: vi.fn(async (site: { id: string; name: string; folderPath: string }) => {
      const server: SiteServer = {
        id: site.id,
        name: site.name,
        folderPath: site.folderPath,
        port: 3001,
        status: 'running',
      }
      return server
    }),
    stopServer: vi.fn(async () => {}),
    initWebSocket: vi.fn(async () => {}),
    getServers: vi.fn(() => Array.from(servers.values())),
    stopAll: vi.fn(async () => {}),
    removeServer: vi.fn(async () => {}),
    registerStopped: vi.fn(),
    onFileChange: vi.fn(() => () => {}),
    generateId: vi.fn(() => 'test-id'),
  } as unknown as ServerManager
}

interface TunnelDeps {
  findBinary: () => Promise<string | null>
  startQuickTunnel: (siteId: string, port: number) => Promise<string>
  stopQuickTunnel: (siteId: string) => void
  hasTunnel: (siteId: string) => boolean
  getTunnelInfo: (siteId: string) => { publicUrl?: string } | undefined
}

function createMockTunnelDeps(overrides: Partial<TunnelDeps> = {}): TunnelDeps {
  return {
    findBinary: vi.fn(async () => '/usr/local/bin/cloudflared'),
    startQuickTunnel: vi.fn(async () => 'https://abc-123.trycloudflare.com'),
    stopQuickTunnel: vi.fn(),
    hasTunnel: vi.fn(() => false),
    getTunnelInfo: vi.fn(() => undefined),
    ...overrides,
  }
}

const SITE_A: StoredSite = { id: 'id-a', name: 'my-site', folderPath: '/tmp/site-a' }

// --- tunnelQuick ---

describe('tunnelQuick', () => {
  it('starts tunnel successfully when server is already running', async () => {
    const store = createMockStore([SITE_A])
    const servers = new Map<string, Partial<SiteServer>>([
      ['id-a', { id: 'id-a', name: 'my-site', folderPath: '/tmp/site-a', port: 3005, status: 'running' }],
    ])
    const serverManager = createMockServerManager(servers)
    const deps = createMockTunnelDeps()

    const result = await tunnelQuick(store, serverManager, 'my-site', deps)

    expect(deps.startQuickTunnel).toHaveBeenCalledWith('id-a', 3005)
    expect(serverManager.startServer).not.toHaveBeenCalled()
    expect(result).toEqual({
      id: 'id-a',
      name: 'my-site',
      publicUrl: 'https://abc-123.trycloudflare.com',
    })
  })

  it('auto-starts server when not running', async () => {
    const store = createMockStore([SITE_A])
    const serverManager = createMockServerManager() // no running servers
    const deps = createMockTunnelDeps()

    const result = await tunnelQuick(store, serverManager, 'my-site', deps)

    expect(serverManager.startServer).toHaveBeenCalledWith({
      id: SITE_A.id,
      name: SITE_A.name,
      folderPath: SITE_A.folderPath,
    })
    expect(deps.startQuickTunnel).toHaveBeenCalledWith('id-a', 3001)
    expect(result).toEqual({
      id: 'id-a',
      name: 'my-site',
      publicUrl: 'https://abc-123.trycloudflare.com',
      serverAutoStarted: true,
    })
  })

  it('throws CLIError exit 2 when cloudflared not installed', async () => {
    const store = createMockStore([SITE_A])
    const serverManager = createMockServerManager()
    const deps = createMockTunnelDeps({
      findBinary: vi.fn(async () => null),
    })

    await expect(tunnelQuick(store, serverManager, 'my-site', deps)).rejects.toThrow(CLIError)
    await expect(tunnelQuick(store, serverManager, 'my-site', deps)).rejects.toMatchObject({
      exitCode: 2,
      message: expect.stringContaining('cloudflared not installed'),
    })
  })

  it('returns existing URL when tunnel already running', async () => {
    const store = createMockStore([SITE_A])
    const servers = new Map<string, Partial<SiteServer>>([
      ['id-a', { id: 'id-a', name: 'my-site', folderPath: '/tmp/site-a', port: 3005, status: 'running' }],
    ])
    const serverManager = createMockServerManager(servers)
    const deps = createMockTunnelDeps({
      hasTunnel: vi.fn(() => true),
      getTunnelInfo: vi.fn(() => ({ publicUrl: 'https://existing.trycloudflare.com' })),
    })

    const result = await tunnelQuick(store, serverManager, 'my-site', deps)

    expect(deps.startQuickTunnel).not.toHaveBeenCalled()
    expect(result).toEqual({
      id: 'id-a',
      name: 'my-site',
      publicUrl: 'https://existing.trycloudflare.com',
      alreadyRunning: true,
    })
  })

  it('throws CLIError exit 1 when site not found', async () => {
    const store = createMockStore([])
    const serverManager = createMockServerManager()
    const deps = createMockTunnelDeps()

    await expect(tunnelQuick(store, serverManager, 'ghost', deps)).rejects.toThrow(CLIError)
    await expect(tunnelQuick(store, serverManager, 'ghost', deps)).rejects.toMatchObject({
      exitCode: 1,
      message: expect.stringContaining('Site not found'),
    })
  })
})

// --- tunnelStop ---

describe('tunnelStop', () => {
  it('stops running tunnel successfully', async () => {
    const store = createMockStore([SITE_A])
    const serverManager = createMockServerManager()
    const deps = createMockTunnelDeps({
      hasTunnel: vi.fn(() => true),
    })

    const result = await tunnelStop(store, 'my-site', deps)

    expect(deps.stopQuickTunnel).toHaveBeenCalledWith('id-a')
    expect(result).toEqual({
      id: 'id-a',
      name: 'my-site',
      stopped: true,
    })
  })

  it('returns no-tunnel info when no tunnel running', async () => {
    const store = createMockStore([SITE_A])
    const serverManager = createMockServerManager()
    const deps = createMockTunnelDeps({
      hasTunnel: vi.fn(() => false),
    })

    const result = await tunnelStop(store, 'my-site', deps)

    expect(deps.stopQuickTunnel).not.toHaveBeenCalled()
    expect(result).toEqual({
      id: 'id-a',
      name: 'my-site',
      noTunnel: true,
    })
  })

  it('throws CLIError exit 1 when site not found', async () => {
    const store = createMockStore([])
    const deps = createMockTunnelDeps()

    await expect(tunnelStop(store, 'ghost', deps)).rejects.toThrow(CLIError)
    await expect(tunnelStop(store, 'ghost', deps)).rejects.toMatchObject({
      exitCode: 1,
      message: expect.stringContaining('Site not found'),
    })
  })
})
