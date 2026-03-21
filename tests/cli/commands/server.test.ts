import { describe, it, expect, vi, beforeEach } from 'vitest'
import { serverStart, serverStop, findSite } from '@/cli/commands/server'
import { CLIError } from '@/cli/errors'
import type { IStore } from '@/core/store-interface'
import type { ServerManager, SiteServer } from '@/main/server-manager'
import type { StoredSite } from '@/shared/types'

// Mock getLanIp to return null so tests don't depend on the host's network
vi.mock('@/core/lan-ip', () => ({
  getLanIp: vi.fn(() => null),
  getAllLanIps: vi.fn(() => []),
  isVpnInterface: vi.fn(() => false),
}))

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

const SITE_A: StoredSite = { id: 'id-a', name: 'my-site', folderPath: '/tmp/site-a' }
const SITE_B: StoredSite = { id: 'id-b', name: 'other-site', folderPath: '/tmp/site-b' }

// --- findSite ---

describe('findSite', () => {
  it('finds site by name', () => {
    const store = createMockStore([SITE_A, SITE_B])
    const site = findSite(store, 'my-site')
    expect(site).toEqual(SITE_A)
  })

  it('finds site by id', () => {
    const store = createMockStore([SITE_A, SITE_B])
    const site = findSite(store, 'id-b')
    expect(site).toEqual(SITE_B)
  })

  it('throws CLIError with exit code 1 when site not found', () => {
    const store = createMockStore([SITE_A])
    expect(() => findSite(store, 'ghost')).toThrow(CLIError)
    try {
      findSite(store, 'ghost')
    } catch (err) {
      expect(err).toBeInstanceOf(CLIError)
      expect((err as CLIError).exitCode).toBe(1)
      expect((err as CLIError).message).toContain('Site not found')
    }
  })
})

// --- serverStart ---

describe('serverStart', () => {
  it('starts server successfully and returns port/url', async () => {
    const store = createMockStore([SITE_A])
    const serverManager = createMockServerManager()

    const result = await serverStart(store, serverManager, 'my-site')

    expect(serverManager.startServer).toHaveBeenCalledWith({
      id: SITE_A.id,
      name: SITE_A.name,
      folderPath: SITE_A.folderPath,
    })
    expect(result).toEqual({
      id: SITE_A.id,
      name: SITE_A.name,
      port: 3001,
      url: 'http://localhost:3001',
    })
  })

  it('returns existing info when server already running', async () => {
    const store = createMockStore([SITE_A])
    const servers = new Map<string, Partial<SiteServer>>([
      ['id-a', { id: 'id-a', name: 'my-site', folderPath: '/tmp/site-a', port: 3005, status: 'running' }],
    ])
    const serverManager = createMockServerManager(servers)

    const result = await serverStart(store, serverManager, 'my-site')

    expect(serverManager.startServer).not.toHaveBeenCalled()
    expect(result).toEqual({
      id: SITE_A.id,
      name: SITE_A.name,
      port: 3005,
      url: 'http://localhost:3005',
      alreadyRunning: true,
    })
  })

  it('throws CLIError when site not found', async () => {
    const store = createMockStore([])
    const serverManager = createMockServerManager()

    await expect(serverStart(store, serverManager, 'ghost')).rejects.toThrow(CLIError)
    await expect(serverStart(store, serverManager, 'ghost')).rejects.toMatchObject({
      exitCode: 1,
      message: expect.stringContaining('Site not found'),
    })
  })
})

// --- serverStop ---

describe('serverStop', () => {
  it('stops running server successfully', async () => {
    const store = createMockStore([SITE_A])
    const servers = new Map<string, Partial<SiteServer>>([
      ['id-a', { id: 'id-a', name: 'my-site', folderPath: '/tmp/site-a', port: 3005, status: 'running' }],
    ])
    const serverManager = createMockServerManager(servers)

    const result = await serverStop(store, serverManager, 'my-site')

    expect(serverManager.stopServer).toHaveBeenCalledWith('id-a')
    expect(result).toEqual({
      id: SITE_A.id,
      name: SITE_A.name,
      stopped: true,
    })
  })

  it('returns not-running info when server is not running', async () => {
    const store = createMockStore([SITE_A])
    const servers = new Map<string, Partial<SiteServer>>([
      ['id-a', { id: 'id-a', name: 'my-site', folderPath: '/tmp/site-a', port: 0, status: 'stopped' }],
    ])
    const serverManager = createMockServerManager(servers)

    const result = await serverStop(store, serverManager, 'my-site')

    expect(serverManager.stopServer).not.toHaveBeenCalled()
    expect(result).toEqual({
      id: SITE_A.id,
      name: SITE_A.name,
      alreadyStopped: true,
    })
  })

  it('returns not-running info when server has no entry in manager', async () => {
    const store = createMockStore([SITE_A])
    const serverManager = createMockServerManager()

    const result = await serverStop(store, serverManager, 'my-site')

    expect(serverManager.stopServer).not.toHaveBeenCalled()
    expect(result).toEqual({
      id: SITE_A.id,
      name: SITE_A.name,
      alreadyStopped: true,
    })
  })

  it('throws CLIError when site not found', async () => {
    const store = createMockStore([])
    const serverManager = createMockServerManager()

    await expect(serverStop(store, serverManager, 'ghost')).rejects.toThrow(CLIError)
    await expect(serverStop(store, serverManager, 'ghost')).rejects.toMatchObject({
      exitCode: 1,
      message: expect.stringContaining('Site not found'),
    })
  })
})
