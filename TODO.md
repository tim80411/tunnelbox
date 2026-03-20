# TODO

- [ ] CLI 模式支援 Quick Tunnel — 目前 `startQuickTunnel` 依賴 Electron 的 ProcessManager，需改為純 Node.js 實作（直接 spawn `cloudflared tunnel --url`）
