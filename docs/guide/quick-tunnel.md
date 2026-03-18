# Quick Tunnel

Quick Tunnel 讓你無需 Cloudflare 帳號，一鍵將本地網頁暴露到公網。

## 使用方式

1. 確保網頁狀態為「運行中」
2. 點擊 **公開分享**
3. 等待幾秒，取得 `https://xxxx.trycloudflare.com` 格式的公開 URL
4. 點擊 URL 旁的 📋 按鈕複製，分享給他人

## 停止分享

- 點擊 **停止公開** 手動關閉 Tunnel
- 停止本地伺服器時，Tunnel 會自動關閉
- 關閉 TunnelBox 時，所有 Tunnel 會自動清理

## 注意事項

- Quick Tunnel 的 URL 是**臨時的**，每次啟動會產生不同的 URL
- 若需要固定 URL，請使用 [Named Tunnel](named-tunnel.md)
- Quick Tunnel 不需要 Cloudflare 帳號

## 斷線重連

- 網路暫時中斷時，TunnelBox 會自動嘗試重新連線（最多 3 次）
- 重連成功後，URL 可能會改變
- 若重連失敗，會顯示提示，可手動重新啟動
