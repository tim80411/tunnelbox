# 本地靜態網頁管理工具 — Cloudflare 串接 Spec

## 專案概覽

- **專案名稱**：本地靜態網頁管理桌面應用程式 — Cloudflare 串接
- **階段**：Release 3
- **撰寫日期**：2026-03-18
- **修訂版本**：v2（品質審查後修正）

### 受益者

| 角色 | 描述 |
|------|------|
| **開發者** | 需要將開發中的本地網頁快速暴露到公網，讓外部人員預覽 |
| **測試環境管理者** | 需要產生公開連結，提供給 QA 或其他人員進行遠端測試 |

### 期望成果

開發者能一鍵將本地網頁暴露到公網，透過 Cloudflare Tunnel 產生公開連結分享給他人，並可進階綁定自訂網域。

### No-gos

- 不做 Cloudflare API Token 認證（只支援 OAuth 認證流程）
- 不做 Cloudflare Workers / Pages 部署
- 不做 SSL/TLS 證書管理（Cloudflare 自動處理）
- 不做多人協作 / 團隊帳號管理
- 不做 Tunnel 流量監控或分析

---

## Story Map

| Activity | Task | Stories |
|----------|------|---------|
| **A1: 準備 Tunnel 環境** | T1.1 確認並安裝 cloudflared | Story 19 |
| | T1.2 管理 cloudflared 子程序 | Story 20 |
| **A2: Quick Tunnel（臨時公開）** | T2.1 啟動並查看 Tunnel | Story 21 |
| | T2.2 停止 Tunnel | Story 22 |
| | T2.3 異常處理 | Story 23, Story 24 |
| **A3: 帳號認證** | T3.1 認證與狀態管理 | Story 25 |
| | T3.2 登出 | Story 26 |
| **A4: Named Tunnel（持久）** | T4.1 建立並查看 | Story 27 |
| | T4.2 管理生命週期 | Story 28, Story 29 |
| | T4.3 異常處理 | Story 30 |
| **A5: 自訂網域** | T5.1 綁定網域 | Story 31 |
| | T5.2 解除綁定 | Story 32 |
| | T5.3 異常處理 | Story 33 |

---

## Release 規劃

### Release 3a — Quick Tunnel（臨時公開連結）

**Outcome**: 開發者能一鍵將本地網頁暴露到公網，產生臨時連結分享給他人預覽

Stories: [Spike-2], Story 19–24

### Release 3b — Named Tunnel（持久連結）

**Outcome**: 開發者可登入 Cloudflare 帳號，建立持久的 Named Tunnel，URL 不因應用程式重啟而改變

Stories: Story 25–30

### Release 3c — 自訂網域

**Outcome**: 開發者可將自訂網域綁定到 Named Tunnel，透過自己的網域名稱存取本地網頁

Stories: Story 31–33

---

## 優先序總覽

| 優先序 | Stories | 數量 |
|--------|---------|------|
| **P0** | [Spike-2], Story 19, 20 | 3 (19%) |
| **P1** | Story 21, 22, 25, 27 | 4 (25%) |
| **P2** | Story 23, 24, 26, 28, 31 | 5 (31%) |
| **P3** | Story 29, 30, 32, 33 | 4 (25%) |

---

## 修訂紀錄

### v1 → v2 變更摘要

- **移除實作細節**：Story 20、22、27、28 的 AC 中移除 cloudflared 子程序等實作層描述，改為 Outcome-Focused
- **拆分情境**：Story 23 情境 2 拆分為安裝成功/失敗兩個情境；Story 30 情境 3 拆分為重連成功/失敗兩個情境
- **補充情境**：Story 27 新增 Edge Case（已有 Quick Tunnel 時建立 Named Tunnel）；Story 29 新增 Edge Case（有網域綁定時刪除）和 Error Path（刪除失敗）
- **修正 GWT 格式**：Story 33 情境 1、3 的 Given/When 結構調整
- **補充交叉引用**：Story 31 範圍段落註明錯誤情境由 Story 33 覆蓋
- **移除實作術語**：Story 25 情境 1 移除「cloudflared 的 OAuth」；Story 31 範圍移除「Cloudflare API」

---

## Stories

---

### [Spike-2] cloudflared 整合方式評估

**h2. 目的**

