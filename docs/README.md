# TunnelBox

TunnelBox 是一款跨平台桌面應用程式，讓你輕鬆管理本地網頁服務，並透過 Cloudflare Tunnel 一鍵分享給任何人。

## Features

- **本地靜態伺服器** — 選擇資料夾，自動啟動 HTTP 伺服器，支援 Hot Reload
- **反向代理模式** — 將已運行的開發伺服器（如 Vite、Next.js）透過 Tunnel 對外分享
- **Quick Tunnel** — 一鍵產生臨時公開連結，無需帳號即可分享
- **Named Tunnel** — 登入 Cloudflare，建立不會因重啟而改變的持久連結
- **Custom Domain** — 將自訂網域綁定到 Named Tunnel
- **LAN 分享** — 自動偵測區域網路 IP，支援 QR Code 快速掃碼連線
- **系統匣 (System Tray)** — 最小化到系統匣，快速查看站點狀態
- **設定面板** — 自動啟動伺服器、預設服務模式等偏好設定
- **自動更新** — 檢查新版本並自動下載安裝
- **鍵盤快捷鍵** — 完整快捷鍵支援，提升操作效率
- **拖放 & 剪貼簿** — 拖曳資料夾或貼上路徑即可快速新增站點
- **CLI** — 命令列介面，支援站點、伺服器、Tunnel 管理

## Platforms

| Platform | Format |
|----------|--------|
| macOS (Intel + Apple Silicon) | `.dmg` |
| Windows (x64) | `.exe` |
| Linux (x64) | `.deb` / `.rpm` / `.AppImage` |

## Quick Start

1. [下載安裝](guide/getting-started.md)
2. 選擇本地資料夾或輸入代理目標，建立你的第一個站點
3. 點擊「公開分享」，取得公開 URL
