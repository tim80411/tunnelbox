import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TierState } from '@/shared/license-types'
import type { StoredCfAccounts } from '@/shared/types'

// --- Mock tier gate ---
const tierState = vi.hoisted(() => ({ isPro: false }))

vi.mock('@/main/license/tier-gate', () => ({
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

// --- Mock child_process ---
// Track the "cert that would be written by tunnel login" via a hook the test can set.
const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
  spawn: spawnMock,
}))

// Helper: produce a fake child process that emits 'exit' with code 0 after writing cert
function fakeCloudflaredLogin(onSpawn: () => void): unknown {
  const stdout = { on: vi.fn() }
  const stderr = { on: vi.fn() }
  const handlers: Record<string, (...args: unknown[]) => void> = {}
  const child = {
    stdout,
    stderr,
    on: (event: string, cb: (...args: unknown[]) => void) => {
      handlers[event] = cb
      return child
    },
    kill: vi.fn(),
  }
  // Defer to next tick so caller has time to register listeners
  queueMicrotask(() => {
    onSpawn()
    handlers.exit?.(0, null)
  })
  return child
}

// --- Mock fs ---
const fsState = vi.hoisted(() => ({ existingPaths: new Set<string>(), fileContents: new Map<string, string>() }))

vi.mock('node:fs', () => ({
  default: {
    existsSync: (p: string) => fsState.existingPaths.has(p),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn((p: string) => { fsState.existingPaths.delete(p) }),
    copyFileSync: vi.fn((src: string, dest: string) => {
      if (!fsState.existingPaths.has(src)) throw new Error(`ENOENT: ${src}`)
      fsState.existingPaths.add(dest)
    }),
    readFileSync: vi.fn((p: string) => {
      const content = fsState.fileContents.get(p)
      if (!content) throw new Error(`ENOENT: ${p}`)
      return content
    }),
  },
  existsSync: (p: string) => fsState.existingPaths.has(p),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn((p: string) => { fsState.existingPaths.delete(p) }),
  copyFileSync: vi.fn((src: string, dest: string) => {
    if (!fsState.existingPaths.has(src)) throw new Error(`ENOENT: ${src}`)
    fsState.existingPaths.add(dest)
  }),
  readFileSync: vi.fn((p: string) => {
    const content = fsState.fileContents.get(p)
    if (!content) throw new Error(`ENOENT: ${p}`)
    return content
  }),
}))

// --- Mock electron app ---
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-userData' },
  BrowserWindow: { getAllWindows: () => [] },
}))

// --- Mock store ---
let storedAccounts: StoredCfAccounts = { accounts: [], activeAccountId: null }
let storedSites: Array<{ id: string; cloudflareAccountId?: string | null }> = []

vi.mock('@/main/store', () => ({
  getCfAccounts: () => storedAccounts,
  saveCfAccounts: vi.fn((data: StoredCfAccounts) => { storedAccounts = data }),
  getSites: () => storedSites,
  updateSite: vi.fn((id: string, patch: { cloudflareAccountId?: string | null }) => {
    const site = storedSites.find((s) => s.id === id)
    if (site) Object.assign(site, patch)
  }),
  getSiteCfAccountId: (siteId: string) => {
    const site = storedSites.find((s) => s.id === siteId)
    return site?.cloudflareAccountId
  },
}))

// --- Mock findBinary ---
vi.mock('@/main/cloudflared/detector', () => ({
  findBinary: vi.fn(async () => '/usr/local/bin/cloudflared'),
}))

// Re-import after mocks
const getAccountManagerModule = async () => {
  const mod = await import('@/main/cloudflared/account-manager')
  return mod
}

describe('CF account manager — scenario 2: Free user blocked from adding 2nd account', () => {
  beforeEach(async () => {
    tierState.isPro = false
    fsState.existingPaths.clear()
    storedAccounts = {
      accounts: [{ id: 'acct-1', certPath: '/tmp/test-userData/cloudflared-accounts/cert-acct-1.pem', lastUsedAt: '2024-01-01T00:00:00.000Z' }],
      activeAccountId: 'acct-1'
    }
    fsState.existingPaths.add('/tmp/test-userData/cloudflared-accounts/cert-acct-1.pem')
    storedSites = []
    vi.resetModules()
  })

  it('throws FREE_ACCOUNT_LIMIT when free user already has 1 account', async () => {
    const { addAccount } = await getAccountManagerModule()
    await expect(addAccount()).rejects.toThrow('FREE_ACCOUNT_LIMIT')
  })

  it('allows adding account when Pro', async () => {
    tierState.isPro = true
    const os = await import('node:os')
    const path = await import('node:path')
    const defaultCert = path.join(os.homedir(), '.cloudflared', 'cert.pem')
    spawnMock.mockImplementation(() =>
      fakeCloudflaredLogin(() => { fsState.existingPaths.add(defaultCert) })
    )

    const { addAccount } = await getAccountManagerModule()
    const result = await addAccount()
    expect(result.accounts).toHaveLength(2)
  })
})