評估 cloudflared 在 Electron 桌面應用中的整合方式，以判斷最適合本專案的安裝策略（嵌入 binary vs. 動態下載 vs. 引導使用者安裝）與跨平台支援方案。

**h2. Time Box**

2 人日

**h2. 產出**

- cloudflared 分發策略比較表（嵌入 binary、動態下載、使用者自行安裝的優缺點）
- 跨平台安裝方案驗證（macOS、Windows、Linux）
- cloudflared 子程序管理概念驗證（PoC）：啟動、監控 stdout 解析 URL、graceful shutdown
- Quick Tunnel 的 stdout 輸出格式分析與 URL 解析方式驗證
- 最終整合方案建議與理由

**h2. 前置條件**

- 無

**h2. 優先序**

P0 — 所有後續 Story 的技術實作皆依賴 cloudflared 整合方式的決策

**Labels**: `P0`, `spike`

---

### [Story 19] cloudflared 環境準備（偵測、自動安裝、UI 狀態）(Enabler)

**h2. 描述**

作為開發團隊，我們需要實作 cloudflared 的環境偵測與自動安裝機制，並在 UI 顯示環境狀態，使使用者無需手動處理 cloudflared 的安裝與設定即可使用 Tunnel 功能。

**h2. 價值陳述**

此項變更賦能了所有 Tunnel 相關的 User Story（Story 21–24, 27–29），確保 cloudflared 在使用者機器上可用，是所有公網暴露功能的前提條件。

**h2. 驗收標準**

情境 1: 偵測已安裝的 cloudflared（Happy Path）
GIVEN 使用者的系統已安裝 cloudflared
WHEN 使用者開啟應用程式
THEN 應用程式在 5 秒內偵測到 cloudflared
  AND UI 顯示「Tunnel 功能可用」的狀態指示

情境 2: 自動安裝 cloudflared（Happy Path）
GIVEN 使用者的系統尚未安裝 cloudflared
WHEN 使用者首次嘗試使用 Tunnel 功能
THEN 應用程式自動下載並安裝對應平台的 cloudflared
  AND 安裝過程中顯示進度提示
  AND 安裝完成後 UI 更新為「Tunnel 功能可用」

情境 3: 自動安裝失敗（Error Path）
GIVEN 使用者的系統尚未安裝 cloudflared
  AND 網路連線不穩或下載來源不可用
WHEN 應用程式嘗試自動安裝 cloudflared
THEN 應用程式顯示安裝失敗的錯誤訊息
  AND 提供手動安裝的說明連結作為備選方案

情境 4: cloudflared 版本過舊（Edge Case）
GIVEN 使用者已安裝 cloudflared 但版本低於最低相容版本
WHEN 應用程式偵測到 cloudflared
THEN 應用程式提示版本過舊並提供自動更新選項

**h2. 不含（Out of Scope）**

- 不含 cloudflared 的後台常駐服務安裝
- 不含 cloudflared 自動更新排程

**h2. 依賴**

- [Spike-2] cloudflared 整合方式評估 — 需先確定安裝策略

**h2. 優先序**

P0 — 被所有 Tunnel 功能依賴，是 Cloudflare 串接的基礎設施

**Labels**: `P0`, `enabler`

---

### [Story 20] cloudflared 子程序生命週期管理 (Enabler)

**h2. 描述**

作為開發團隊，我們需要實作 cloudflared 子程序的啟動、監控與清理機制，使每個 Tunnel 的 cloudflared 進程能被穩定管理，且應用程式關閉時不殘留孤兒進程。

**h2. 價值陳述**

此項變更賦能了 Story 21（啟動 Quick Tunnel）、Story 22（停止 Tunnel）、Story 24（斷線重連）和 Story 27–29（Named Tunnel 管理），提供 cloudflared 進程的統一管理層。

**h2. 驗收標準**

情境 1: 啟動 cloudflared 子程序（Happy Path）
GIVEN cloudflared 已安裝可用
WHEN 系統為某個網頁啟動 Tunnel
THEN 系統以子程序方式啟動 cloudflared
  AND 持續監控子程序的運行狀態
  AND 取得 Tunnel 資訊（如公開 URL）

情境 2: 應用程式關閉時清理所有子程序（Happy Path）
GIVEN 有 3 個 Tunnel 的 cloudflared 子程序正在運行
WHEN 使用者關閉應用程式
THEN 所有 cloudflared 子程序被 graceful shutdown
  AND 不殘留孤兒進程

