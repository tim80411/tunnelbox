# Provider Abstraction Layer Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a provider-agnostic tunnel architecture so TunnelBox can support multiple tunnel backends. Phase 1 wraps existing Cloudflare code behind the new interface with zero user-facing change.

**Architecture:** New `TunnelProvider` interface + `TunnelProviderManager` sit between `ipc-handlers.ts` and the existing `cloudflared/*` modules. `CloudflareProvider` is a thin adapter. All existing cloudflared code stays untouched.

**Tech Stack:** TypeScript, Electron, Vitest

**Spec:** `.project/specs/2026-03-21-provider-abstraction-commercialization-design.md`

**Spec deviations (intentional):**
- Spec says types go in `src/shared/types.ts`; plan uses new `src/shared/provider-types.ts` to avoid bloating existing file
- Spec says `tunnel-provider.ts` holds both interface and manager; plan splits them (types in `shared/`, manager in `main/`)
- Spec says ProcessManager injected via constructor; plan keeps existing module-level init to avoid refactoring cloudflared modules in Phase 1

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/shared/provider-types.ts` | Provider-agnostic types (`ProviderEnv`, `ProviderAuthInfo`, `ProviderTunnelInfo`, `TunnelProvider` interface) |
| Create | `src/main/tunnel-provider-manager.ts` | `TunnelProviderManager` class — registry, per-site dispatch, restore/stopAll |
| Create | `src/main/providers/cloudflare-provider.ts` | `CloudflareProvider` — adapter wrapping existing `cloudflared/*` modules |
| Modify | `src/main/ipc-handlers.ts` | Route all tunnel ops through `TunnelProviderManager` instead of direct cloudflared imports |
| Modify | `src/main/index.ts` | Initialize manager + register provider; delegate restore/shutdown to manager |
| Modify | `src/shared/types.ts` | Add optional `providerType` to `StoredSite` |
| Create | `tests/main/tunnel-provider-manager.test.ts` | Unit tests for TunnelProviderManager |
| Create | `tests/main/providers/cloudflare-provider.test.ts` | Unit tests for CloudflareProvider adapter |

---

### Task 1: Shared Provider Types

**Files:**
- Create: `src/shared/provider-types.ts`
- Test: `tests/shared/provider-types.test.ts`

- [ ] **Step 1: Write the type-check test**

```typescript
// tests/shared/provider-types.test.ts
import { describe, it, expectTypeOf } from 'vitest'
import type {
  ProviderEnv,
  ProviderAuthInfo,
  ProviderTunnelInfo,
  TunnelProvider
} from '../../src/shared/provider-types'

describe('Provider types', () => {
  it('ProviderEnv has required fields', () => {
    expectTypeOf<ProviderEnv>().toHaveProperty('status')
    expectTypeOf<ProviderEnv['status']>().toEqualTypeOf<
      'checking' | 'available' | 'not_installed' | 'outdated' | 'installing' | 'install_failed' | 'error'
    >()
  })

  it('ProviderAuthInfo includes not_required status', () => {
    const auth: ProviderAuthInfo = { status: 'not_required' }
    expectTypeOf(auth.status).toMatchTypeOf<string>()
  })

  it('ProviderTunnelInfo has providerType', () => {
    expectTypeOf<ProviderTunnelInfo>().toHaveProperty('providerType')
  })

  it('TunnelProvider has required methods', () => {
    expectTypeOf<TunnelProvider>().toHaveProperty('detect')
    expectTypeOf<TunnelProvider>().toHaveProperty('startTunnel')
    expectTypeOf<TunnelProvider>().toHaveProperty('stopTunnel')
    expectTypeOf<TunnelProvider>().toHaveProperty('stopAll')
    expectTypeOf<TunnelProvider>().toHaveProperty('restoreAll')
  })

  it('TunnelProvider.bindDomain is optional', () => {
    expectTypeOf<TunnelProvider['bindDomain']>().toBeNullable()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/shared/provider-types.test.ts`
Expected: FAIL — module `../../src/shared/provider-types` not found

- [ ] **Step 3: Write the types**

```typescript
// src/shared/provider-types.ts
import type { TunnelStatus } from './types'

/** Provider environment status (generalizes CloudflaredEnv) */
export interface ProviderEnv {
  status: 'checking' | 'available' | 'not_installed' | 'outdated' | 'installing' | 'install_failed' | 'error'
  version?: string
  errorMessage?: string
}

/** Provider auth info (generalizes CloudflareAuth) */
export interface ProviderAuthInfo {
  status: 'logged_out' | 'logging_in' | 'logged_in' | 'expired' | 'not_required'
  accountEmail?: string
  accountId?: string
}