describe('CF account manager — scenario 4: per-site account binding persists', () => {
  beforeEach(async () => {
    tierState.isPro = true
    storedAccounts = {
      accounts: [
        { id: 'acct-1', email: 'client-a@example.com', certPath: '/tmp/cert-1.pem', lastUsedAt: '2024-01-01T00:00:00.000Z' },
        { id: 'acct-2', email: 'client-b@example.com', certPath: '/tmp/cert-2.pem', lastUsedAt: '2024-01-02T00:00:00.000Z' },
      ],
      activeAccountId: 'acct-1'
    }
    storedSites = [{ id: 'site-A', cloudflareAccountId: null }]
    vi.resetModules()
  })

  it('setSiteAccount binds account to site', async () => {
    const { setSiteAccount } = await getAccountManagerModule()
    setSiteAccount('site-A', 'acct-1')
    expect(storedSites[0].cloudflareAccountId).toBe('acct-1')
  })

  it('getCertForSite returns cert for bound account', async () => {
    storedSites[0].cloudflareAccountId = 'acct-2'
    fsState.existingPaths.add('/tmp/cert-2.pem')
    const { getCertForSite } = await getAccountManagerModule()
    expect(getCertForSite('site-A')).toBe('/tmp/cert-2.pem')
  })

  it('getCertForSite falls back to active account when no binding', async () => {
    storedSites[0].cloudflareAccountId = null
    fsState.existingPaths.add('/tmp/cert-1.pem')
    const { getCertForSite } = await getAccountManagerModule()
    expect(getCertForSite('site-A')).toBe('/tmp/cert-1.pem')
  })
})

describe('CF account manager — scenario 5: remove account unbinds bound sites', () => {
  beforeEach(async () => {
    tierState.isPro = true
    storedAccounts = {
      accounts: [
        { id: 'acct-A', certPath: '/tmp/cert-A.pem', lastUsedAt: '2024-01-01T00:00:00.000Z' },
        { id: 'acct-B', certPath: '/tmp/cert-B.pem', lastUsedAt: '2024-01-02T00:00:00.000Z' },
      ],
      activeAccountId: 'acct-A'
    }
    fsState.existingPaths.add('/tmp/cert-A.pem')
    fsState.existingPaths.add('/tmp/cert-B.pem')
    storedSites = [{ id: 'site-X', cloudflareAccountId: 'acct-A' }]
    vi.resetModules()
  })

  it('removes account and sets site binding to null', async () => {
    const { removeAccount } = await getAccountManagerModule()
    const result = removeAccount('acct-A')
    expect(result.accounts).toHaveLength(1)
    expect(result.accounts[0].id).toBe('acct-B')
    expect(storedSites[0].cloudflareAccountId).toBeNull()
  })

  it('deletes cert file on remove', async () => {
    const { removeAccount } = await getAccountManagerModule()
    removeAccount('acct-A')
    expect(fsState.existingPaths.has('/tmp/cert-A.pem')).toBe(false)
  })

  it('switches active to remaining account when active is removed', async () => {
    const { removeAccount } = await getAccountManagerModule()
    const result = removeAccount('acct-A')
    expect(result.activeAccountId).toBe('acct-B')
  })

  it('preserves other accounts OAuth cert on removal of one', async () => {
    const { removeAccount } = await getAccountManagerModule()
    removeAccount('acct-A')
    expect(fsState.existingPaths.has('/tmp/cert-B.pem')).toBe(true)
  })
})

describe('CF account manager — scenario 6: Pro→Free downgrade', () => {
  beforeEach(async () => {
    tierState.isPro = false
    storedAccounts = {
      accounts: [
        { id: 'acct-A', certPath: '/tmp/cert-A.pem', lastUsedAt: '2024-01-01T00:00:00.000Z' },
        { id: 'acct-B', certPath: '/tmp/cert-B.pem', lastUsedAt: '2024-01-03T00:00:00.000Z' },
        { id: 'acct-C', certPath: '/tmp/cert-C.pem', lastUsedAt: '2024-01-02T00:00:00.000Z' },
      ],
      activeAccountId: 'acct-A'
    }
    fsState.existingPaths.add('/tmp/cert-A.pem')
    fsState.existingPaths.add('/tmp/cert-B.pem')
    fsState.existingPaths.add('/tmp/cert-C.pem')
    vi.resetModules()
  })

  it('applyDowngradeToFree keeps all accounts data (data preservation invariant)', async () => {
    const { applyDowngradeToFree } = await getAccountManagerModule()
    applyDowngradeToFree()
    expect(storedAccounts.accounts).toHaveLength(3)
  })

  it('applyDowngradeToFree sets activeAccountId to the active account', async () => {
    const { applyDowngradeToFree } = await getAccountManagerModule()
    applyDowngradeToFree()
    expect(storedAccounts.activeAccountId).toBe('acct-A')
  })

  it('all cert files preserved after downgrade', async () => {
    const { applyDowngradeToFree } = await getAccountManagerModule()
    applyDowngradeToFree()
    expect(fsState.existingPaths.has('/tmp/cert-A.pem')).toBe(true)
    expect(fsState.existingPaths.has('/tmp/cert-B.pem')).toBe(true)
    expect(fsState.existingPaths.has('/tmp/cert-C.pem')).toBe(true)
  })
})

