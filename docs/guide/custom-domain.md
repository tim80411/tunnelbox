# Custom Domain

將你自己的網域綁定到 Named Tunnel，透過自訂網域存取本地網頁。

## 前置條件

1. 已建立 Named Tunnel
2. 已登入 Cloudflare
3. 你的網域已在 [Cloudflare DNS](https://dash.cloudflare.com/) 託管

## 綁定網域

1. 在有 Named Tunnel 的網頁下方，找到網域綁定區域
2. 輸入子網域，例如 `dev.example.com`
3. 點擊 **綁定**
4. TunnelBox 會自動建立 DNS CNAME 記錄
5. 等待 DNS 傳播（通常幾分鐘內生效）

## 解除綁定

1. 點擊 **解除綁定**
2. 確認後，DNS CNAME 記錄會被刪除
3. Named Tunnel 仍保持運行（透過 Tunnel URL 存取）

## 常見問題

**「此網域不在你的 Cloudflare 帳號中」**

你的網域需要先在 Cloudflare 託管 DNS。前往 [Cloudflare Dashboard](https://dash.cloudflare.com/) 新增網域。

**「此網域已被其他 Tunnel 使用」**

同一個子網域只能綁定一個 Tunnel。請先在原本的 Tunnel 解除綁定，或使用不同的子網域。

**「DNS 傳播中」**

DNS 記錄需要時間在全球生效，通常幾分鐘內完成。在傳播期間，部分地區可能暫時無法透過自訂網域存取。
