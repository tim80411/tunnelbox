# Cloudflare Tunnel Integration Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Cloudflare Tunnel (Quick + Named + Custom Domain) into the Site Holder Electron app so users can expose local sites to the public internet.

**Architecture:** New `src/main/cloudflared/` module handles all cloudflared binary management, subprocess lifecycle, and tunnel operations. IPC handlers in `ipc-handlers.ts` bridge to renderer. Frontend adds tunnel controls to existing site cards and new auth panel. Shared types in `src/shared/types.ts` define the contract (already updated).

**Tech Stack:** Electron 33, React 19, TypeScript 5.7, cloudflared CLI (subprocess), electron-store for persistence

---

## File Structure

### New Backend Files (Main Process)

| File | Responsibility |
|------|---------------|
| `src/main/cloudflared/detector.ts` | Detect cloudflared installation, check version, find binary path |
| `src/main/cloudflared/installer.ts` | Download & install cloudflared for current platform |
| `src/main/cloudflared/process-manager.ts` | Spawn/monitor/cleanup cloudflared child processes |
| `src/main/cloudflared/quick-tunnel.ts` | Start/stop Quick Tunnel, parse URL from stdout |
| `src/main/cloudflared/auth-manager.ts` | OAuth login/logout via `cloudflared tunnel login` |
| `src/main/cloudflared/named-tunnel.ts` | Create/start/stop/delete Named Tunnels |
| `src/main/cloudflared/dns-manager.ts` | Create/delete DNS CNAME records for custom domains |
| `src/main/cloudflared/index.ts` | Barrel export + CloudflaredService facade |

### Modified Backend Files

| File | Changes |
|------|---------|
| `src/shared/types.ts` | New types: TunnelInfo, CloudflaredEnv, CloudflareAuth, DomainBinding, etc. (DONE) |
| `src/main/ipc-handlers.ts` | Add tunnel/auth/domain IPC handlers |
| `src/main/store.ts` | Add tunnel/auth persistence (StoredTunnel, StoredAuth) |
| `src/main/index.ts` | Cleanup tunnel processes on quit, restore named tunnels on boot |
| `src/preload/index.ts` | Expose new APIs to renderer |

### New Frontend Files (Renderer)

| File | Responsibility |
|------|---------------|
| `src/renderer/src/components/TunnelControls.tsx` | Per-site tunnel action buttons (share/stop/named tunnel controls) |
| `src/renderer/src/components/AuthPanel.tsx` | Cloudflare login/logout + status display |
| `src/renderer/src/components/DomainBinding.tsx` | Custom domain bind/unbind UI |

### Modified Frontend Files

| File | Changes |
|------|---------|
| `src/renderer/src/App.tsx` | Integrate TunnelControls, AuthPanel, DomainBinding; new state for cloudflared/auth |
| `src/renderer/src/styles/global.css` | Styles for tunnel status, auth panel, domain binding |

---

## Task Breakdown

### Backend Tasks (Staff Backend)

#### BT1: cloudflared Detection & Installation [Story 19]
- `src/main/cloudflared/detector.ts`: Run `cloudflared --version`, parse output, compare minimum version
- `src/main/cloudflared/installer.ts`: Download platform-specific binary from GitHub releases
- IPC: `get-cloudflared-status`, `install-cloudflared`
- Broadcast: `cloudflared-status-changed`
- Commit per file

#### BT2: Subprocess Lifecycle Management [Story 20]
- `src/main/cloudflared/process-manager.ts`: `spawn()` → track PID, monitor stdout/stderr, handle exit
- Track all processes in a Map, `killAll()` for app quit
- Wire into `src/main/index.ts` before-quit cleanup
- Commit

#### BT3: Quick Tunnel Start/Stop [Story 21, 22]
- `src/main/cloudflared/quick-tunnel.ts`:
  - `startQuickTunnel(port)`: spawn `cloudflared tunnel --url http://localhost:{port}`, parse URL from stderr (regex: `https://.*trycloudflare.com`)
  - `stopQuickTunnel(siteId)`: kill process, update state
- Auto-stop tunnel when server stops (hook into serverManager.stopServer)
- IPC: `start-quick-tunnel`, `stop-tunnel`
- Broadcast: `tunnel-status-changed`
- Update `toSiteInfo()` to include tunnel data
- Commit per feature

#### BT4: Quick Tunnel Error Handling & Reconnect [Story 23, 24]
- Detect network errors from cloudflared stderr
- Reconnect logic: on process exit with non-zero, retry up to 3 times with backoff
- Map cloudflared error messages to user-friendly Chinese messages
- Commit

#### BT5: Cloudflare OAuth Auth [Story 25, 26]
- `src/main/cloudflared/auth-manager.ts`:
  - `login()`: spawn `cloudflared tunnel login`, monitor for cert file creation
  - `logout()`: delete cert file, clear stored auth
  - `getStatus()`: check if cert exists and is valid