情境 3: 子程序意外退出（Error Path）
GIVEN 有一個 cloudflared 子程序正在運行
WHEN 該子程序因非預期原因退出
THEN 系統偵測到退出事件
  AND 更新對應 Tunnel 的狀態為「已斷線」
  AND 通知 UI 層更新顯示

情境 4: 多個 Tunnel 同時運行（Edge Case）
GIVEN 已有 5 個網頁各自開啟 Tunnel
WHEN 使用者啟動第 6 個網頁的 Tunnel
THEN 第 6 個 cloudflared 子程序正常啟動
  AND 不影響其他已運行的 Tunnel

**h2. 不含（Out of Scope）**

- 不含 cloudflared 子程序的 CPU/記憶體用量監控
- 不含子程序數量上限管理

**h2. 依賴**

- Story 19（cloudflared 環境準備）— 需要 cloudflared 已安裝可用

**h2. 優先序**

P0 — 被 Story 21、22、24、27–29 依賴，是所有 Tunnel 操作的基礎

**Labels**: `P0`, `enabler`

---

### [Story 21] 為網頁啟動 Quick Tunnel 並顯示/複製公開 URL

**h2. 描述**

身為開發者，我需要對執行中的網頁一鍵啟動 Quick Tunnel，並看到產生的公開 URL 且能快速複製，以便將連結分享給他人預覽我的本地網頁。

**h2. 範圍**

清單中每個運行中的網頁提供「公開分享」操作，點擊後啟動 Quick Tunnel，取得臨時公開 URL 並顯示在 UI 上，支援一鍵複製。

**h2. 驗收標準**

情境 1: 啟動 Quick Tunnel 並取得公開 URL（Happy Path）
GIVEN 清單中有一個本地伺服器正在運行的網頁
WHEN 使用者對該網頁執行「公開分享」操作
THEN 系統啟動 Quick Tunnel 連接到該網頁的本地 Port
  AND 在 15 秒內顯示 Cloudflare 產生的公開 URL
  AND 該網頁的狀態更新為「已公開」

情境 2: 複製公開 URL 到剪貼簿（Happy Path）
GIVEN 某個網頁已啟動 Quick Tunnel 並顯示公開 URL
WHEN 使用者點擊 URL 旁的複製操作
THEN 完整的公開 URL 被複製到系統剪貼簿
  AND UI 顯示「已複製」的回饋提示

情境 3: 外部人員透過公開 URL 存取（Happy Path）
GIVEN 某個網頁的 Quick Tunnel 已啟動
WHEN 外部人員在瀏覽器中開啟該公開 URL
THEN 外部人員看到與本地 localhost 相同的網頁內容

情境 4: 對已有 Tunnel 的網頁再次執行公開（Edge Case）
GIVEN 某個網頁已啟動 Quick Tunnel
WHEN 使用者對同一網頁再次執行「公開分享」操作
THEN 應用程式提示該網頁已有進行中的 Tunnel
  AND 顯示現有的公開 URL

**h2. 依賴**

- Story 2（顯示網頁清單）— 需要清單介面
- Story 5（啟動本地靜態伺服器）— 需要運行中的本地伺服器
- Story 19（cloudflared 環境準備）— 需要 cloudflared 可用
- Story 20（子程序生命週期管理）— 需要子程序管理機制

**h2. 優先序**

P1 — Release 3a 的核心交付，「一鍵公開分享」是本 Release 的核心價值

**Labels**: `P1`, `user-story`

---

### [Story 22] 停止 Quick Tunnel（含伺服器停止時自動關閉）

**h2. 描述**

身為開發者，我需要能手動停止網頁的 Quick Tunnel，且當本地伺服器停止時 Tunnel 也自動關閉，以便在不需要對外時及時回收資源並停止公開存取。

**h2. 範圍**

提供手動停止 Tunnel 的操作，以及伺服器停止時自動連帶關閉 Tunnel 的機制。

**h2. 驗收標準**

情境 1: 手動停止 Quick Tunnel（Happy Path）
GIVEN 某個網頁的 Quick Tunnel 正在運行
WHEN 使用者對該網頁執行「停止公開」操作
THEN Quick Tunnel 停止
  AND 該網頁的狀態更新為「僅限本地」
  AND 公開 URL 不再可存取