/** Provider-agnostic tunnel info (generalizes TunnelInfo) */
export interface ProviderTunnelInfo {
  providerType: string
  status: TunnelStatus
  publicUrl?: string
  tunnelId?: string
  errorMessage?: string
}

/** Provider-specific tunnel options — each provider casts to its own type */
export type TunnelOptions = Record<string, unknown>

/** The core provider interface */
export interface TunnelProvider {
  readonly type: string

  // Environment
  detect(): Promise<ProviderEnv>
  install(): Promise<void>

  // Auth
  login(): Promise<ProviderAuthInfo>
  logout(): Promise<void>
  getAuthStatus(): ProviderAuthInfo

  // Tunnel lifecycle
  startTunnel(siteId: string, port: number, opts?: TunnelOptions): Promise<string>
  stopTunnel(siteId: string): Promise<void>
  getTunnelInfo(siteId: string): ProviderTunnelInfo | undefined

  // Restore on boot
  restoreAll(getSitePort: (siteId: string) => number | null): Promise<void>

  // Fixed domain (optional)
  bindDomain?(siteId: string, port: number, domain: string): Promise<string>
  unbindDomain?(siteId: string): Promise<void>

  // Cleanup
  stopAll(): Promise<void>
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/shared/provider-types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/provider-types.ts tests/shared/provider-types.test.ts
git commit -m "feat: add provider-agnostic tunnel types and TunnelProvider interface"
```

---

### Task 2: Add `providerType` to StoredSite

**Files:**
- Modify: `src/shared/types.ts:71-75` (StoredSite interface)

- [ ] **Step 1: Add the optional field**

In `src/shared/types.ts`, update `StoredSite`:

```typescript
export interface StoredSite {
  id: string
  name: string
  folderPath: string
  providerType?: string  // 'cloudflare' | 'frp' — defaults to 'cloudflare' at read time
}
```

- [ ] **Step 2: Run existing tests to verify nothing breaks**

Run: `pnpm test`
Expected: All existing tests PASS (optional field is backward-compatible)

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add optional providerType field to StoredSite"
```

---

### Task 3: TunnelProviderManager

**Files:**
- Create: `src/main/tunnel-provider-manager.ts`
- Test: `tests/main/tunnel-provider-manager.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/main/tunnel-provider-manager.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron-store dependency before importing manager
vi.mock('../../src/main/store', () => ({
  getSites: vi.fn().mockReturnValue([]),
}))

import { TunnelProviderManager } from '../../src/main/tunnel-provider-manager'
import * as siteStore from '../../src/main/store'
import type { TunnelProvider, ProviderTunnelInfo } from '../../src/shared/provider-types'

function createMockProvider(type: string): TunnelProvider {
  return {
    type,
    detect: vi.fn().mockResolvedValue({ status: 'available' }),
    install: vi.fn().mockResolvedValue(undefined),
    login: vi.fn().mockResolvedValue({ status: 'logged_in' }),
    logout: vi.fn().mockResolvedValue(undefined),
    getAuthStatus: vi.fn().mockReturnValue({ status: 'logged_out' }),
    startTunnel: vi.fn().mockResolvedValue('https://example.com'),
    stopTunnel: vi.fn().mockResolvedValue(undefined),
    getTunnelInfo: vi.fn().mockReturnValue(undefined),
    restoreAll: vi.fn().mockResolvedValue(undefined),
    stopAll: vi.fn().mockResolvedValue(undefined),
  }
}

describe('TunnelProviderManager', () => {
  let manager: TunnelProviderManager

  beforeEach(() => {
    manager = new TunnelProviderManager()
  })

  it('registers and retrieves a provider by type', () => {
    const provider = createMockProvider('cloudflare')
    manager.register(provider)
    expect(manager.get('cloudflare')).toBe(provider)
  })

  it('throws on unknown provider type', () => {
    expect(() => manager.get('unknown')).toThrow()
  })

  it('getForSite returns cloudflare as default', () => {
    const cf = createMockProvider('cloudflare')
    manager.register(cf)
    // No providerType set on site — should default to cloudflare
    expect(manager.getForSite('any-site-id')).toBe(cf)
  })

  it('stopAll delegates to all registered providers', async () => {
    const cf = createMockProvider('cloudflare')
    const frp = createMockProvider('frp')
    manager.register(cf)
    manager.register(frp)

    await manager.stopAll()

    expect(cf.stopAll).toHaveBeenCalledOnce()
    expect(frp.stopAll).toHaveBeenCalledOnce()
  })

  it('restoreAll delegates to all registered providers', async () => {
    const cf = createMockProvider('cloudflare')
    manager.register(cf)

    const getSitePort = vi.fn().mockReturnValue(3000)
    await manager.restoreAll(getSitePort)

    expect(cf.restoreAll).toHaveBeenCalledWith(getSitePort)
  })

  it('getForSite returns correct provider when site has explicit providerType', () => {
    const cf = createMockProvider('cloudflare')
    const frp = createMockProvider('frp')
    manager.register(cf)
    manager.register(frp)

    vi.mocked(siteStore.getSites).mockReturnValue([
      { id: 'site-frp', name: 'FRP Site', folderPath: '/tmp/frp', providerType: 'frp' }
    ])

    expect(manager.getForSite('site-frp')).toBe(frp)
  })

  it('getTunnelInfoAcrossProviders returns info from first matching provider', () => {
    const tunnelInfo: ProviderTunnelInfo = {
      providerType: 'cloudflare',
      status: 'running',
      publicUrl: 'https://test.trycloudflare.com'
    }
    const cf = createMockProvider('cloudflare')
    vi.mocked(cf.getTunnelInfo).mockReturnValue(tunnelInfo)
    manager.register(cf)

    expect(manager.getTunnelInfoAcrossProviders('site1')).toBe(tunnelInfo)
  })

  it('getTunnelInfoAcrossProviders returns undefined when no provider has tunnel', () => {
    const cf = createMockProvider('cloudflare')
    vi.mocked(cf.getTunnelInfo).mockReturnValue(undefined)
    manager.register(cf)

    expect(manager.getTunnelInfoAcrossProviders('site1')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/main/tunnel-provider-manager.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement TunnelProviderManager**

```typescript
// src/main/tunnel-provider-manager.ts
import * as siteStore from './store'
import type { TunnelProvider, ProviderTunnelInfo } from '../shared/provider-types'

const DEFAULT_PROVIDER = 'cloudflare'

export class TunnelProviderManager {
  private providers: Map<string, TunnelProvider> = new Map()

