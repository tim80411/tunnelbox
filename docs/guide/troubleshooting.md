# Troubleshooting

## cloudflared 相關

### 自動安裝失敗

- 檢查網路連線
- 嘗試手動安裝：[cloudflared 下載頁面](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
- 安裝後重啟 TunnelBox

### 「cloudflared 版本過舊」

- 點擊 **更新** 按鈕自動下載新版
- 或手動下載最新版覆蓋安裝

## Tunnel 相關

### Quick Tunnel 啟動失敗

| 錯誤訊息 | 原因 | 解決方式 |
|---------|------|---------|
| 無法連線至 Cloudflare，請檢查網路連線 | 網路中斷 | 檢查網路後重試 |
| Cloudflare 服務暫時不可用 | Cloudflare 端問題 | 稍後重試 |
| cloudflared 尚未安裝 | 未偵測到 cloudflared | 點擊安裝按鈕 |

### Named Tunnel 問題

| 錯誤訊息 | 原因 | 解決方式 |
|---------|------|---------|
| 認證已過期，請重新登入 | OAuth 憑證失效 | 重新登入 Cloudflare |
| 已達 Tunnel 數量上限 | Cloudflare 帳號配額已滿 | 刪除不用的 Tunnel |
| 請先登入 Cloudflare 帳號 | 未登入 | 點擊登入按鈕 |

### Tunnel 斷線

- TunnelBox 會自動嘗試重連（最多 3 次，間隔遞增）
- 若重連失敗，點擊 **重新啟動** 手動重連
- Named Tunnel 重連後 URL 不變；Quick Tunnel 可能改變

## 本地伺服器

### Port 衝突

TunnelBox 自動分配 3000–9000 範圍內的可用 Port。若所有 Port 都被佔用，會顯示錯誤提示。關閉佔用 Port 的程式後重試。

### 靜態網頁 404

- 確認資料夾中包含 `index.html`
- 確認 HTML 中引用的資源路徑正確（相對路徑）
- 若使用 iframe 載入子頁面，TunnelBox 已處理 `.html` 路徑問題

### Hot Reload 不生效

- 確認網頁已在瀏覽器中開啟
- 檢查是否有 JavaScript 錯誤阻擋 WebSocket 連線
- 嘗試手動重新整理頁面