情境 2: 本地伺服器停止時自動關閉 Tunnel（Happy Path）
GIVEN 某個網頁的 Quick Tunnel 正在運行
WHEN 該網頁的本地伺服器被停止（手動或應用程式關閉）
THEN 對應的 Quick Tunnel 自動關閉
  AND 系統不殘留該 Tunnel 相關的背景程序

情境 3: 對已停止的 Tunnel 執行停止操作（Edge Case）
GIVEN 某個網頁的 Tunnel 已停止
WHEN 使用者對該網頁執行「停止公開」操作
THEN 應用程式不產生錯誤
  AND 狀態維持「僅限本地」

**h2. 依賴**

- Story 21（啟動 Quick Tunnel）— 需要有運行中的 Tunnel 才有停止場景
- Story 20（子程序生命週期管理）— 需要子程序管理機制

**h2. 優先序**

P1 — 公開分享的配對操作，確保使用者能控制公開存取的開關

**Labels**: `P1`, `user-story`

---

### [Story 23] 處理 Quick Tunnel 啟動失敗

**h2. 描述**

身為開發者，我需要在 Quick Tunnel 啟動失敗時看到明確的錯誤原因與建議，以便快速排除問題並重試。

**h2. 範圍**

Quick Tunnel 啟動過程中的錯誤偵測與使用者友善的錯誤提示。

**h2. 驗收標準**

情境 1: 網路不通時啟動 Tunnel（Error Path）
GIVEN 使用者的網路連線已中斷
WHEN 使用者嘗試啟動 Quick Tunnel
THEN 應用程式顯示「無法連線至 Cloudflare，請檢查網路連線」的錯誤訊息
  AND 該網頁的本地伺服器不受影響

情境 2: cloudflared 未安裝且自動安裝成功（Error Path）
GIVEN cloudflared 尚未安裝
WHEN 使用者嘗試啟動 Quick Tunnel
THEN 應用程式觸發自動安裝流程（Story 19）
  AND 安裝成功後自動重試啟動 Tunnel

情境 3: cloudflared 未安裝且自動安裝失敗（Error Path）
GIVEN cloudflared 尚未安裝
  AND 自動安裝因網路或權限問題失敗
WHEN 使用者嘗試啟動 Quick Tunnel
THEN 應用程式顯示安裝失敗的錯誤訊息
  AND 提供手動安裝的說明連結

情境 4: Cloudflare 服務暫時不可用（Error Path）
GIVEN 使用者的網路連線正常
  AND Cloudflare 服務端暫時不可用
WHEN 使用者嘗試啟動 Quick Tunnel
THEN 應用程式顯示「Cloudflare 服務暫時不可用，請稍後重試」的錯誤訊息
  AND 不影響其他已運行的 Tunnel

**h2. 依賴**

- Story 21（啟動 Quick Tunnel）— 是啟動流程的錯誤處理分支

**h2. 優先序**

P2 — 穩健性功能，提升使用者遇到問題時的體驗

**Labels**: `P2`, `user-story`

---

### [Story 24] Quick Tunnel 斷線自動重連

**h2. 描述**

身為開發者，我需要 Tunnel 在斷線後自動重連，以便不需要持續監控 Tunnel 狀態，專注在開發工作上。

**h2. 範圍**

偵測 Tunnel 斷線並自動重新建立連線的機制。

**h2. 驗收標準**

情境 1: 暫時性網路中斷後自動重連（Happy Path）
GIVEN 某個網頁的 Quick Tunnel 正在運行
  AND 使用者的網路暫時中斷後恢復
WHEN 系統偵測到 Tunnel 連線中斷
THEN UI 顯示「Tunnel 重連中」的狀態
  AND 系統在 30 秒內自動重新建立 Tunnel 連線
  AND 重連成功後 UI 狀態恢復為「已公開」

情境 2: 重連後公開 URL 改變（Edge Case）
GIVEN 某個網頁的 Quick Tunnel 在斷線後重連成功
WHEN 重連後 Cloudflare 分配了新的公開 URL
THEN UI 更新顯示新的公開 URL
  AND 舊的公開 URL 不再可用

情境 3: 多次重連失敗（Error Path）
GIVEN 某個網頁的 Quick Tunnel 連線中斷
WHEN 系統連續 3 次重連嘗試皆失敗
THEN UI 顯示「Tunnel 已斷線，請手動重新啟動」的提示
  AND 停止自動重連嘗試

