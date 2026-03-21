# Managing Sites

## 新增站點

### 方式一：透過介面新增

1. 點擊右上角 **+ Add Site**
2. 選擇服務模式：
   - **Static** — 選擇包含靜態網頁的資料夾，TunnelBox 會啟動內建 HTTP 伺服器
   - **Proxy** — 輸入已運行的開發伺服器 URL（如 `http://localhost:5173`），TunnelBox 會建立反向代理
3. 輸入名稱（或留空，會自動使用資料夾名稱 / 代理目標）
4. 點擊 **Confirm**

TunnelBox 會自動分配一個可用的 Port（範圍 3000–9000）。

### 方式二：拖放資料夾

直接將資料夾從 Finder / 檔案總管拖放到 TunnelBox 視窗，即可快速新增靜態站點。

### 方式三：剪貼簿貼上

複製資料夾路徑後，在 TunnelBox 視窗中按 `⌘V`（macOS）或 `Ctrl+V`（Windows / Linux），即可快速新增站點。也支援從 Finder 複製資料夾後直接貼上。

## 站點清單

每個站點項目顯示：

| 欄位 | 說明 |
|------|------|
| 名稱 | 你設定的站點名稱（可點擊重新命名） |
| 模式 | Static 或 Proxy |
| 路徑 / 目標 | 本地資料夾路徑（Static）或代理目標 URL（Proxy） |
| localhost URL | `http://localhost:PORT`，可點擊複製 |
| LAN URL | 區域網路 URL（如 `http://192.168.1.100:PORT`），運行中時自動顯示，附有「Local」標籤 |
| 狀態 | 運行中 / 已停止 / 錯誤 |

## 操作

- **Open** — 在瀏覽器中開啟（若已停止，會自動啟動後開啟）
- **Start / Stop** — 手動啟動或停止伺服器
- **Remove** — 刪除站點（停止伺服器，但不刪除本地檔案）
- **Copy URL** — 複製 localhost 或公開 URL
- **QR Code** — 點擊 QR 按鈕顯示 QR Code 彈窗，方便手機掃碼連線

## Proxy 模式

Proxy 模式適用於已自行啟動開發伺服器的場景（如 `vite dev`、`next dev`）。TunnelBox 會建立反向代理，將請求轉發到你的目標伺服器，包含 WebSocket 支援（Hot Reload 等即時通訊不受影響）。

- 目標伺服器需在新增站點前自行啟動
- 若目標伺服器未啟動，存取時會顯示 502 Bad Gateway
- 支援 HTTP 和 WebSocket 轉發

## LAN 分享

站點運行中時，TunnelBox 會自動偵測區域網路 IP 並顯示 LAN URL，同一網路中的其他裝置可直接存取。

- LAN URL 旁有 QR Code 按鈕，點擊可顯示 QR Code 彈窗
- 手機掃碼即可在本地區域網路中預覽

## Hot Reload

當你修改資料夾內的檔案時，已在瀏覽器中開啟的頁面會自動重新載入，不需要手動重新整理。（僅 Static 模式；Proxy 模式的 Hot Reload 由你的開發伺服器自行處理）

## 持久化

所有站點設定會自動儲存。關閉 TunnelBox 後重新開啟，之前的站點會自動恢復。若在 [設定](settings.md) 中啟用「Auto-start servers」，重啟後伺服器也會自動啟動。
