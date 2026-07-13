/**
 * TunnelBox 文案詞彙定本（glossary SSOT）
 *
 * 目的：統一 user-facing 文案用詞、擋回歸。搭配 tests/shared/glossary.test.ts 的防回歸 guard。
 *
 * 哲學（沿用 admission-radar copy-verify 方法論）：
 *   - TERMS：canonical 定本詞，**非強制**引用。字串可直接寫定本字，由 guard 守不回歸即可，
 *     不必全部改走常數（避免過度重構）。此表供撰寫/review 對照。
 *   - BANNED_TERMS：在 zh-TW UI「永遠是錯」的用詞。**只收「任何程式碼語境都不會合法出現」**
 *     的 token（中文詞 / 帶連字號的文案專用字）。英文技術詞（Provider / Port / Tunnel / Console…）
 *     一律不收——它們在變數名 / 型別 / className 合法出現，AST 範圍判斷成本高；那類外洩靠人 review。
 *
 * 語言政策（2026-07 決議）：UI 全繁中；下列**專有名詞保留英文**——
 *   TunnelBox / Cloudflare / frp / bore / cloudflared / frpc / Pro / Free / QR Code /
 *   CNAME / DNS / URL / Token / Secret；規格保留的技術縮寫（Local / LAN / WAN /
 *   Reach / Request Log）依 master-detail-ui-b-plan 規格辦理。模式標籤 static/proxy/direct
 *   已於 2026-07 統一為中文（靜態／代理／轉發），不再保留 Sta/Pxy/Dir。
 */

export interface Term {
  /** 定本用詞 */
  canonical: string
  /** 應避免、應收斂為 canonical 的舊用詞 */
  avoid?: string[]
  /** 決議背景 / 規格出處 */
  note?: string
}

/** 定本詞（非強制；供撰寫與 review 對照） */
export const TERMS: Record<string, Term> = {
  site: {
    canonical: '網站',
    avoid: ['站點', '網頁', 'site', 'Site', 'Sites'],
    note: '使用者建立的服務單位。全站統一「網站」（2026-07 決議，覆蓋 master-detail-ui 規格原本的網站/站點分語境）',
  },
  shareVerb: {
    canonical: '分享',
    note: '對外公開的動作動詞；完整片語用「公開分享」。避免中英混用的 share',
  },
  publicUrl: {
    canonical: '公開網址',
    avoid: ['對外網址', '公開網路'],
    note: '公開後可對外存取的網址（名詞）',
  },
  provider: {
    canonical: 'Tunnel 服務',
    avoid: ['Provider'],
    note: 'Cloudflare / frp / bore 這一層。Tunnel 為品牌詞保留',
  },
  port: {
    canonical: '連接埠',
    avoid: ['Port', '埠', '端口'],
    note: 'provider-ui-unification 規格定本',
  },
  proxyMode: { canonical: '反向代理', avoid: ['Proxy', 'Reverse proxy'] },
  staticMode: { canonical: '靜態檔案', avoid: ['Static', 'Static files'] },
  directMode: { canonical: '直接轉發', avoid: ['Direct', 'Port forward'] },
  domain: { canonical: '網域', avoid: ['domain'] },
  requestLog: {
    canonical: '請求日誌',
    note: '區塊標題採「請求日誌 · Request Log」中英並列（master-detail-ui 規格設計，保留）',
  },
  consolePanel: { canonical: '主控台', avoid: ['Console'], note: '遠端主控台 / 開啟遠端主控台（2026-07 首次定案）' },
  dashboard: { canonical: '儀表板', avoid: ['Dashboard'], note: 'DashboardPanel（2026-07 首次定案）' },
  reach: {
    canonical: '觸達通道',
    note: '官方品牌詞。標題採「觸達通道 · Reach」並列（master-detail-ui 規格設計，保留）',
  },
}

/**
 * load-bearing 常數，定義於 src/renderer/src/utils/site-view.ts，**勿在文案 loop 改**：
 *   SITE_STATE_LABEL = { run:'運行中', share:'分享中', stop:'已停止' }
 *   RAIL_MODE_LABEL  = { static:'靜態', proxy:'代理', direct:'轉發' }（2026-07 統一中文；rail chip 與詳情 badge 共用）
 */

export interface BannedTerm {
  /** 禁用字（會被 guard 掃描比對） */
  term: string
  /** 建議改用 */
  suggest: string
  /** 為何禁用 */
  why: string
}

export const BANNED_TERMS: BannedTerm[] = [
  // ── 中國用語（zh-TW UI 永遠是錯；均經零碰撞驗證）──
  { term: '用戶', suggest: '使用者', why: '中國用語' },
  { term: '信息', suggest: '訊息 / 資訊', why: '中國用語' },
  { term: '網絡', suggest: '網路', why: '中國用語' },
  { term: '默認', suggest: '預設', why: '中國用語' },
  { term: '保存', suggest: '儲存', why: '中國用語' },
  { term: '端口', suggest: '連接埠', why: '中國用語' },
  { term: '屏幕', suggest: '螢幕', why: '中國用語' },
  { term: '質量', suggest: '品質', why: '中國用語' },
  { term: '軟件', suggest: '軟體', why: '中國用語' },
  { term: '硬件', suggest: '硬體', why: '中國用語' },
  { term: '視頻', suggest: '影片', why: '中國用語' },
  { term: '內存', suggest: '記憶體', why: '中國用語' },
  { term: '緩存', suggest: '快取', why: '中國用語' },
  { term: '調試', suggest: '除錯', why: '中國用語' },
  { term: '登錄', suggest: '登入', why: '中國用語' },
  { term: '文件夾', suggest: '資料夾', why: '中國用語' },

  // ── 違反 Pro 定價框架（pro-features spec §Copy Guidelines：use-case framing，禁 paywall framing）──
  // 註：不 ban 裸「解鎖」——它有合法文案「鑰匙圈已解鎖」。只 ban 零碰撞的付費框架片語。
  { term: '付費才', suggest: '改用「Pro 用於 [用途]」框架', why: 'paywall framing（spec 禁）' },
  { term: '才能解鎖', suggest: '改用用途框架，勿用鎖/解鎖', why: 'paywall framing（spec 禁）' },
  { term: '升級才能', suggest: '改用「升級以 [用途]」', why: 'paywall framing（spec 禁）' },
  { term: '付費解鎖', suggest: '改用用途框架', why: 'paywall framing（spec 禁）' },
  { term: 'Paywall', suggest: '改用 Workflow / Mode / Capacity 框架', why: 'paywall framing（spec 禁）' },

  // ── 已決議翻成繁中的英文行話（2026-07 決議；翻譯後仍須保留 use-case 框架）──
  { term: 'single-demo', suggest: '單次展示', why: '英文行話，全繁中政策' },
  { term: 'multi-client', suggest: '多客戶', why: '英文行話，全繁中政策' },
  { term: 'agency', suggest: '接案 / 代理商', why: '英文行話，全繁中政策' },
]
