# TODO

## 已完成 ✅

- [x] CLI 模式支援 Quick Tunnel — 透過 local HTTP API 委派 Electron 處理（非純 Node.js 獨立實作，CLI 需要 Electron 在背景運行）
- [x] 三個 feature branch 合併到 main — `feat/cli-quick-tunnel`、`feat/menu-bar-integration`、`feat/provider-abstraction`
- [x] Provider 抽象層 Phase 1 — `TunnelProviderManager` 支援多供應商架構
- [x] Menu Bar 系統列圖示 — tray icon + 站點狀態總覽
- [x] macOS packaged app cloudflared 偵測 — 加入 Homebrew well-known paths（`/opt/homebrew/bin`、`/usr/local/bin`）

## CLI Quick Tunnel

- [ ] CLI 獨立模式 — 目前 CLI tunnel 命令必須 Electron 在背景運行，未來可考慮支援 standalone 模式（直接 spawn cloudflared，不需 Electron）
- [ ] CLI bundle 含 Electron 依賴 — `server-manager.ts` → `logger.ts` → `import { app } from 'electron'`，CLI 打包時會拉入 Electron stub。功能不受影響但 bundle 不乾淨，應抽離 logger 的 Electron 依賴

## Menu Bar / Tray

- [ ] Tray 站點狀態即時更新 — `updateTrayMenu` 已實作但需確認 site update 事件有正確觸發 tray 重繪
- [ ] 關閉視窗後 app 在背景運行 — `window-all-closed` 已改為不退出，但需測試使用者體驗（是否需要 dock icon 隱藏等）

## Provider 抽象層

- [ ] Phase 2 — 新增第二個 provider（如 ngrok、localtunnel）以驗證抽象層設計
- [ ] Provider 設定 UI — 讓使用者選擇/切換 tunnel provider

## 區網分享 (branch: `worktree-agent-adeb8149`，未合併)

- [ ] Story 78（多網路介面 UI 提示）— `lan-ip.ts` 已實作多介面偵測和 VPN 過濾，但 UI 尚未在多 IP 時顯示介面名稱供使用者辨識
- [ ] Story 80（區網 Hot Reload）— 分析後確認 WebSocket 已綁 `0.0.0.0` 且客戶端用 `location.hostname` 建立 WS URL，理論上已可用，但未實際跨裝置測試驗證
- [ ] WebSocket server 明確綁定 host — 目前 `new WebSocketServer({ port })` 靠 Node.js 預設綁 `0.0.0.0`，建議改為明確指定 `host: '0.0.0.0'` 以避免未來行為變更
- [ ] macOS 防火牆提示 — 區網存取可能觸發 macOS 「允許傳入連線」彈窗，可考慮在 UI 加說明文字

## Linux 支援 (branch: `worktree-agent-a35a62ea`，未合併)

- [ ] Linux icon 格式確認 — `package.json` 設定 `build/icon.png`，需確認此檔案存在且尺寸符合 electron-builder 要求（至少 256x256）
- [ ] Linux 自動更新 — electron-builder 的 AppImage auto-update 需額外設定，目前未啟用
- [ ] Linux 實機測試 — Story 87/90 為驗證型 Story，需在實際 Ubuntu/Fedora 上手動測試安裝、啟動、Tunnel 全流程
- [ ] Wayland 相容性 — Electron 在 Wayland 下可能有拖放和 tray icon 問題，需測試
- [ ] ARM Linux — 初版僅 x64，未來可新增 arm64 打包目標

## cloudflared

- [ ] 支援手動指定 cloudflared 路徑 — 目前自動偵測（Homebrew paths + 系統 PATH + `~/.config/tunnelbox/bin/`），若使用者安裝在特殊路徑會找不到。應在設定中提供手動輸入路徑的選項，GUI 和 CLI 都需支援

## 打包 / 發布

- [ ] `tunnelbox://` URL scheme 僅 packaged 模式生效 — dev 模式下 Finder 右鍵選單會報 `kLSApplicationNotFoundErr`，屬預期行為但可考慮加 dev 模式 fallback
- [ ] Code signing — 目前未簽署，macOS 會跳「無法確認開發者」警告
- [ ] Auto update — 未設定自動更新機制

## 快捷鍵支援

- [ ] 調查 macOS 常見快捷鍵慣例（Cmd+N、Cmd+W、Cmd+,、Cmd+R 等）並確認適用於 TunnelBox 的對應操作
- [ ] 實作 macOS 快捷鍵綁定（優先）
- [ ] 未來擴充 Windows 快捷鍵支援（Ctrl 對應）

## 跨功能

- [ ] 端到端測試 — 所有功能目前無自動化測試，僅靠 spec 的驗收標準做手動驗證
- [ ] 本地自訂域名、區網分享、Linux 支援三個 branch 尚未合併 — 需逐一 review 後合併，可能有 merge conflict（共用檔案如 `types.ts`、`ipc-handlers.ts` 已有較大變動）
