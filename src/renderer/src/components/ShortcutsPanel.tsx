interface ShortcutsPanelProps {
  open: boolean
  onClose: () => void
}

const isMac = navigator.platform.toUpperCase().includes('MAC')
const mod = isMac ? '⌘' : 'Ctrl'

const shortcuts = [
  { section: '一般' },
  { keys: `${mod} N`, label: '新增網站' },
  { keys: `${mod} ,`, label: '設定' },
  { keys: `${mod} /`, label: '鍵盤快捷鍵' },
  { keys: 'Esc', label: '關閉面板／視窗' },

  { section: '網站' },
  { keys: '↑ / ↓', label: '切換網站' },
  { keys: `${mod} O`, label: '在瀏覽器中開啟' },
  { keys: `${mod} R`, label: '重新啟動伺服器' },
  { keys: `${mod} ⌫`, label: '移除網站' },
  { keys: `${mod} V`, label: '貼上路徑以新增網站' },

  { section: '視窗' },
  { keys: `${mod} W`, label: isMac ? '關閉視窗' : '關閉' },
  { keys: `${mod} M`, label: '最小化' },
  ...(isMac
    ? [
        { keys: '⌘ H', label: '隱藏 TunnelBox' },
        { keys: '⌘ Q', label: '結束 TunnelBox' }
      ]
    : [])
] as Array<{ section?: string; keys?: string; label?: string }>

function ShortcutsPanel({ open, onClose }: ShortcutsPanelProps): React.ReactElement {
  return (
    <>
      {open && <div className="shortcuts-overlay" data-dismiss onClick={onClose} />}
      <aside className={`shortcuts-panel${open ? ' shortcuts-panel-open' : ''}`}>
        <div className="shortcuts-panel-header">
          <h2 className="panel-title">鍵盤快捷鍵</h2>
          <button className="panel-close" onClick={onClose}>×</button>
        </div>

        <div className="shortcuts-panel-body">
          {shortcuts.map((item, i) =>
            item.section ? (
              <h3 key={i} className="shortcuts-section">{item.section}</h3>
            ) : (
              <div key={i} className="shortcuts-row">
                <kbd className="shortcuts-keys">{item.keys}</kbd>
                <span className="shortcuts-label">{item.label}</span>
              </div>
            )
          )}
        </div>
      </aside>
    </>
  )

}

export default ShortcutsPanel