**h2. 依賴**

- Story 21（啟動 Quick Tunnel）— 需要有運行中的 Tunnel
- Story 20（子程序生命週期管理）— 需要子程序監控機制

**h2. 優先序**

P2 — 穩健性功能，減少使用者手動介入的需求

**Labels**: `P2`, `user-story`

---

### [Story 25] Cloudflare 帳號認證（OAuth + 持久化 + UI 狀態）(Enabler)

**h2. 描述**

作為開發團隊，我們需要實作 Cloudflare OAuth 認證流程，包含認證憑證的持久化儲存與 UI 認證狀態顯示，使使用者能在應用程式內完成 Cloudflare 帳號登入，且重啟應用後不需重新認證。

**h2. 價值陳述**

此項變更賦能了 Story 27（建立 Named Tunnel）、Story 28–29（Named Tunnel 管理）和 Story 31（綁定自訂網域），是所有需要 Cloudflare 帳號權限操作的前提條件。

**h2. 驗收標準**

情境 1: 首次登入 Cloudflare（Happy Path）
GIVEN 使用者尚未登入 Cloudflare 帳號
WHEN 使用者在應用程式內觸發登入操作
THEN 系統啟動認證流程
  AND 自動開啟瀏覽器導向 Cloudflare 的授權頁面
  AND 使用者在瀏覽器完成授權後，應用程式自動接收認證結果
  AND UI 更新顯示「已登入」狀態與帳號資訊

情境 2: 重啟應用後保持登入狀態（Happy Path）
GIVEN 使用者已登入 Cloudflare 帳號
  AND 使用者關閉並重新開啟應用程式
WHEN 應用程式啟動
THEN 應用程式自動載入已儲存的認證憑證
  AND UI 顯示「已登入」狀態

情境 3: UI 顯示未登入狀態（Happy Path）
GIVEN 使用者尚未登入 Cloudflare 帳號
WHEN 使用者查看應用程式
THEN UI 顯示「未登入」狀態
  AND 需要帳號認證的功能（如 Named Tunnel）標示為需先登入

情境 4: 認證過程中使用者取消授權（Error Path）
GIVEN 系統已開啟瀏覽器導向 Cloudflare 授權頁面
WHEN 使用者在瀏覽器中取消授權或關閉授權頁面
THEN 應用程式顯示「認證已取消」的提示
  AND 維持「未登入」狀態

情境 5: 已儲存的認證憑證過期（Error Path）
GIVEN 使用者之前已登入但認證憑證已過期
WHEN 使用者嘗試使用需要認證的功能
THEN 應用程式提示「認證已過期，請重新登入」
  AND 提供重新登入的操作入口

**h2. 不含（Out of Scope）**

- 不含 API Token 認證方式
- 不含多帳號切換
- 不含帳號權限檢查（假設帳號有足夠權限）

**h2. 依賴**

- Story 19（cloudflared 環境準備）— 認證流程透過 cloudflared 執行

**h2. 優先序**

P1 — 賦能 Named Tunnel 和自訂網域功能（4+ Stories），是 Release 3b 的基礎

**Labels**: `P1`, `enabler`

---

### [Story 26] 登出 Cloudflare 帳號

**h2. 描述**

身為開發者，我需要能從應用程式登出 Cloudflare 帳號，以便在切換帳號或不再需要進階功能時清除認證狀態。

**h2. 範圍**

在應用程式設定或帳號區域提供登出操作，清除已儲存的認證憑證。

**h2. 驗收標準**

情境 1: 正常登出（Happy Path）
GIVEN 使用者已登入 Cloudflare 帳號
  AND 沒有 Named Tunnel 正在運行
WHEN 使用者執行登出操作
THEN 已儲存的認證憑證被清除
  AND UI 更新為「未登入」狀態

情境 2: 有 Named Tunnel 運行中時登出（Edge Case）
GIVEN 使用者已登入 Cloudflare 帳號
  AND 有 Named Tunnel 正在運行
WHEN 使用者執行登出操作
THEN 應用程式提示「登出將停止所有 Named Tunnel，是否繼續？」
  AND 若使用者確認，停止所有 Named Tunnel 後再清除認證

**h2. 依賴**

- Story 25（Cloudflare 帳號認證）— 需要有登入狀態才有登出場景

