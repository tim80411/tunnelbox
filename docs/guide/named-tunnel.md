# Named Tunnel

Named Tunnel 提供不會因應用程式重啟而改變的持久公開 URL。需要 Cloudflare 帳號。

## 前置條件

1. 擁有 [Cloudflare](https://dash.cloudflare.com/sign-up) 帳號
2. 點擊 TunnelBox 右上角的 **登入 Cloudflare**
3. 瀏覽器會自動開啟 Cloudflare 授權頁面，完成授權

## 建立 Named Tunnel

1. 確保已登入且網頁狀態為「運行中」
2. 點擊 **建立持久 Tunnel**
3. 等待建立完成，取得持久 URL
4. 此 URL 在重啟 TunnelBox 後不會改變

## 管理

- **停止 Tunnel** — 暫停公開存取，保留設定，日後可重新啟動
- **啟動 Tunnel** — 重新啟動已停止的 Named Tunnel，使用相同 URL
- **刪除 Tunnel** — 從 Cloudflare 帳號中永久刪除，URL 失效

## 與 Quick Tunnel 的差異

| | Quick Tunnel | Named Tunnel |
|---|---|---|
| 需要帳號 | 否 | 是 |
| URL 持久性 | 每次不同 | 固定不變 |
| 重啟後 | 需重新建立 | 自動恢復 |
| 自訂網域 | 不支援 | 支援 |

## 登出

- 登出會停止所有 Named Tunnel（不會刪除）
- 重新登入後可手動重新啟動
- Quick Tunnel 不受登出影響
