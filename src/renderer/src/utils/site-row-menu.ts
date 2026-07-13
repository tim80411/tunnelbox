import type { SiteInfo } from '../../../shared/types'

export interface MenuPos { x: number; y: number }

/**
 * 把 (w × h) 的選單左上原點夾在 (viewportW × viewportH) 視窗內，四邊留 pad px。純函式、無 DOM。
 */
export function clampMenuPosition(
  x: number, y: number, w: number, h: number,
  viewportW: number, viewportH: number, pad = 8
): MenuPos {
  const cx = Math.max(pad, Math.min(x, viewportW - w - pad))
  const cy = Math.max(pad, Math.min(y, viewportH - h - pad))
  return { x: cx, y: cy }
}

export type MenuActionKey = 'toggle' | 'rename' | 'remove'

export interface MenuItemVM {
  key: MenuActionKey
  label: string
  danger?: boolean
  separatorBefore?: boolean
}

/**
 * rail 列右鍵選單的項目模型。`toggle` 依伺服器狀態在 啟動/停止 之間切換；
 * 「在瀏覽器開啟」刻意省略（選單可被叫出時該列的行內開啟圖示必然同時可見 — 見 design No-gos）。
 */
export function siteRowMenuItems(site: SiteInfo): MenuItemVM[] {
  const running = site.status === 'running'
  return [
    { key: 'toggle', label: running ? '停止' : '啟動' },
    { key: 'rename', label: '重新命名' },
    { key: 'remove', label: '移除', danger: true, separatorBefore: true }
  ]
}
