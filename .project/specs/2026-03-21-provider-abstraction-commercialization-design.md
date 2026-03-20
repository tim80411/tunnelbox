# TunnelBox Provider Abstraction Layer & Commercialization Design

Date: 2026-03-21

## Background

TunnelBox is an Electron desktop app for managing local static websites and exposing them via Cloudflare Tunnel. The developer wants to commercialize the product. However, Cloudflare's Zero Trust ToS contains an explicit anti-resale clause, and relying on a single provider creates business risk.

This design introduces a provider-agnostic tunnel architecture that:
1. Reduces legal risk by positioning TunnelBox as a "management tool" rather than a tunnel reseller
2. Eliminates single-vendor dependency
3. Enables a commercial model where users pay for the tool, not the tunnel service

## Research Summary

### Legal Analysis

| Area | Risk | Key Finding |
|------|------|-------------|
| Cloudflare Zero Trust ToS anti-resale | **High** | "You shall not resell Cloudflare Zero Trust to any third parties" — but "bring your own account" model is lower risk |
| Cloudflare Self-Serve Agreement | **Medium** | "you will not sell access to the Cloud Services to any third party" — grey area for GUI wrappers |
| Quick Tunnel production use | **High** | Official docs: "intended for testing and development only" |
| cloudflared license (Apache 2.0) | **Low** | Commercial use explicitly permitted; runtime download avoids redistribution obligations |
| Trademark | **Low** | "TunnelBox" is safe; referential use of "Cloudflare" is permitted with attribution |
| Section 2.8 content restriction | **Low** | Removed from ToS; new CDN-specific terms don't affect static site serving |

### Precedent

LocalCan (paid macOS app) commercially uses Cloudflare Quick Tunnel without apparent enforcement. No product has been found that explicitly resells Named Tunnel access as primary value.

### Alternative Services

- **frp** (Apache 2.0): Most feature-rich self-hosted option, 80k+ GitHub stars
- **rathole** (Apache 2.0): Higher performance, lighter than frp
- **bore** (MIT): Minimal ~400 lines
- **ngrok**: Explicitly prohibits commercial wrappers in ToS — avoid

## Architecture

### Current

```
ipc-handlers.ts ── direct imports ──> cloudflared/*
```

### New

```
ipc-handlers.ts ──> TunnelProviderManager ──> TunnelProvider (interface)
                                                  ├── CloudflareProvider
                                                  │     └── cloudflared/* (existing code, untouched)
                                                  └── FrpProvider
                                                        └── frp/* (new)
```

## Shared Types

Provider-agnostic types that replace or generalize existing Cloudflare-specific types:

```typescript
/** Provider environment status (generalizes CloudflaredEnv) */
interface ProviderEnv {
  status: 'checking' | 'available' | 'not_installed' | 'outdated' | 'installing' | 'install_failed' | 'error'
  version?: string
  errorMessage?: string
}

/** Provider auth info (generalizes CloudflareAuth) */
interface ProviderAuthInfo {
  status: 'logged_out' | 'logging_in' | 'logged_in' | 'expired' | 'not_required'
  accountEmail?: string
  accountId?: string
}

/** Provider-agnostic tunnel info (generalizes TunnelInfo) */
interface ProviderTunnelInfo {
  providerType: string        // 'cloudflare' | 'frp' | ...
  status: TunnelStatus        // reuse existing: 'starting' | 'running' | 'reconnecting' | 'stopped' | 'error'
  publicUrl?: string
  tunnelId?: string           // provider-specific identifier
  errorMessage?: string
}
```

Note: The existing `TunnelInfo`, `CloudflareAuth`, `CloudflaredEnv` types in `src/shared/types.ts` remain untouched. `CloudflareProvider` maps between the existing types and the new provider-agnostic types internally. This avoids breaking existing renderer code in Phase 1.

## Provider Interface

```typescript
interface TunnelProvider {
  readonly type: string  // 'cloudflare' | 'frp' | ...

  // Environment
  detect(): Promise<ProviderEnv>
  install(): Promise<void>

  // Auth (some providers don't need OAuth — return { status: 'not_required' })
  login(): Promise<ProviderAuthInfo>
  logout(): Promise<void>
  getAuthStatus(): ProviderAuthInfo

  // Tunnel lifecycle
  startTunnel(siteId: string, port: number, opts?: Record<string, unknown>): Promise<string>  // returns publicUrl
  stopTunnel(siteId: string): Promise<void>
  getTunnelInfo(siteId: string): ProviderTunnelInfo | undefined

  // Restore tunnels on app boot
  restoreAll(getSitePort: (siteId: string) => number | null): Promise<void>

  // Fixed domain (optional — not all providers support one-click binding)
  bindDomain?(siteId: string, port: number, domain: string): Promise<string>
  unbindDomain?(siteId: string): Promise<void>

  // Cleanup
  stopAll(): Promise<void>
}
```

### Provider-Specific Options