**h2. 優先序**

P2 — 帳號管理的配對操作

**Labels**: `P2`, `user-story`

---

### [Story 27] 建立 Named Tunnel 並顯示狀態與 URL

**h2. 描述**

身為開發者，我需要為網頁建立 Named Tunnel，以便取得不會因應用程式重啟而改變的持久公開 URL。

**h2. 範圍**

已登入的使用者可對執行中的網頁建立 Named Tunnel，取得持久的公開 URL，並在 UI 上查看 Tunnel 狀態。

**h2. 驗收標準**

情境 1: 建立 Named Tunnel（Happy Path）
GIVEN 使用者已登入 Cloudflare 帳號
  AND 清單中有一個本地伺服器正在運行的網頁
WHEN 使用者對該網頁執行「建立持久 Tunnel」操作
THEN 系統建立 Named Tunnel
  AND 在 30 秒內顯示 Cloudflare 分配的持久公開 URL
  AND 該網頁的狀態更新為「持久公開」

情境 2: 已有 Quick Tunnel 時建立 Named Tunnel（Edge Case）
GIVEN 某個網頁已啟動 Quick Tunnel
  AND 使用者已登入 Cloudflare 帳號
WHEN 使用者對該網頁執行「建立持久 Tunnel」操作
THEN 系統建立 Named Tunnel 取代原有的 Quick Tunnel
  AND Quick Tunnel 自動停止
  AND UI 更新顯示持久公開 URL

情境 3: 查看 Named Tunnel 狀態與 URL（Happy Path）
GIVEN 某個網頁已建立 Named Tunnel
WHEN 使用者檢視清單
THEN 該網頁項目顯示 Named Tunnel 的持久公開 URL
  AND 顯示 Tunnel 的運行狀態（運行中 / 已停止）
  AND 支援一鍵複製公開 URL

情境 4: 重啟應用後恢復 Named Tunnel（Happy Path）
GIVEN 使用者已為某個網頁建立 Named Tunnel
  AND 使用者關閉並重新開啟應用程式
WHEN 應用程式啟動
THEN 應用程式自動重新連接已建立的 Named Tunnel
  AND 使用相同的持久公開 URL

情境 5: 未登入時嘗試建立 Named Tunnel（Error Path）
GIVEN 使用者尚未登入 Cloudflare 帳號
WHEN 使用者嘗試建立 Named Tunnel
THEN 應用程式提示需要先登入
  AND 提供登入操作入口

**h2. 依賴**

- Story 25（Cloudflare 帳號認證）— 需要已認證的帳號
- Story 20（子程序生命週期管理）— 需要子程序管理機制

**h2. 優先序**

P1 — Release 3b 的核心交付，持久 URL 是 Named Tunnel 的核心價值

**Labels**: `P1`, `user-story`

---

### [Story 28] 停止 Named Tunnel

**h2. 描述**

身為開發者，我需要能手動停止 Named Tunnel，以便在不需要對外存取時暫停公開服務，同時保留 Tunnel 設定供日後重新啟動。

**h2. 範圍**

停止 Named Tunnel 的運行但保留其設定，日後可重新啟動使用相同 URL。

**h2. 驗收標準**

情境 1: 停止 Named Tunnel（Happy Path）
GIVEN 某個網頁有 Named Tunnel 正在運行
WHEN 使用者對該網頁執行「停止 Tunnel」操作
THEN Named Tunnel 停止運行
  AND 公開 URL 暫時不可存取
  AND Tunnel 設定保留（可重新啟動）

情境 2: 重新啟動已停止的 Named Tunnel（Happy Path）
GIVEN 某個網頁有已停止的 Named Tunnel
WHEN 使用者對該網頁執行「啟動 Tunnel」操作
THEN Named Tunnel 重新啟動
  AND 使用相同的持久公開 URL

**h2. 依賴**

- Story 27（建立 Named Tunnel）— 需要有已建立的 Named Tunnel

**h2. 優先序**

P2 — Named Tunnel 的管理操作，提供靈活的開關控制

**Labels**: `P2`, `user-story`

---

### [Story 29] 刪除 Named Tunnel

**h2. 描述**

身為開發者，我需要能刪除不再需要的 Named Tunnel，以便在 Cloudflare 帳號中清理不再使用的 Tunnel 資源。

**h2. 範圍**

