# Getting Started

## 安裝

### macOS

1. 從 [GitHub Releases](https://github.com/tim80411/tunnelbox/releases) 下載 `TunnelBox-x.x.x-mac-universal.dmg`
2. 開啟 `.dmg`，將 TunnelBox 拖入 Applications 資料夾
3. 首次開啟時，macOS 會提示「來自未識別的開發者」：
   - 前往 **System Settings → Privacy & Security**
   - 點擊 **Open Anyway**

### Windows

1. 從 [GitHub Releases](https://github.com/tim80411/tunnelbox/releases) 下載 `TunnelBox-x.x.x-win-x64.exe`
2. 執行安裝程式，依照指引完成安裝
3. 首次開啟時，Windows SmartScreen 可能會提示警告：
   - 點擊 **More info** → **Run anyway**

### Linux

1. 從 [GitHub Releases](https://github.com/tim80411/tunnelbox/releases) 下載對應格式：
   - Ubuntu / Debian：`tunnelbox_x.x.x_amd64.deb`
   - Fedora / RHEL：`tunnelbox-x.x.x.x86_64.rpm`
   - 其他發行版：`TunnelBox-x.x.x.AppImage`
2. 安裝方式：
   - `.deb`：`sudo dpkg -i tunnelbox_x.x.x_amd64.deb`
   - `.rpm`：`sudo rpm -i tunnelbox-x.x.x.x86_64.rpm`
   - `.AppImage`：賦予執行權限後直接執行 `chmod +x TunnelBox-x.x.x.AppImage && ./TunnelBox-x.x.x.AppImage`

## 首次啟動

啟動 TunnelBox 後，你會看到空白的主畫面。點擊右上角的 **+ Add Site** 開始新增你的第一個站點。

TunnelBox 啟動後會常駐於系統匣（macOS 選單列 / Windows 工作列 / Linux 通知區域），關閉視窗不會結束程式。詳見 [系統匣](system-tray.md)。

## cloudflared 環境

TunnelBox 使用 [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) 來建立 Tunnel 連線。

- 啟動時會自動偵測系統是否已安裝 cloudflared
- 若未安裝，畫面上方會出現提示，點擊 **安裝** 即可自動下載安裝
- 安裝位置為 app 內部目錄，不需要 sudo 權限
- Quick Tunnel 不需要 Cloudflare 帳號；Named Tunnel 和 Custom Domain 需要登入

## 自動更新

TunnelBox 支援自動更新。當有新版本可用時，會在 [設定面板](settings.md) 中顯示通知，你可以一鍵下載並安裝更新。也可以隨時在設定面板中手動檢查更新。