Each provider defines and validates its own options type. The interface accepts `Record<string, unknown>` — providers cast to their own type internally:

```typescript
// Cloudflare-specific
interface CloudflareTunnelOptions {
  mode: 'quick' | 'named'
}

// frp-specific
interface FrpTunnelOptions {
  serverAddr: string
  serverPort?: number
  authToken?: string
}
```

### Design Decisions

1. **`bindDomain` is optional**: frp custom domains require manual DNS A record setup on user's VPS, not suitable for one-click UX. UI shows/hides the "bind domain" button based on whether the provider implements this method.

2. **Event notification**: Each provider uses the existing `broadcastTunnelStatus` IPC mechanism internally. The interface does not prescribe event handling — providers manage their own IPC events. In Phase 1, existing IPC events (`tunnel-status-changed`, `auth-status-changed`, `cloudflared-status-changed`) remain unchanged. In Phase 2, a generic `provider-status-changed` event will be added for new providers, while existing events continue to work for Cloudflare.

3. **Per-site provider setting**: Different sites can use different providers. Stored in site config as `providerType: 'cloudflare' | 'frp'`.

4. **Async lifecycle methods**: `stopTunnel()`, `stopAll()`, and `logout()` are all `Promise<void>` because underlying operations may involve process cleanup, API calls, or file I/O. This ensures the app shutdown sequence can properly `await` cleanup.

5. **ProcessManager injection**: Each provider receives a shared `ProcessManager` instance via constructor. This matches the existing architecture where a single `ProcessManager` manages all child processes.

## Provider Implementations

### CloudflareProvider

Pure wrapper around existing `cloudflared/*` modules — zero behavioral change:

- constructor receives shared `ProcessManager`, calls `initQuickTunnel(pm)` and `initNamedTunnel(pm)`
- `startTunnel()` casts opts to `CloudflareTunnelOptions`, delegates to `startQuickTunnel()` or `startNamedTunnel()` based on `opts.mode`
- `bindDomain()` delegates to `bindFixedDomain()`
- `restoreAll()` delegates to `restoreNamedTunnels()`
- Maps existing `CloudflareAuth` → `ProviderAuthInfo` and `TunnelInfo` → `ProviderTunnelInfo` internally
- All existing reconnect, error parsing, broadcastTunnelStatus logic untouched

### FrpProvider

frp requires a relay server (user-provided VPS running frps):

```
User machine (frpc) ──> relay VPS (frps) ──> public access
```

| Method | Behavior |
|--------|----------|
| `detect()` | Check if frpc binary exists |
| `install()` | Download frpc from GitHub releases (same pattern as cloudflared) |
| `login()` | No OAuth; configure server address + token instead |
| `startTunnel()` | Generate temp frpc.toml config, spawn `frpc` process |
| `stopTunnel()` | Kill frpc process |
| `bindDomain` | **Not implemented** — requires manual DNS setup |

frp "auth" is server connection config:

```typescript
interface FrpServerConfig {
  serverAddr: string   // e.g., "my-vps.example.com"
  serverPort: number   // default 7000
  authToken?: string   // frps auth token (stored encrypted via Electron safeStorage)
}
```

**frp public URL discovery**: frpc logs the assigned remote port on connection. FrpProvider parses frpc stdout/stderr for the line `start proxy success` and constructs the URL as `http://{serverAddr}:{remotePort}`. Users configure `remotePort` in `FrpTunnelOptions` (explicit port) or leave it blank for frps to auto-assign. If auto-assigned, the URL is discovered from frpc's output. If discovery fails within 15 seconds, the tunnel reports an error with the message "unable to determine public URL".

**Auth token security**: `FrpServerConfig.authToken` is encrypted at rest using `safeStorage.encryptString()` before persisting to electron-store, and decrypted with `safeStorage.decryptString()` when read.

### TunnelProviderManager

```typescript
class TunnelProviderManager {
  private providers: Map<string, TunnelProvider>

  register(provider: TunnelProvider): void
  get(type: string): TunnelProvider
  getForSite(siteId: string): TunnelProvider  // reads site's providerType from store, defaults to 'cloudflare'

  /** Restore all tunnels on app boot — delegates to each provider's restoreAll() */
  restoreAll(getSitePort: (siteId: string) => number | null): Promise<void>

  /** Stop all tunnels across all providers (app shutdown) */
  stopAll(): Promise<void>
}
```

- All providers registered at app startup, each receiving the shared `ProcessManager`
- `ipc-handlers.ts` accesses providers through manager, no longer imports cloudflared modules directly
- `remove-site` and `stop-server` handlers must call `manager.getForSite(siteId).stopTunnel(siteId)` — this also fixes an existing gap where named tunnels were not stopped on site removal

## File Structure

```
src/main/
  tunnel-provider.ts          # interface + TunnelProviderManager
  providers/
    cloudflare-provider.ts    # wraps existing cloudflared/*
    frp/
      detector.ts             # frpc binary detection
      installer.ts            # frpc download/install
      frp-provider.ts         # FrpProvider implementation

src/main/cloudflared/         # UNTOUCHED — existing code stays as-is
```

