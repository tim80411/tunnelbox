# System Tray

TunnelBox 啟動後會在系統匣（macOS 選單列 / Windows 工作列 / Linux 通知區域）顯示圖示。

## 功能

右鍵（macOS 左鍵亦可）點擊系統匣圖示，會顯示快捷選單：

- **站點清單** — 顯示所有站點及其狀態
  - `●` 運行中（同時顯示公開 URL 或 localhost URL）
  - `○` 已停止
  - `✕` 錯誤
- **開啟 TunnelBox** — 顯示主視窗
- **退出** — 完全結束程式

## 行為

- 關閉主視窗時，程式不會結束，而是縮小到系統匣繼續運行
- 在 Windows 和 Linux 上，左鍵點擊系統匣圖示即可開啟主視窗
- macOS 使用 Template Image，會自動適應亮色 / 暗色選單列
