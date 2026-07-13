import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { SiteInfo } from '../../../shared/types'
import { clampMenuPosition, siteRowMenuItems, type MenuActionKey } from '../utils/site-row-menu'

interface Props {
  site: SiteInfo
  anchor: { x: number; y: number }
  onAction: (key: MenuActionKey, site: SiteInfo) => void
  onClose: () => void
}

const MENU_W = 200
const ITEM_H = 36
const PAD_Y = 8

function SiteRowMenu({ site, anchor, onAction, onClose }: Props): React.ReactElement {
  const menuRef = useRef<HTMLDivElement>(null)
  const items = siteRowMenuItems(site)
  // 用項目數估高，避免依賴 jsdom 沒有的 layout 量測。
  const estH = items.length * ITEM_H + PAD_Y * 2
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768
  const pos = clampMenuPosition(anchor.x, anchor.y, MENU_W, estH, vw, vh)

  // 開啟時記住觸發元素、把焦點送進第一項；關閉時把焦點還給觸發元素（鍵盤使用者不迷路）。
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    return () => { prev?.focus?.() }
  }, [])

  // outside-click 的 ref 綁在 portal 後的選單節點本身（contains 才正確）；
  // 另外 Esc、任何捲動（含 .rail-list）、視窗失焦都關閉。
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('blur', onClose)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  const moveFocus = (dir: 1 | -1): void => {
    const nodes = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    if (nodes.length === 0) return
    const idx = nodes.findIndex((n) => n === document.activeElement)
    nodes[(idx + dir + nodes.length) % nodes.length].focus()
  }

  return createPortal(
    <div
      ref={menuRef}
      className="overflow-menu site-row-menu"
      role="menu"
      aria-label={`${site.name} 動作`}
      style={{ position: 'fixed', top: pos.y, left: pos.x, right: 'auto' }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-1) }
      }}
    >
      {items.map((it) => (
        <button
          key={it.key}
          role="menuitem"
          className={`overflow-menu-item${it.danger ? ' overflow-menu-item--danger' : ''}${it.separatorBefore ? ' site-row-menu-sep' : ''}`}
          onClick={() => { onAction(it.key, site); onClose() }}
        >
          {it.label}
        </button>
      ))}
    </div>,
    document.body
  )
}

export default SiteRowMenu