  register(provider: TunnelProvider): void {
    this.providers.set(provider.type, provider)
  }

  get(type: string): TunnelProvider {
    const provider = this.providers.get(type)
    if (!provider) {
      throw new Error(`Unknown tunnel provider: ${type}`)
    }
    return provider
  }

  getForSite(siteId: string): TunnelProvider {
    const sites = siteStore.getSites()
    const site = sites.find((s) => s.id === siteId)
    const providerType = site?.providerType || DEFAULT_PROVIDER
    return this.get(providerType)
  }

  getTunnelInfoAcrossProviders(siteId: string): ProviderTunnelInfo | undefined {
    for (const provider of this.providers.values()) {
      const info = provider.getTunnelInfo(siteId)
      if (info) return info
    }
    return undefined
  }

  async restoreAll(getSitePort: (siteId: string) => number | null): Promise<void> {
    const promises = Array.from(this.providers.values()).map((p) =>
      p.restoreAll(getSitePort)
    )
    await Promise.allSettled(promises)
  }

  async stopAll(): Promise<void> {
    const promises = Array.from(this.providers.values()).map((p) => p.stopAll())
    await Promise.allSettled(promises)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/main/tunnel-provider-manager.test.ts`
Expected: PASS

Note: The `getForSite` test uses the default fallback because we mock at the store level. The real store interaction is tested via integration in Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/main/tunnel-provider-manager.ts tests/main/tunnel-provider-manager.test.ts
git commit -m "feat: add TunnelProviderManager with registry and per-site dispatch"
```

---

### Task 4: CloudflareProvider Adapter

**Files:**
- Create: `src/main/providers/cloudflare-provider.ts`
- Test: `tests/main/providers/cloudflare-provider.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/main/providers/cloudflare-provider.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all cloudflared modules BEFORE importing CloudflareProvider
vi.mock('../../../src/main/cloudflared', () => ({
  detectCloudflared: vi.fn().mockResolvedValue({ status: 'available', version: '2024.6.1' }),
  installCloudflared: vi.fn().mockResolvedValue('/path/to/cloudflared'),
  initQuickTunnel: vi.fn(),
  initNamedTunnel: vi.fn(),
  startQuickTunnel: vi.fn().mockResolvedValue('https://test.trycloudflare.com'),
  stopQuickTunnel: vi.fn(),
  getTunnelInfo: vi.fn().mockReturnValue(undefined),
  hasTunnel: vi.fn().mockReturnValue(false),
  startNamedTunnel: vi.fn().mockResolvedValue(undefined),
  stopNamedTunnel: vi.fn(),
  getNamedTunnelInfo: vi.fn().mockReturnValue(undefined),
  stopAllQuickTunnels: vi.fn(),
  stopAllNamedTunnels: vi.fn(),
  restoreNamedTunnels: vi.fn().mockResolvedValue(undefined),
  loginCloudflare: vi.fn().mockResolvedValue({ status: 'logged_in' }),
  logoutCloudflare: vi.fn(),
  getAuthStatus: vi.fn().mockReturnValue({ status: 'logged_out' }),
  bindFixedDomain: vi.fn().mockResolvedValue('https://my.domain.com'),
  unbindFixedDomain: vi.fn().mockResolvedValue(undefined),
  ProcessManager: vi.fn(),
}))

import { CloudflareProvider } from '../../../src/main/providers/cloudflare-provider'
import {
  startQuickTunnel,
  stopQuickTunnel,
  startNamedTunnel,
  stopNamedTunnel,
  stopAllQuickTunnels,
  stopAllNamedTunnels,
  restoreNamedTunnels,
  loginCloudflare,
  logoutCloudflare,
  getAuthStatus,
  bindFixedDomain,
  unbindFixedDomain,
  detectCloudflared,
  installCloudflared,
} from '../../../src/main/cloudflared'

describe('CloudflareProvider', () => {
  let provider: CloudflareProvider

  beforeEach(() => {
    vi.clearAllMocks()
    provider = new CloudflareProvider()
  })

  it('has type "cloudflare"', () => {
    expect(provider.type).toBe('cloudflare')
  })

  it('detect() delegates to detectCloudflared and maps result', async () => {
    const env = await provider.detect()
    expect(detectCloudflared).toHaveBeenCalled()
    expect(env.status).toBe('available')
  })

  it('install() delegates to installCloudflared', async () => {
    await provider.install()
    expect(installCloudflared).toHaveBeenCalled()
  })

  it('startTunnel with mode=quick delegates to startQuickTunnel', async () => {
    const url = await provider.startTunnel('site1', 3000, { mode: 'quick' })
    expect(startQuickTunnel).toHaveBeenCalledWith('site1', 3000)
    expect(url).toBe('https://test.trycloudflare.com')
  })

  it('startTunnel with mode=named delegates to startNamedTunnel', async () => {
    await provider.startTunnel('site1', 3000, { mode: 'named' })
    expect(startNamedTunnel).toHaveBeenCalledWith('site1', 3000)
  })

  it('startTunnel defaults to quick mode', async () => {
    await provider.startTunnel('site1', 3000)
    expect(startQuickTunnel).toHaveBeenCalledWith('site1', 3000)
  })

  it('stopTunnel delegates to both stop functions', async () => {
    await provider.stopTunnel('site1')
    expect(stopQuickTunnel).toHaveBeenCalledWith('site1')
    expect(stopNamedTunnel).toHaveBeenCalledWith('site1')
  })

  it('stopAll delegates to both stopAll functions', async () => {
    await provider.stopAll()
    expect(stopAllQuickTunnels).toHaveBeenCalled()
    expect(stopAllNamedTunnels).toHaveBeenCalled()
  })

  it('restoreAll delegates to restoreNamedTunnels', async () => {
    const getSitePort = vi.fn()
    await provider.restoreAll(getSitePort)
    expect(restoreNamedTunnels).toHaveBeenCalledWith(getSitePort)
  })

  it('login delegates to loginCloudflare and maps result', async () => {
    const auth = await provider.login()
    expect(loginCloudflare).toHaveBeenCalled()
    expect(auth.status).toBe('logged_in')
  })

  it('logout delegates to logoutCloudflare', async () => {
    await provider.logout()
    expect(logoutCloudflare).toHaveBeenCalled()
  })

  it('getAuthStatus delegates and maps result', () => {
    const auth = provider.getAuthStatus()
    expect(getAuthStatus).toHaveBeenCalled()
    expect(auth.status).toBe('logged_out')
  })

  it('bindDomain delegates to bindFixedDomain', async () => {
    const url = await provider.bindDomain!('site1', 3000, 'my.domain.com')
    expect(bindFixedDomain).toHaveBeenCalledWith('site1', 3000, 'my.domain.com')
    expect(url).toBe('https://my.domain.com')
  })

  it('unbindDomain delegates to unbindFixedDomain', async () => {
    await provider.unbindDomain!('site1')
    expect(unbindFixedDomain).toHaveBeenCalledWith('site1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/main/providers/cloudflare-provider.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement CloudflareProvider**

```typescript
// src/main/providers/cloudflare-provider.ts
import {
  detectCloudflared,
  installCloudflared,
  startQuickTunnel,
  stopQuickTunnel,
  getTunnelInfo,
  startNamedTunnel,
  stopNamedTunnel,
  getNamedTunnelInfo,
  stopAllQuickTunnels,
  stopAllNamedTunnels,
  restoreNamedTunnels,
  loginCloudflare,
  logoutCloudflare,
  getAuthStatus,
  bindFixedDomain,
  unbindFixedDomain
} from '../cloudflared'
import type {
  TunnelProvider,
  ProviderEnv,
  ProviderAuthInfo,
  ProviderTunnelInfo,
  TunnelOptions
} from '../../shared/provider-types'
import type { CloudflareAuth, CloudflaredEnv, TunnelInfo } from '../../shared/types'

/** Maps CloudflaredEnv -> ProviderEnv */
function mapEnv(env: CloudflaredEnv): ProviderEnv {
  return {
    status: env.status,
    version: env.version,
    errorMessage: env.errorMessage
  }
}

/** Maps CloudflareAuth -> ProviderAuthInfo */
function mapAuth(auth: CloudflareAuth): ProviderAuthInfo {
  return {
    status: auth.status,
    accountEmail: auth.accountEmail,
    accountId: auth.accountId
  }
}

/** Maps TunnelInfo -> ProviderTunnelInfo */
function mapTunnel(info: TunnelInfo): ProviderTunnelInfo {
  return {
    providerType: 'cloudflare',
    status: info.status,
    publicUrl: info.publicUrl,
    tunnelId: info.tunnelId,
    errorMessage: info.errorMessage
  }
}

export class CloudflareProvider implements TunnelProvider {
  readonly type = 'cloudflare'

  async detect(): Promise<ProviderEnv> {
    const env = await detectCloudflared()
    return mapEnv(env)
  }

  async install(): Promise<void> {
    await installCloudflared()
  }

  async login(): Promise<ProviderAuthInfo> {
    const auth = await loginCloudflare()
    return mapAuth(auth)
  }

  async logout(): Promise<void> {
    logoutCloudflare()
  }

  getAuthStatus(): ProviderAuthInfo {
    const auth = getAuthStatus()
    return mapAuth(auth)
  }

  async startTunnel(siteId: string, port: number, opts?: TunnelOptions): Promise<string> {
    const mode = (opts?.mode as string) || 'quick'
    if (mode === 'named') {
      await startNamedTunnel(siteId, port)
      const info = getNamedTunnelInfo(siteId)
      return info?.publicUrl || ''
    }
    return startQuickTunnel(siteId, port)
  }

  async stopTunnel(siteId: string): Promise<void> {
    stopQuickTunnel(siteId)
    stopNamedTunnel(siteId)
  }

  getTunnelInfo(siteId: string): ProviderTunnelInfo | undefined {
    const quick = getTunnelInfo(siteId)
    if (quick) return mapTunnel(quick)
    const named = getNamedTunnelInfo(siteId)
    if (named) return mapTunnel(named)
    return undefined
  }

  async restoreAll(getSitePort: (siteId: string) => number | null): Promise<void> {
    await restoreNamedTunnels(getSitePort)
  }

  async bindDomain(siteId: string, port: number, domain: string): Promise<string> {
    return bindFixedDomain(siteId, port, domain)
  }

  async unbindDomain(siteId: string): Promise<void> {
    await unbindFixedDomain(siteId)
  }

  async stopAll(): Promise<void> {
    stopAllQuickTunnels()
    stopAllNamedTunnels()
  }
}
```

All imports use the barrel at `'../cloudflared'` — this matches the test mock path `'../../../src/main/cloudflared'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/main/providers/cloudflare-provider.test.ts`
Expected: PASS

- [ ] **Step 5: Run all tests to verify no regressions**

Run: `pnpm test`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/providers/cloudflare-provider.ts tests/main/providers/cloudflare-provider.test.ts
git commit -m "feat: add CloudflareProvider adapter wrapping existing cloudflared modules"
```

---

### Task 5: Wire Manager into ipc-handlers.ts

**Files:**
- Modify: `src/main/ipc-handlers.ts`

This is the key integration task. Replace direct cloudflared imports with manager delegation. The IPC channel names and return types stay identical — renderer sees no change.

- [ ] **Step 1: Update imports and function signature**

In `src/main/ipc-handlers.ts`, replace lines 1-21:

**Old:**
```typescript
import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { ServerManager } from './server-manager'
import * as siteStore from './store'
import {
  detectCloudflared,
  installCloudflared,
  startQuickTunnel,
  stopQuickTunnel,
  getTunnelInfo,
  hasTunnel,
  loginCloudflare,
  logoutCloudflare,
  getAuthStatus,
  bindFixedDomain,
  unbindFixedDomain,
  startNamedTunnel,
  stopNamedTunnel,
  getNamedTunnelInfo,
  stopAllNamedTunnels
} from './cloudflared'
import type { SiteInfo, CloudflaredEnv } from '../shared/types'
```

**New:**
```typescript
import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { ServerManager } from './server-manager'
import * as siteStore from './store'
import type { TunnelProviderManager } from './tunnel-provider-manager'
import type { SiteInfo, CloudflaredEnv } from '../shared/types'
```

- [ ] **Step 2: Update registerIpcHandlers signature to accept manager**

Change line 66 function signature:

**Old:**
```typescript
export function registerIpcHandlers(manager: ServerManager): void {
```

**New:**
```typescript
export function registerIpcHandlers(
  manager: ServerManager,
  tunnelManager: TunnelProviderManager
): void {
```

- [ ] **Step 3: Update toSiteInfo to use tunnelManager**

Replace the `toSiteInfo` function (lines 25-45) to use the tunnel manager:

**Old:**
```typescript
function toSiteInfo(server: {
  id: string
  name: string
  folderPath: string
  port: number
  status: 'running' | 'stopped' | 'error'
}): SiteInfo {
  const info: SiteInfo = {
    id: server.id,
    name: server.name,
    folderPath: server.folderPath,
    port: server.port,
    status: server.status,
    url: server.status === 'running' ? `http://localhost:${server.port}` : ''
  }
  const tunnel = getTunnelInfo(server.id) || getNamedTunnelInfo(server.id)
  if (tunnel) {
    info.tunnel = tunnel
  }
  return info
}
```

**New (make it a closure inside registerIpcHandlers that captures tunnelManager):**

Move `toSiteInfo` inside `registerIpcHandlers` so it can access `tunnelManager`:

```typescript
  function toSiteInfo(server: {
    id: string
    name: string
    folderPath: string
    port: number
    status: 'running' | 'stopped' | 'error'
  }): SiteInfo {
    const info: SiteInfo = {
      id: server.id,
      name: server.name,
      folderPath: server.folderPath,
      port: server.port,
      status: server.status,
      url: server.status === 'running' ? `http://localhost:${server.port}` : ''
    }
    const providerInfo = tunnelManager.getTunnelInfoAcrossProviders(server.id)
    if (providerInfo) {
      // Map ProviderTunnelInfo back to TunnelInfo for renderer compatibility
      info.tunnel = {
        type: providerInfo.providerType === 'cloudflare'
          ? (providerInfo.tunnelId ? 'named' : 'quick')
          : 'quick',
        status: providerInfo.status,
        publicUrl: providerInfo.publicUrl,
        tunnelId: providerInfo.tunnelId,
        errorMessage: providerInfo.errorMessage
      }
    }
    return info
  }
```

- [ ] **Step 4: Update remove-site handler (fix existing gap)**

Replace the `remove-site` handler (lines 108-120):

**Old:**
```typescript
  ipcMain.handle('remove-site', async (_event, id: string) => {
    try {
      // Auto-stop tunnel when site is removed
      if (hasTunnel(id)) {
        stopQuickTunnel(id)
      }
```

**New:**
```typescript
  ipcMain.handle('remove-site', async (_event, id: string) => {
    try {
      // Auto-stop any tunnel when site is removed (best-effort, don't block removal)
      try { await tunnelManager.getForSite(id).stopTunnel(id) } catch { /* ignore */ }
```

- [ ] **Step 5: Update stop-server handler (fix existing gap)**

Replace the `stop-server` handler (lines 149-160):

**Old:**
```typescript
  ipcMain.handle('stop-server', async (_event, id: string) => {
    try {
      // Auto-stop tunnel when server stops (Story 22)
      if (hasTunnel(id)) {
        stopQuickTunnel(id)
      }
```

**New:**
```typescript
  ipcMain.handle('stop-server', async (_event, id: string) => {
    try {
      // Auto-stop any tunnel when server stops (best-effort, don't block server stop)
      try { await tunnelManager.getForSite(id).stopTunnel(id) } catch { /* ignore */ }
```

- [ ] **Step 6: Update tunnel handlers to use cloudflare provider**

Replace quick tunnel handlers (lines 193-214), cloudflared env handlers (lines 218-240), auth handlers (lines 244-269), and named tunnel handlers (lines 273-316) to delegate through `tunnelManager.get('cloudflare')`:

```typescript
  // --- Quick Tunnel ---
  const cfProvider = tunnelManager.get('cloudflare')

  ipcMain.handle('start-quick-tunnel', async (_event, siteId: string) => {
    try {
      const server = serverManager.getServer(siteId)
      if (!server) throw new Error('找不到此網頁')
      if (server.status !== 'running') throw new Error('本地伺服器尚未啟動')

      const url = await cfProvider.startTunnel(siteId, server.port, { mode: 'quick' })
      broadcastSiteUpdate()
      return url
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '啟動 Quick Tunnel 失敗')
    }
  })

  ipcMain.handle('stop-tunnel', async (_event, siteId: string) => {
    try {
      // This channel is used by renderer for quick tunnel stop only.
      // Named tunnels use 'stop-named-tunnel' channel.
      // CloudflareProvider.stopTunnel stops both, which is fine here
      // because this handler is only called when user explicitly stops.
      await tunnelManager.getForSite(siteId).stopTunnel(siteId)
      broadcastSiteUpdate()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '停止 Tunnel 失敗')
    }
  })

  // --- Cloudflared Environment ---

  ipcMain.handle('get-cloudflared-status', async () => {
    try {
      return await cfProvider.detect()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '偵測 cloudflared 失敗')
    }
  })

  ipcMain.handle('install-cloudflared', async () => {
    try {
      broadcastCloudflaredStatus({ status: 'installing' })
      await cfProvider.install()
      const env = await cfProvider.detect()
      broadcastCloudflaredStatus(env as CloudflaredEnv)
    } catch (err) {
      const errorEnv: CloudflaredEnv = {
        status: 'install_failed',
        errorMessage: err instanceof Error ? err.message : '安裝 cloudflared 失敗'
      }
      broadcastCloudflaredStatus(errorEnv)
      throw new Error(errorEnv.errorMessage)
    }
  })

  // --- Cloudflare Auth ---

  ipcMain.handle('login-cloudflare', async () => {
    try {
      return await cfProvider.login()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '登入 Cloudflare 失敗')
    }
  })

  ipcMain.handle('logout-cloudflare', async () => {
    try {
      // Intentional behavior change: original only stopped named tunnels.
      // Now stops ALL tunnels (quick + named) before logout, which is more correct.
      await cfProvider.stopAll()
      await cfProvider.logout()
      broadcastSiteUpdate()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '登出 Cloudflare 失敗')
    }
  })

  ipcMain.handle('get-auth-status', async () => {
    try {
      return cfProvider.getAuthStatus()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '取得認證狀態失敗')
    }
  })

  // --- Fixed Domain (Named Tunnel + DNS) ---

  ipcMain.handle('bind-fixed-domain', async (_event, siteId: string, domain: string) => {
    try {
      const server = serverManager.getServer(siteId)
      if (!server) throw new Error('找不到此網頁')
      if (server.status !== 'running') throw new Error('本地伺服器尚未啟動')

      const url = await cfProvider.bindDomain!(siteId, server.port, domain)
      broadcastSiteUpdate()
      return url
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '綁定固定網域失敗')
    }
  })

  ipcMain.handle('unbind-fixed-domain', async (_event, siteId: string) => {
    try {
      await cfProvider.unbindDomain!(siteId)
      broadcastSiteUpdate()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '解除綁定失敗')
    }
  })

  ipcMain.handle('start-named-tunnel', async (_event, siteId: string) => {
    try {
      const server = serverManager.getServer(siteId)
      if (!server) throw new Error('找不到此網頁')
      if (server.status !== 'running') throw new Error('本地伺服器尚未啟動')

      await cfProvider.startTunnel(siteId, server.port, { mode: 'named' })
      broadcastSiteUpdate()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '啟動 Named Tunnel 失敗')
    }
  })

  ipcMain.handle('stop-named-tunnel', async (_event, siteId: string) => {
    try {
      await cfProvider.stopTunnel(siteId)
      broadcastSiteUpdate()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '停止 Named Tunnel 失敗')
    }
  })
```

- [ ] **Step 7: Run all tests**

Run: `pnpm test`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add src/main/ipc-handlers.ts
git commit -m "refactor: route all tunnel operations through TunnelProviderManager

Fixes existing gap where remove-site and stop-server only stopped
quick tunnels but not named tunnels."
```

---

### Task 6: Wire Manager into main/index.ts

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Update imports**

Replace lines 1-15:

**Old:**
```typescript
import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { ServerManager } from './server-manager'
import {
  ProcessManager,
  initQuickTunnel,
  initNamedTunnel,
  restoreNamedTunnels,
  stopAllNamedTunnels,
  stopAllQuickTunnels
} from './cloudflared'
import { registerIpcHandlers } from './ipc-handlers'
import { createLogger } from './logger'
import * as siteStore from './store'
```

**New:**
```typescript
import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { ServerManager } from './server-manager'
import { ProcessManager, initQuickTunnel, initNamedTunnel } from './cloudflared'
import { TunnelProviderManager } from './tunnel-provider-manager'
import { CloudflareProvider } from './providers/cloudflare-provider'
import { registerIpcHandlers } from './ipc-handlers'
import { createLogger } from './logger'
import * as siteStore from './store'
```

- [ ] **Step 2: Replace initialization block**

Replace lines 20-23:

**Old:**
```typescript
const serverManager = new ServerManager()
export const processManager = new ProcessManager()
initQuickTunnel(processManager)
initNamedTunnel(processManager)
```

**New:**
```typescript
const serverManager = new ServerManager()
export const processManager = new ProcessManager()
initQuickTunnel(processManager)
initNamedTunnel(processManager)

const tunnelManager = new TunnelProviderManager()
tunnelManager.register(new CloudflareProvider())
```

- [ ] **Step 3: Update registerIpcHandlers call**

Replace line 80:

**Old:**
```typescript
    registerIpcHandlers(serverManager)
```

**New:**
```typescript
    registerIpcHandlers(serverManager, tunnelManager)
```

- [ ] **Step 4: Update tunnel restore to use manager**

Replace lines 99-105:

**Old:**
```typescript
    // Restore named tunnels (Story 27: auto-reconnect on boot)
    restoreNamedTunnels((siteId) => {
      const server = serverManager.getServer(siteId)
      return server && server.status === 'running' ? server.port : null
    }).catch((err) => {
      log.error('Failed to restore named tunnels:', err)
    })
```

**New:**
```typescript
    // Restore all provider tunnels on boot
    tunnelManager.restoreAll((siteId) => {
      const server = serverManager.getServer(siteId)
      return server && server.status === 'running' ? server.port : null
    }).catch((err) => {
      log.error('Failed to restore tunnels:', err)
    })
```

- [ ] **Step 5: Update shutdown to use manager**

Replace lines 142-144:

**Old:**
```typescript
  // Mark all tunnels as stopped first (prevents reconnect timers)
  stopAllNamedTunnels()
  stopAllQuickTunnels()
```

**New:**
```typescript
  // Mark all tunnels as stopped first (prevents reconnect timers)
  tunnelManager.stopAll().catch(() => {})
```

Also replace line 154:

**Old:**
```typescript
  Promise.allSettled([processManager.killAll(), serverManager.stopAll()]).then(() => {
```

**New:**
```typescript
  Promise.allSettled([tunnelManager.stopAll(), processManager.killAll(), serverManager.stopAll()]).then(() => {
```

And update SIGTERM/SIGINT handlers (lines 186, 193) similarly:

**Old:**
```typescript
  Promise.allSettled([processManager.killAll(), serverManager.stopAll()]).finally(() => {
```

**New:**
```typescript
  Promise.allSettled([tunnelManager.stopAll(), processManager.killAll(), serverManager.stopAll()]).finally(() => {
```

- [ ] **Step 6: Run all tests**

Run: `pnpm test`
Expected: All PASS

- [ ] **Step 7: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/main/index.ts
git commit -m "refactor: initialize TunnelProviderManager and delegate restore/shutdown"
```

---

### Task 7: Smoke Test — Manual Verification

This task verifies that the abstraction layer is transparent — the app behaves identically to before.

- [ ] **Step 1: Build the app**

Run: `pnpm build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Run in dev mode**

Run: `pnpm dev`

Manual checks:
1. App starts without errors
2. Can add a site (folder → localhost server starts)
3. Can start a Quick Tunnel (gets trycloudflare.com URL)
4. Can stop the tunnel
5. Can stop and remove the site
6. No console errors related to tunnel provider

- [ ] **Step 3: Run full test suite**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 4: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: address smoke test issues in provider abstraction layer"
```

Only create this commit if fixups were needed.

---

## Summary

| Task | Files | Purpose |
|------|-------|---------|
| 1 | `src/shared/provider-types.ts` | Provider interface + shared types |
| 2 | `src/shared/types.ts` | Add `providerType` to StoredSite |
| 3 | `src/main/tunnel-provider-manager.ts` | Registry + per-site dispatch |
| 4 | `src/main/providers/cloudflare-provider.ts` | Adapter wrapping cloudflared/* |
| 5 | `src/main/ipc-handlers.ts` | Route tunnel ops through manager |
| 6 | `src/main/index.ts` | Init manager, delegate restore/shutdown |
| 7 | — | Manual smoke test |

End state: All tunnel operations go through the provider abstraction layer. Existing cloudflared code is untouched. Zero user-facing change. Ready for Phase 2 (FrpProvider + UI).
