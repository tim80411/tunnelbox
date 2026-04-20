<p align="center">
  <img src="brand/wordmark.svg" alt="TunnelBox" height="64">
</p>

[![Build & Release](https://github.com/tim80411/tunnelbox/actions/workflows/release.yml/badge.svg)](https://github.com/tim80411/tunnelbox/actions/workflows/release.yml)

A desktop app for managing local static websites and sharing them via Cloudflare Tunnel.

> **User Guide** — For installation, usage instructions, and troubleshooting, see the [Documentation](https://timothyown.gitbook.io/tunnel-box).

## Install (macOS)

Via Homebrew tap:

```bash
brew tap tim80411/tap
brew install --cask tunnelbox
```

Because the release is not notarized by Apple, macOS Gatekeeper will block the app on first launch with "Apple could not verify TunnelBox is free of malware". Remove the quarantine attribute once after install:

```bash
sudo xattr -dr com.apple.quarantine /Applications/TunnelBox.app
```

Then launch normally via `open /Applications/TunnelBox.app` or from Launchpad.

> This step is a one-off per install. `brew upgrade --cask tunnelbox` will re-apply the quarantine flag on the new version, so run the `xattr` command again after each upgrade.

## Features

- Local static server with auto port allocation and hot reload
- Quick Tunnel — one-click public URL, no account required
- Named Tunnel — persistent URL that survives restarts
- Custom Domain — bind your own domain to a Named Tunnel
- Auto cloudflared management — detection, download, installation

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Electron 33 |
| Frontend | React 19, TypeScript 5.7 |
| Build | electron-vite, Vite 6 |
| Static Server | serve-handler |
| File Watcher | chokidar |
| Hot Reload | WebSocket (ws) |
| Persistence | electron-store |
| Tunnel | cloudflared (subprocess) |
| Packaging | electron-builder |

## Architecture

```
src/
├── main/                     # Electron main process
│   ├── index.ts              # App lifecycle, window creation
│   ├── ipc-handlers.ts       # IPC bridge (main ↔ renderer)
│   ├── server-manager.ts     # HTTP server, file watcher, hot reload
│   ├── store.ts              # Persistent storage (electron-store)
│   └── cloudflared/          # Cloudflare Tunnel integration
│       ├── detector.ts       # Detect/version-check cloudflared
│       ├── installer.ts      # Download & install cloudflared
│       ├── process-manager.ts # Child process lifecycle
│       ├── quick-tunnel.ts   # Quick Tunnel operations
│       ├── named-tunnel.ts   # Named Tunnel CRUD
│       ├── auth-manager.ts   # OAuth login/logout
│       ├── dns-manager.ts    # Custom domain DNS CNAME
│       └── index.ts          # Barrel export
├── preload/
│   └── index.ts              # Context bridge (exposes ElectronAPI)
├── renderer/
│   └── src/
│       ├── App.tsx           # Main UI component
│       ├── main.tsx          # React entry + ErrorBoundary
│       ├── components/
│       │   ├── TunnelControls.tsx  # Per-site tunnel actions
│       │   ├── AuthPanel.tsx       # Cloudflare login/logout
│       │   └── DomainBinding.tsx   # Custom domain UI
│       └── styles/
│           └── global.css
└── shared/
    └── types.ts              # Shared TypeScript types & ElectronAPI interface
```

## Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Typecheck
pnpm typecheck

# Build (compile only)
pnpm build

# Package for current platform
pnpm dist
```

## Release

Releases are built automatically by GitHub Actions when a version tag is pushed.

```bash
# Bump version, commit, tag, and push (triggers CI build)
./scripts/bump-version.sh patch   # 1.0.0 → 1.0.1
./scripts/bump-version.sh minor   # 1.0.1 → 1.1.0
./scripts/bump-version.sh major   # 1.1.0 → 2.0.0
```

Build artifacts:
- `TunnelBox-{version}-mac-universal.dmg` (Intel + Apple Silicon)
- `TunnelBox-{version}-win-x64.exe` (NSIS installer)

Releases are created as **draft** — review and publish manually on GitHub.

## License

MIT