- Persist auth in store (certPath, accountEmail)
- IPC: `login-cloudflare`, `logout-cloudflare`, `get-auth-status`
- Broadcast: `auth-status-changed`
- Commit

#### BT6: Named Tunnel CRUD [Story 27, 28, 29]
- `src/main/cloudflared/named-tunnel.ts`:
  - `create(name)`: `cloudflared tunnel create {name}`, parse tunnel ID
  - `start(tunnelId, port)`: `cloudflared tunnel run --url http://localhost:{port} {tunnelId}`
  - `stop(tunnelId)`: kill process
  - `delete(tunnelId)`: `cloudflared tunnel delete {tunnelId}`
- Persist named tunnels in store (tunnelId, name, siteId)
- Auto-restore on app boot
- IPC handlers
- Commit per operation

#### BT7: Named Tunnel Error Handling [Story 30]
- Auth expiry detection during tunnel operations
- Tunnel quota detection from cloudflared errors
- Reconnect logic for named tunnels (same as quick but preserve URL)
- Commit

#### BT8: Custom Domain DNS [Story 31, 32, 33]
- `src/main/cloudflared/dns-manager.ts`:
  - `bindDomain(tunnelId, domain)`: `cloudflared tunnel route dns {tunnelId} {domain}`
  - `unbindDomain(domain)`: Delete CNAME via cloudflared or Cloudflare API
- Error handling: domain not in account, already bound, DNS propagation
- IPC: `bind-domain`, `unbind-domain`
- Commit

### Frontend Tasks (Staff Frontend)

#### FT1: cloudflared Status UI [Story 19]
- Show cloudflared availability status in header/footer area
- "Install" button when not_installed, progress during install
- Update `src/renderer/src/App.tsx` with cloudflared state + event listener
- Commit

#### FT2: Quick Tunnel UI [Story 21, 22]
- `src/renderer/src/components/TunnelControls.tsx`:
  - "Share" button (starts quick tunnel) for running sites
  - "Stop Sharing" button for sites with active tunnel
  - Public URL display with copy button
  - Tunnel status badge (starting/running/reconnecting/error)
- Integrate into site-item in App.tsx
- Styles in global.css
- Commit per feature

#### FT3: Quick Tunnel Error & Reconnect UI [Story 23, 24]
- Error toast/message for tunnel failures
- "Reconnecting..." status indicator
- "Tunnel disconnected, restart manually" message after max retries
- Commit

#### FT4: Auth UI [Story 25, 26]
- `src/renderer/src/components/AuthPanel.tsx`:
  - "Login to Cloudflare" button (logged_out state)
  - Account info + "Logout" button (logged_in state)
  - "Logging in..." spinner (logging_in state)
  - "Session expired, re-login" prompt (expired state)
  - Logout confirmation when Named Tunnels are running
- Place in app header area
- Commit

#### FT5: Named Tunnel UI [Story 27, 28, 29]
- Extend TunnelControls:
  - "Create Persistent Tunnel" option (requires auth)
  - "Start/Stop Tunnel" toggle for named tunnels
  - "Delete Tunnel" with confirmation dialog
  - Persistent URL display distinct from quick tunnel URL
  - Auth-required gate (prompt login if not authenticated)
- Commit per feature

#### FT6: Named Tunnel Error UI [Story 30]
- Auth expiry prompt in tunnel context
- Quota exceeded message
- Reconnect status for named tunnels
- Commit

#### FT7: Custom Domain UI [Story 31, 32, 33]
- `src/renderer/src/components/DomainBinding.tsx`:
  - Domain input form for named tunnels
  - "Bind" / "Unbind" buttons
  - Status: pending (DNS propagating), active, error
  - Error messages: domain not in account, already used
- Integrate into site-item when named tunnel exists
- Commit

---

## Preload Bridge Updates

The preload script (`src/preload/index.ts`) needs these new methods added to match the updated `ElectronAPI` interface in `src/shared/types.ts`. Both agents should coordinate: Backend adds IPC handlers, then updates preload.

## Dependency Graph

```
BT1 (detect/install) → BT2 (process mgr) → BT3 (quick tunnel) → BT4 (error/reconnect)
                                          ↘ BT5 (auth) → BT6 (named tunnel) → BT7 (error)
                                                                              → BT8 (domain)

FT1 (cloudflared UI) → FT2 (tunnel UI) → FT3 (error UI)
                                        → FT4 (auth UI) → FT5 (named UI) → FT6 (error UI)
                                                                          → FT7 (domain UI)
```

Backend and Frontend tracks run in parallel. Frontend can implement against types before backend IPC is ready.

## Commit Convention

Follow existing pattern: `[Story N] 描述` for each story completion. Group related work into logical commits. Each story should have at least one commit.
