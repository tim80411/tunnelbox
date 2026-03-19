# Site Holder CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CLI support to Site Holder enabling all site management, server control, and tunnel operations via command line for AI Agent automation.

**Architecture:** Independent CLI (Spike-3 Option C) that directly imports existing core modules. Store layer abstracted to work both in Electron (electron-store) and standalone (JSON file). commander.js for CLI framework, tsup for build.

**Tech Stack:** TypeScript, commander.js, tsup, vitest

---

## Spike-3 Decision: Architecture C (Independent CLI)

**Rationale:**
- All core modules (ServerManager, ProcessManager, cloudflared/*) use pure Node.js APIs — no Electron dependency
- Only `src/main/store.ts` depends on `electron-store` → abstract with IStore interface
- CLI runs independently without Electron app running
- State sync: both Electron and CLI use same store file path (`tunnelbox-data.json`); Electron can watch for changes
- Store file location: `~/Library/Application Support/tunnelbox/tunnelbox-data.json` (macOS)

## File Structure

### New Files
```
src/cli/
├── index.ts                    # CLI entry point, commander setup
├── commands/
│   ├── site.ts                 # site add/list/remove handlers
│   ├── server.ts               # server start/stop handlers
│   ├── tunnel.ts               # tunnel quick/stop handlers
│   └── env.ts                  # env check handler
├── output.ts                   # JSON/human-readable output formatting
└── errors.ts                   # CLIError class, exit codes, global handler

src/core/
├── store-interface.ts          # IStore interface
└── store-file.ts               # JSON file-based store (for CLI)

tests/
├── core/
│   └── store-file.test.ts
└── cli/
    ├── output.test.ts
    ├── errors.test.ts
    └── commands/
        ├── site.test.ts
        ├── server.test.ts
        ├── tunnel.test.ts
        └── env.test.ts

tsup.config.ts                  # CLI build config
vitest.config.ts                # Test config
```

### Modified Files
```
package.json                    # Add deps (commander, tsup, vitest), bin entry, scripts
src/cli/index.ts                # Register all command groups
```

## Shared Interfaces

### IStore Interface
```typescript
// src/core/store-interface.ts
import type { StoredSite, StoredAuth, StoredTunnel } from '../shared/types'

export interface StoredDomainBinding {
  siteId: string
  domain: string
}

export interface IStore {
  getSites(): StoredSite[]
  saveSites(sites: StoredSite[]): void
  addSite(site: StoredSite): void
  removeSite(id: string): void
  getAuth(): StoredAuth | null
  saveAuth(auth: StoredAuth): void
  clearAuth(): void
  getTunnels(): StoredTunnel[]
  saveTunnel(tunnel: StoredTunnel): void
  removeTunnel(siteId: string): void
  getDomainBinding(siteId: string): StoredDomainBinding | null
  saveDomainBinding(siteId: string, domain: string): void
  removeDomainBinding(siteId: string): void
}
```

### Exit Codes
```
0 = Success
1 = User input error (bad args, site not found, name duplicate)
2 = System/runtime error (connection failed, cloudflared not installed)
```

### Command Handler Pattern
Each command file exports:
1. Pure handler functions (testable without commander): `siteAdd(store, name, folder)`
2. A `registerXxxCommands(program, store, ...)` function that wires handlers to commander

---

## Team Assignment

| Agent | Role | Tasks |
|-------|------|-------|
| **cli-architect** | Foundation + Site commands | Tasks 1-4 |
| **cli-developer** | Server + Tunnel + Env commands | Tasks 5-8 (starts after Task 3) |

---

## Tasks

### Task 1: Project Setup (cli-architect)

**Files:**
- Modify: `package.json`
- Create: `tsup.config.ts`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install dependencies**

```bash
pnpm add commander
pnpm add -D tsup vitest
```

- [ ] **Step 2: Create tsup.config.ts**

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/cli/index.ts'],
  format: ['cjs'],
  target: 'node18',
  outDir: 'out/cli',
  clean: true,
  sourcemap: true,
  shims: true,
})
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    root: '.',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
```

- [ ] **Step 4: Add scripts and bin to package.json**

Add to scripts:
```json
"cli:build": "tsup",
"cli:dev": "tsup --watch",
"test": "vitest run",
"test:watch": "vitest"
```

Add bin:
```json
"bin": { "tunnelbox": "./out/cli/index.js" }
```

- [ ] **Step 5: Create minimal CLI entry point stub**

```typescript
// src/cli/index.ts
#!/usr/bin/env node
console.log('tunnelbox CLI')
```

- [ ] **Step 6: Verify build works**

```bash
pnpm cli:build && node out/cli/index.js
```

- [ ] **Step 7: Commit**

---

### Task 2: Store Abstraction — Spike-3 (cli-architect)

**Files:**
- Create: `src/core/store-interface.ts`
- Create: `src/core/store-file.ts`
- Create: `tests/core/store-file.test.ts`

- [ ] **Step 1: Write IStore interface** (see Shared Interfaces section above)

- [ ] **Step 2: Write failing tests for FileStore**

Tests should cover: empty store defaults, add/get/remove sites, save/get/clear auth, tunnel CRUD, domain binding CRUD.

- [ ] **Step 3: Run tests to verify they fail**

- [ ] **Step 4: Implement FileStore**

Key design:
- Constructor takes optional `filePath` parameter (defaults to platform-specific path)
- `read()`: reads JSON file, returns defaults if file missing/corrupt
- `write(data)`: creates parent dir if needed, writes JSON
- All IStore methods delegate to read/write
- Store file location matches electron-store: `tunnelbox-data.json` in app data dir

```typescript
export function getDefaultStorePath(): string {
  const platform = process.platform
  if (platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'tunnelbox', 'tunnelbox-data.json')
  } else if (platform === 'win32') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'tunnelbox', 'tunnelbox-data.json')
  }
  return join(homedir(), '.config', 'tunnelbox', 'tunnelbox-data.json')
}
```

- [ ] **Step 5: Run tests to verify they pass**

- [ ] **Step 6: Commit**

---

### Task 3: CLI Framework + Output + Errors (cli-architect) [Story 34, 35, 36]

**Files:**
- Modify: `src/cli/index.ts`
- Create: `src/cli/output.ts`
- Create: `src/cli/errors.ts`
- Create: `tests/cli/output.test.ts`
- Create: `tests/cli/errors.test.ts`

- [ ] **Step 1: Implement CLIError class**

```typescript
// src/cli/errors.ts
export class CLIError extends Error {
  constructor(message: string, public exitCode: number = 1) {
    super(message)
    this.name = 'CLIError'
  }
  static input(message: string): CLIError { return new CLIError(message, 1) }
  static system(message: string): CLIError { return new CLIError(message, 2) }
}

export function handleError(err: unknown, json: boolean): never {
  if (err instanceof CLIError) {
    if (json) console.log(JSON.stringify({ success: false, error: err.message }))
    else console.error(`Error: ${err.message}`)
    process.exit(err.exitCode)
  }
  const message = err instanceof Error ? err.message : String(err)
  if (json) console.log(JSON.stringify({ success: false, error: `Unexpected error: ${message}` }))
  else console.error(`Unexpected error: ${message}`)
  process.exit(2)
}
```

- [ ] **Step 2: Implement output formatter**

```typescript
// src/cli/output.ts
export function output(data: unknown, json: boolean): void {
  if (json) {
    console.log(JSON.stringify({ success: true, data }))
  } else if (typeof data === 'string') {
    console.log(data)
  } else if (Array.isArray(data)) {
    data.length === 0 ? console.log('No items found.') : console.table(data)
  } else {
    console.log(data)
  }
}
```

- [ ] **Step 3: Write tests for CLIError and output**

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Implement full CLI entry point with commander**

```typescript
// src/cli/index.ts
#!/usr/bin/env node
import { Command } from 'commander'
import { handleError } from './errors'
import { FileStore } from '../core/store-file'

const program = new Command()
program
  .name('tunnelbox')
  .description('Site Holder CLI — manage local static sites with Cloudflare tunnels')
  .version(require('../../package.json').version)
  .option('--json', 'Output in JSON format', false)

const store = new FileStore()

// Command groups registered here (by each command module)
// registerSiteCommands(program, store)
// registerServerCommands(program, store, serverManager)
// registerTunnelCommands(program, store, serverManager)
// registerEnvCommands(program)

process.on('uncaughtException', (err) => handleError(err, program.opts().json))

program.parse()
```

- [ ] **Step 6: Verify `--help`, `--version`, unknown command behavior**

- [ ] **Step 7: Commit**

---

### Task 4: site add/list/remove commands (cli-architect) [Story 39, 40, 41]

**Files:**
- Create: `src/cli/commands/site.ts`
- Create: `tests/cli/commands/site.test.ts`
- Modify: `src/cli/index.ts`

- [ ] **Step 1: Write tests for siteAdd, siteList, siteRemove**

Test cases:
- `siteAdd`: success, folder not found (CLIError exit 1), name duplicate (CLIError exit 1)
- `siteList`: multiple sites, empty list, --json output
- `siteRemove`: success, site not found (CLIError exit 1)

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement handler functions**

```typescript
export function siteAdd(store: IStore, name: string, folder: string): StoredSite {
  const folderPath = resolve(folder)
  if (!existsSync(folderPath)) throw CLIError.input(`Folder not found: ${folderPath}`)
  if (store.getSites().some(s => s.name === name)) throw CLIError.input(`Site name already exists: ${name}`)
  const site: StoredSite = { id: randomUUID(), name, folderPath }
  store.addSite(site)
  return site
}
```

- [ ] **Step 4: Implement registerSiteCommands and wire to CLI**

- [ ] **Step 5: Run tests to verify they pass**

- [ ] **Step 6: Build and manual test**

```bash
pnpm cli:build
node out/cli/index.js site add test-site ./dist
node out/cli/index.js site list --json
node out/cli/index.js site remove test-site
```

- [ ] **Step 7: Commit**

---

### Task 5: server start/stop commands (cli-developer) [Story 42, 43]

**Blocked by:** Task 3 (CLI framework must exist)

**Files:**
- Create: `src/cli/commands/server.ts`
- Create: `tests/cli/commands/server.test.ts`
- Modify: `src/cli/index.ts`

- [ ] **Step 1: Study ServerManager API**

Read `src/main/server-manager.ts` — understand `startServer(id, name, folderPath)` and `stopServer(id)` signatures, return types, and error conditions.

- [ ] **Step 2: Write tests for server start/stop**

Test cases:
- `serverStart`: success (returns port/url), site not found, already running
- `serverStop`: success, not running, site not found

- [ ] **Step 3: Run tests to verify they fail**

- [ ] **Step 4: Implement handler functions**

Key: instantiate ServerManager for CLI context (without WebSocket hot reload if not needed), call startServer/stopServer.

Helper: `findSite(store, nameOrId)` — shared lookup that throws CLIError.input if not found.

- [ ] **Step 5: Implement registerServerCommands and wire to CLI**

- [ ] **Step 6: Run tests to verify they pass**

- [ ] **Step 7: Build and manual test**

- [ ] **Step 8: Commit**

---

### Task 6: tunnel quick/stop commands (cli-developer) [Story 44, 45]

**Blocked by:** Task 3 (CLI framework), Task 5 (server commands for auto-start)

**Files:**
- Create: `src/cli/commands/tunnel.ts`
- Create: `tests/cli/commands/tunnel.test.ts`
- Modify: `src/cli/index.ts`

- [ ] **Step 1: Study cloudflared quick-tunnel and detector APIs**

Read `src/main/cloudflared/quick-tunnel.ts`, `src/main/cloudflared/detector.ts`.

- [ ] **Step 2: Write tests for tunnel quick/stop**

Test cases:
- `tunnelQuick`: success (returns public URL), auto-start server, cloudflared not installed (exit 2), already has tunnel
- `tunnelStop`: success, no tunnel running, site not found

- [ ] **Step 3: Run tests to verify they fail**

- [ ] **Step 4: Implement handler functions**

Key flow for `tunnel quick`:
1. Check cloudflared installed → CLIError.system if not
2. Find site → CLIError.input if not found
3. Check if tunnel already running → return existing URL
4. Start server if not running (auto-start)
5. Start quick tunnel, wait for URL
6. Output URL

- [ ] **Step 5: Wire to CLI and run tests**

- [ ] **Step 6: Build and manual test**

- [ ] **Step 7: Commit**

---

### Task 7: env check command (cli-developer) [Story 51]

**Blocked by:** Task 3 (CLI framework)

**Files:**
- Create: `src/cli/commands/env.ts`
- Create: `tests/cli/commands/env.test.ts`
- Modify: `src/cli/index.ts`

- [ ] **Step 1: Study cloudflared detector API**

- [ ] **Step 2: Write tests**

Test cases:
- Installed: output version + path
- Not installed: output hint to use `tunnelbox env install`
- --json mode: `{ installed, version, path }`

- [ ] **Step 3: Implement and wire up**

- [ ] **Step 4: Run tests, build, commit**

---

### Task 8: Integration Verification (both agents)

- [ ] **Step 1: Run all tests**

```bash
pnpm test
```

- [ ] **Step 2: Build complete CLI**

```bash
pnpm cli:build
```

- [ ] **Step 3: Manual end-to-end test**

```bash
node out/cli/index.js env check
node out/cli/index.js site add test-site ./some-folder
node out/cli/index.js site list --json
node out/cli/index.js server start test-site
node out/cli/index.js tunnel quick test-site
# Verify public URL works
node out/cli/index.js tunnel stop test-site
node out/cli/index.js server stop test-site
node out/cli/index.js site remove test-site
```

- [ ] **Step 4: Verify exit codes**

```bash
node out/cli/index.js site add bad-site /nonexistent; echo $?  # should be 1
node out/cli/index.js server start ghost; echo $?              # should be 1
```

- [ ] **Step 5: Final commit**

---

## Key Reference Files

| File | Purpose |
|------|---------|
| `src/main/store.ts` | Current store implementation (electron-store) — reference for IStore methods |
| `src/main/server-manager.ts` | Server lifecycle — import directly for CLI |
| `src/main/cloudflared/detector.ts` | Check cloudflared installation |
| `src/main/cloudflared/quick-tunnel.ts` | Quick tunnel management |
| `src/main/cloudflared/process-manager.ts` | Child process lifecycle |
| `src/shared/types.ts` | All TypeScript interfaces |
| `src/main/ipc-handlers.ts` | Reference for business logic flow |
