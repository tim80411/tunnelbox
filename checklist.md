# 本地靜態網頁管理工具 — 完成清單

## Release 1 (MVP) — 核心建站與 Hot Reload

### P0 — 基礎架構

- [x] **[Spike] 桌面應用框架選型評估**
  - [x] 各框架功能比較表（打包體積、啟動速度、原生 API 支援、社群生態、學習曲線）
  - [x] 本地靜態伺服器整合 PoC
  - [x] 檔案監控 API 整合可行性驗證
  - [x] 最終框架選型建議與理由

> 選型結果：Electron + electron-vite + React + TypeScript
> 依賴：chokidar（檔案監控）、serve-handler（靜態伺服器）、ws（WebSocket hot reload）、get-port（Port 分配）、electron-store（持久化）

- [x] **[Story 1] 應用程式框架與生命週期管理** (Enabler)
  - [x] 情境 1: 應用程式在 3 秒內顯示主畫面（含網頁清單區域與操作區域）
  - [x] 情境 2: 視窗大小調整時畫面自適應
  - [x] 情境 3: 關閉時停止所有伺服器並釋放 Port
  - [x] 情境 4: 強制終止時不殘留孤兒進程
  - [x] 情境 5: 啟動失敗時顯示錯誤訊息

> 實作：BrowserWindow（900x670, min 600x400）、before-quit cleanup、SIGTERM/SIGINT/exit handlers、startup error window

- [x] **[Story 5] 啟動本地靜態伺服器（含自動 Port 分配）** (Enabler)
  - [x] 情境 1: 伺服器在自動分配的 Port（3000–9000）上提供靜態檔案
  - [x] 情境 2: 多個伺服器同時運行，Port 不衝突
  - [x] 情境 3: 無 index.html 時顯示檔案目錄列表
  - [x] 情境 4: 資料夾權限不足時顯示錯誤，不影響其他伺服器
  - [x] 情境 5: 無可用 Port 時顯示錯誤訊息

> 實作：get-port + serve-handler、directoryListing: true、per-site error isolation

- [x] **[Story 7] 監聽檔案變更（含防抖動機制）** (Enabler)
  - [x] 情境 1: 1 秒內偵測檔案修改（HTML/CSS/JS/圖片等）
  - [x] 情境 2: 偵測新增與刪除檔案
  - [x] 情境 3: 偵測子資料夾中的檔案變更
  - [x] 情境 4: 批次變更合併為一次通知（最後一次變更後 500ms 內）
  - [x] 情境 5: 監控資料夾被刪除時停止監聽，不崩潰

> 實作：chokidar watcher（change/add/unlink/addDir/unlinkDir）、500ms debounce、error handler graceful close

### P1 — 核心功能

- [x] **[Story 2] 在主畫面顯示已建立的本地網頁清單**
  - [x] 情境 1: 清單顯示所有網頁（名稱 + 資料夾路徑）
  - [x] 情境 2: 超過 20 個網頁時可捲動瀏覽

> 實作：site-list with overflow-y: auto

- [x] **[Story 3] 透過主畫面觸發新增網頁流程**
  - [x] 情境 1: 點擊新增入口後進入設定流程

> 實作：header 中 "+ Add Site" 按鈕，開啟 modal 對話框

- [x] **[Story 4] 輸入網頁名稱並指定本地資料夾路徑**
  - [x] 情境 1: 輸入名稱 + 選擇路徑 → 建立記錄、出現在清單、伺服器自動啟動
  - [x] 情境 2: 未填寫必要欄位時提示錯誤
  - [x] 情境 3: 名稱重複時提示已被使用

> 實作：modal 含 name input + folder picker、前後端雙重驗證（empty fields + duplicate name）

- [x] **[Story 6] 點擊清單項目在瀏覽器中開啟本地網頁**
  - [x] 情境 1: 以預設瀏覽器開啟 localhost:{port}
  - [x] 情境 2: 伺服器未啟動時自動啟動後開啟，並提供手動啟動選項

> 實作：shell.openExternal、stopped 時 Open 按鈕自動 start → open