describe('CF account manager — parseArgoCertEnvelope', () => {
  beforeEach(() => {
    fsState.existingPaths.clear()
    fsState.fileContents.clear()
    vi.resetModules()
  })

  it('parses valid argo cert envelope', async () => {
    const payload = Buffer.from(JSON.stringify({ zoneID: 'z1', accountID: 'acc123', apiToken: 'tok456' })).toString('base64')
    const certContent = `-----BEGIN ARGO TUNNEL TOKEN-----\n${payload}\n-----END ARGO TUNNEL TOKEN-----\n`
    fsState.fileContents.set('/tmp/cert.pem', certContent)
    fsState.existingPaths.add('/tmp/cert.pem')

    const { parseArgoCertEnvelope } = await getAccountManagerModule()
    const result = parseArgoCertEnvelope('/tmp/cert.pem')
    expect(result).toEqual({ cfAccountId: 'acc123', apiToken: 'tok456' })
  })

  it('returns null for missing ARGO TUNNEL TOKEN block', async () => {
    fsState.fileContents.set('/tmp/cert.pem', '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n')
    fsState.existingPaths.add('/tmp/cert.pem')

    const { parseArgoCertEnvelope } = await getAccountManagerModule()
    expect(parseArgoCertEnvelope('/tmp/cert.pem')).toBeNull()
  })

  it('returns null for unreadable file', async () => {
    const { parseArgoCertEnvelope } = await getAccountManagerModule()
    expect(parseArgoCertEnvelope('/nonexistent.pem')).toBeNull()
  })
})

describe('CF account manager — fetchCfAccountName', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns account name on successful CF API call', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, result: { name: "user@example.com's Account" } })
    }) as typeof fetch

    const { fetchCfAccountName } = await getAccountManagerModule()
    const name = await fetchCfAccountName('test-token', 'acct-hex-id')
    expect(name).toBe("user@example.com's Account")
  })

  it('returns null when CF API returns success=false', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, errors: [{ code: 9109 }] })
    }) as typeof fetch

    const { fetchCfAccountName } = await getAccountManagerModule()
    expect(await fetchCfAccountName('bad-token', 'acct-id')).toBeNull()
  })

  it('returns null on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as typeof fetch

    const { fetchCfAccountName } = await getAccountManagerModule()
    expect(await fetchCfAccountName('bad-token', 'acct-id')).toBeNull()
  })

  it('returns null on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network failure')) as typeof fetch

    const { fetchCfAccountName } = await getAccountManagerModule()
    expect(await fetchCfAccountName('bad-token', 'acct-id')).toBeNull()
  })
})

describe('CF account manager — setAccountLabel', () => {
  beforeEach(async () => {
    storedAccounts = {
      accounts: [
        { id: 'acct-1', email: 'a@example.com', certPath: '/tmp/cert-1.pem', lastUsedAt: '2024-01-01T00:00:00.000Z' },
      ],
      activeAccountId: 'acct-1'
    }
    storedSites = []
    vi.resetModules()
  })

  it('sets a custom label', async () => {
    const { setAccountLabel } = await getAccountManagerModule()
    const result = setAccountLabel('acct-1', 'Client A')
    expect(result.accounts[0].customLabel).toBe('Client A')
  })

  it('clears custom label when null passed', async () => {
    storedAccounts.accounts[0] = { ...storedAccounts.accounts[0], customLabel: 'Old Label' }
    const { setAccountLabel } = await getAccountManagerModule()
    const result = setAccountLabel('acct-1', null)
    expect(result.accounts[0].customLabel).toBeUndefined()
  })

  it('throws when account not found', async () => {
    const { setAccountLabel } = await getAccountManagerModule()
    expect(() => setAccountLabel('nonexistent', 'Label')).toThrow('帳號不存在')
  })
})