從 Cloudflare 帳號中刪除 Named Tunnel，同時清除本地設定。

**h2. 驗收標準**

情境 1: 刪除 Named Tunnel（Happy Path）
GIVEN 某個網頁有已建立的 Named Tunnel（運行中或已停止）
WHEN 使用者對該網頁執行「刪除 Tunnel」操作
THEN 應用程式顯示確認提示（說明刪除後 URL 將永久失效）
  AND 使用者確認後，Named Tunnel 從 Cloudflare 帳號中刪除
  AND 本地 Tunnel 設定被清除
  AND 該網頁回到「僅限本地」狀態

情境 2: 刪除後可重新建立（Happy Path）
GIVEN 某個網頁的 Named Tunnel 已被刪除
WHEN 使用者對該網頁重新建立 Named Tunnel
THEN 系統建立全新的 Named Tunnel
  AND 分配新的持久公開 URL

情境 3: 刪除有自訂網域綁定的 Named Tunnel（Edge Case）
GIVEN 某個網頁的 Named Tunnel 已綁定自訂網域
WHEN 使用者對該網頁執行「刪除 Tunnel」操作
THEN 應用程式提示「刪除 Tunnel 將同時解除自訂網域綁定，是否繼續？」
  AND 使用者確認後，解除網域綁定並刪除 Tunnel

情境 4: 刪除時網路不可用（Error Path）
GIVEN 某個網頁有已建立的 Named Tunnel
  AND 使用者的網路連線已中斷
WHEN 使用者對該網頁執行「刪除 Tunnel」操作
THEN 應用程式顯示「無法連線至 Cloudflare，請檢查網路後重試」的錯誤訊息
  AND Tunnel 設定保持不變

**h2. 依賴**

- Story 27（建立 Named Tunnel）— 需要有已建立的 Named Tunnel

**h2. 優先序**

P3 — 進階管理功能，非必要但完善管理流程

**Labels**: `P3`, `user-story`

---

### [Story 30] Named Tunnel 異常處理（建立失敗、斷線）

**h2. 描述**

身為開發者，我需要在 Named Tunnel 發生異常時看到明確的錯誤訊息，以便快速了解問題並採取對應措施。

**h2. 範圍**

Named Tunnel 建立失敗與運行中斷線的錯誤處理。

**h2. 驗收標準**

情境 1: 認證過期導致建立失敗（Error Path）
GIVEN 使用者已登入 Cloudflare 帳號但認證已過期
WHEN 使用者嘗試建立 Named Tunnel
THEN 應用程式顯示「認證已過期，請重新登入」的錯誤訊息
  AND 提供重新登入的操作入口

情境 2: 帳號 Tunnel 配額已滿（Error Path）
GIVEN 使用者的 Cloudflare 帳號已達 Tunnel 數量上限
WHEN 使用者嘗試建立新的 Named Tunnel
THEN 應用程式顯示「已達 Tunnel 數量上限」的錯誤訊息

情境 3: Named Tunnel 斷線後自動重連成功（Error Path）
GIVEN 某個 Named Tunnel 正在運行
WHEN Tunnel 連線因網路問題中斷
THEN UI 更新顯示「Tunnel 重連中」的狀態
  AND 系統自動嘗試重連
  AND 重連成功後 UI 恢復為「持久公開」狀態

情境 4: Named Tunnel 斷線後多次重連失敗（Error Path）
GIVEN 某個 Named Tunnel 連線中斷
WHEN 系統連續多次重連嘗試皆失敗
THEN UI 顯示「Tunnel 已斷線，請手動重新啟動」的提示
  AND 停止自動重連嘗試

**h2. 依賴**

- Story 27（建立 Named Tunnel）— 是建立流程的異常分支

**h2. 優先序**

P3 — 邊界情境處理，提升穩健性

**Labels**: `P3`, `user-story`

---

### [Story 31] 綁定自訂網域（含自動 DNS 設定與狀態顯示）

**h2. 描述**

身為開發者，我需要將自訂網域綁定到 Named Tunnel，以便透過自己的網域名稱（如 mysite.example.com）存取本地網頁，取代 Cloudflare 自動生成的 URL。

**h2. 範圍**

輸入自訂網域並綁定到已建立的 Named Tunnel，應用程式自動建立對應的 DNS CNAME 記錄，並在 UI 上顯示綁定狀態。錯誤情境由 Story 33 覆蓋。