## UI Changes

### Site card provider badge

Small badge on site cards indicating active provider: `[CF]` or `[frp]`.

### First tunnel launch — provider selection

When launching a tunnel for the first time on a site:

```
Select Tunnel Service
  ○ Cloudflare Tunnel (recommended, free, zero setup)
  ○ frp (self-hosted, requires VPS)
```

Selection is remembered per-site. Changeable in site settings.

### frp setup flow

1. frpc not installed → show install button
2. Server not configured → show "Configure frp Server" form (addr, port, token)
3. Configuration complete → start tunnel

### Cloudflare flow unchanged

Identical to current UX.

### Site settings panel (new)

New section in site options:

```
Tunnel Settings
  Provider: [Cloudflare ▾]   ← dropdown
  (change takes effect on next tunnel start)
```

**Provider switching behavior**: The provider dropdown is disabled while a tunnel is active for that site. If the site has a Cloudflare Named Tunnel binding, user must unbind first before switching providers. A tooltip explains: "Stop the tunnel to change provider."

### CLI changes (Phase 3 — out of scope for this spec)

CLI `--provider` flag is deferred to a future phase. The existing CLI continues to work with Cloudflare only. CLI multi-provider support will be designed separately after Phase 2 UI is validated.

### Out of scope

- No full UI redesign
- No automatic provider fallback (user makes explicit choice)
- No one-click frp server deployment (user provides their own VPS)

## Legal Compliance Measures

### Required

1. **Cloudflare ToS consent step**: When user first selects Cloudflare provider, show: "Using this feature requires your own Cloudflare account and agreement to their Terms of Service." Link to Cloudflare ToS, user confirms with checkbox.

2. **In-app disclaimer**: About page includes "TunnelBox is not affiliated with, endorsed by, or sponsored by Cloudflare, Inc." and cloudflared Apache 2.0 attribution.

3. **Marketing language**: Use "Compatible with Cloudflare Tunnel", never imply official partnership.

4. **TunnelBox ToS**: Service availability depends on third-party providers; TunnelBox does not guarantee Cloudflare service continuity. Users must comply with their chosen provider's ToS.

### Medium-term

- Apply to Cloudflare Technology Partner Program once product has traction
- Obtain written permission to eliminate legal grey area

## Commercial Model

Revenue tied to **tool value**, not tunnel service:

| Feature | Free | Pro |
|---------|------|-----|
| Managed sites | 3 | Unlimited |
| Cloudflare Quick Tunnel | Yes | Yes |
| Cloudflare Named Tunnel | Yes | Yes |
| frp self-hosted support | — | Yes |
| CLI tool | — | Yes |
| Multi-provider switching | — | Yes |

License/gating mechanism: TBD — out of scope for this spec. Will be designed separately when approaching launch.

## Migration Strategy

### Phase 1 — Abstraction Layer + CloudflareProvider (invisible to users)

1. Add shared types (`ProviderEnv`, `ProviderAuthInfo`, `ProviderTunnelInfo`) to `src/shared/types.ts`
2. Add `tunnel-provider.ts` with `TunnelProvider` interface and `TunnelProviderManager`
3. Add `providers/cloudflare-provider.ts` wrapping existing cloudflared modules, receiving `ProcessManager` via constructor
4. Modify `ipc-handlers.ts` to use manager — all tunnel operations go through `manager.getForSite(siteId)`:
   - Fix existing gap: `remove-site` handler now stops any active tunnel (not just quick tunnels)
   - App boot restore logic delegates to `manager.restoreAll()`
   - App shutdown delegates to `manager.stopAll()`
5. Add `providerType` field to `StoredSite` — **no destructive migration**: missing field defaults to `'cloudflare'` at read time
6. Existing `ElectronAPI`, preload, and renderer code remain unchanged in this phase
7. **End state: zero user-facing change, all tests pass**

### Phase 2 — FrpProvider + UI Changes

1. Add `providers/frp/` directory and implementation
2. UI: provider selection, frp config form, provider badge
3. Add `provider-status-changed` IPC event for new providers (existing Cloudflare events continue to work)
4. Update `ElectronAPI` with generic tunnel methods (while keeping Cloudflare-specific ones for backwards compatibility)
5. Legal: ToS consent step, disclaimers, attribution

### Phase 3 — CLI Multi-Provider (future, out of scope)

1. CLI `--provider` flag
2. frp server config via CLI flags

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| Cloudflare ToS anti-resale | High | BYOA model + provider abstraction + seek partnership |
| Cloudflare discontinues free tunnel | Medium | frp fallback via provider abstraction |
| Cloudflare API breaking changes | Medium | Pin cloudflared versions; abstraction layer isolates impact |
| Trademark infringement | Low | No "Cloudflare" in product name; referential use with attribution |
| Apache 2.0 non-compliance | Low | Runtime download; attribution in About screen |