- [x] **[Story 8] 檔案變更時自動重新載入瀏覽器頁面**
  - [x] 情境 1: 修改檔案後 2 秒內瀏覽器自動重新載入
  - [x] 情境 2: 多個分頁同時開啟時全部自動重新載入

> 實作：Global WebSocket server、HTML response injection、per-site client tracking

- [x] **[Story 9] 從清單中移除網頁並停止對應伺服器**
  - [x] 情境 1: 移除後從清單消失、伺服器停止、本地檔案不刪除
  - [x] 情境 2: 移除已停止伺服器的網頁不產生錯誤

> 實作：removeServer stops + deletes entry、removeSite from store

---

## Release 2 — 穩健管理與錯誤處理

### P2 — 防禦性設計與狀態管理

- [x] **[Story 11] 驗證路徑有效性並提示錯誤**
  - [x] 情境 1: 路徑不存在時提示錯誤
  - [x] 情境 2: 路徑為檔案而非資料夾時提示錯誤
  - [x] 情境 3: 路徑已被其他網頁使用時提示

> 實作：server-manager 中文錯誤訊息（路徑不存在、非資料夾）、ipc-handlers 新增重複路徑驗證

- [x] **[Story 12] 處理 Port 衝突情境**
  - [x] 情境 1: Port 被佔用時自動嘗試下一個
  - [x] 情境 2: 大量 Port 被佔用時持續尋找或顯示錯誤

> 實作：get-port 自動重試、中文錯誤訊息「無可用的 Port（範圍 3000-9000 皆被佔用）」

- [x] **[Story 13] 顯示每個網頁的運行狀態**
  - [x] 情境 1: 運行中顯示「運行中」
  - [x] 情境 2: 已停止顯示「已停止」
  - [x] 情境 3: 狀態即時更新

> 實作：broadcastSiteUpdate + onSiteUpdated 即時推送、Running/Stopped status badge

- [x] **[Story 14] 顯示網頁的本地存取網址與 Port**
  - [x] 情境 1: 顯示完整 localhost 網址
  - [x] 情境 2: 可複製網址到剪貼簿
  - [x] 情境 3: 伺服器停止時網址標記為不可用

> 實作：URL 旁 📋 Copy 按鈕（navigator.clipboard）、stopped 時顯示「網址不可用」

- [x] **[Story 18] 下次啟動時恢復上次的網頁清單設定** (Enabler)
  - [x] 情境 1: 重新開啟後恢復清單並自動重啟伺服器
  - [x] 情境 2: 持久化資料損壞時正常啟動顯示空清單

> 實作：electron-store 持久化、啟動時逐站恢復（失敗則 registerStopped）、corruption 重置為空陣列

### P3 — 體驗優化

- [x] **[Story 10] 清單為空時顯示引導提示**
  - [x] 情境 1: 顯示引導提示並提供新增入口

> 實作：中文引導文字「尚未建立任何網頁」+ 內嵌「新增網頁」按鈕

- [x] **[Story 15] 手動停止單一網頁的本地伺服器**
  - [x] 情境 1: 停止伺服器、釋放 Port、網頁保留在清單
  - [x] 情境 2: 對已停止的伺服器執行停止不產生錯誤

> 實作：stopServer 關閉 HTTP/watcher/WS、已停止時安全跳過（null guard）

- [x] **[Story 16] 手動重啟單一網頁的本地伺服器**
  - [x] 情境 1: 重啟伺服器並分配可用 Port

> 實作：start-server handler 呼叫 startServer 重新分配 port 與 watcher

- [x] **[Story 17] 刪除前顯示確認對話框**
  - [x] 情境 1: 確認刪除 → 移除並停止伺服器
  - [x] 情境 2: 取消 → 保留網頁，伺服器繼續運行

> 實作：confirmRemove state + modal 確認對話框（確認刪除/取消）

---

## 進度摘要

| Release | 優先序 | 總項目 | 已完成 | 進度 |
|---------|--------|--------|--------|------|
| R1 MVP  | P0     | 4      | 4      | 100% |
| R1 MVP  | P1     | 6      | 6      | 100% |
| R2      | P2     | 5      | 5      | 100% |
| R2      | P3     | 4      | 4      | 100% |
| **合計** |        | **19** | **19** | **100%** |