**h2. 驗收標準**

情境 1: 綁定自訂網域（Happy Path）
GIVEN 使用者已登入 Cloudflare 帳號
  AND 某個網頁已建立 Named Tunnel
  AND 使用者擁有一個在 Cloudflare 管理的網域
WHEN 使用者輸入自訂網域（如 dev.example.com）並確認綁定
THEN 應用程式自動建立對應的 DNS CNAME 記錄
  AND UI 顯示「網域綁定中」的狀態
  AND 綁定完成後 UI 更新為「自訂網域已綁定」並顯示網域名稱

情境 2: 透過自訂網域存取（Happy Path）
GIVEN 自訂網域已綁定且 DNS 記錄已生效
WHEN 外部人員在瀏覽器中開啟自訂網域
THEN 外部人員看到與本地 localhost 相同的網頁內容

情境 3: 查看綁定狀態（Happy Path）
GIVEN 某個網頁已綁定自訂網域
WHEN 使用者檢視清單
THEN 該網頁項目同時顯示 Tunnel URL 與自訂網域
  AND 顯示 DNS 記錄的生效狀態

**h2. 依賴**

- Story 27（建立 Named Tunnel）— 需要有已建立的 Named Tunnel
- Story 25（Cloudflare 帳號認證）— 需要帳號權限以操作 DNS

**h2. 優先序**

P2 — Release 3c 的核心交付，自訂網域是進階需求

**Labels**: `P2`, `user-story`

---

### [Story 32] 解除自訂網域綁定

**h2. 描述**

身為開發者，我需要能解除自訂網域的綁定，以便將網域釋放給其他用途或清理不再使用的設定。

**h2. 範圍**

解除自訂網域與 Named Tunnel 的綁定，並清理對應的 DNS CNAME 記錄。

**h2. 驗收標準**

情境 1: 解除網域綁定（Happy Path）
GIVEN 某個網頁已綁定自訂網域
WHEN 使用者對該網頁執行「解除網域綁定」操作
THEN 應用程式顯示確認提示
  AND 使用者確認後，刪除對應的 DNS CNAME 記錄
  AND 自訂網域不再指向該 Tunnel
  AND Named Tunnel 仍保持運行（僅透過 Tunnel URL 存取）

情境 2: 解除後重新綁定（Happy Path）
GIVEN 某個網頁的自訂網域已被解除
WHEN 使用者對該網頁重新綁定自訂網域
THEN 可綁定相同或不同的網域

**h2. 依賴**

- Story 31（綁定自訂網域）— 需要有已綁定的網域

**h2. 優先序**

P3 — 網域管理的配對操作

**Labels**: `P3`, `user-story`

---

### [Story 33] 自訂網域異常處理

**h2. 描述**

身為開發者，我需要在自訂網域設定遇到問題時看到明確的錯誤原因，以便了解問題並採取對應措施。

**h2. 範圍**

自訂網域綁定過程中的錯誤偵測與使用者友善的提示。

**h2. 驗收標準**

情境 1: 網域不在 Cloudflare 管理下（Error Path）
GIVEN 使用者已進入網域綁定流程
WHEN 使用者提交的網域不在其 Cloudflare 帳號管理下
THEN 應用程式顯示「此網域不在你的 Cloudflare 帳號中，請先將網域的 DNS 託管到 Cloudflare」的錯誤提示

情境 2: DNS 傳播延遲（Edge Case）
GIVEN 使用者已成功綁定自訂網域
  AND DNS CNAME 記錄已建立
WHEN DNS 記錄尚未在全球生效
THEN UI 顯示「DNS 傳播中，可能需要數分鐘才能完全生效」的狀態提示
  AND 提示消失的時機為首次成功透過自訂網域存取後

情境 3: 網域已被其他 Tunnel 使用（Edge Case）
GIVEN 使用者已進入網域綁定流程
WHEN 使用者提交的網域已被其他 Tunnel（本應用或外部）綁定
THEN 應用程式顯示「此網域已被其他 Tunnel 使用」的錯誤提示

**h2. 依賴**

- Story 31（綁定自訂網域）— 是綁定流程的異常分支

**h2. 優先序**

P3 — 邊界情境處理，提升使用者遇到問題時的體驗

**Labels**: `P3`, `user-story`
