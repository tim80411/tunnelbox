interface ShortcutsPanelProps {
  open: boolean
  onClose: () => void
}

const isMac = navigator.platform.toUpperCase().includes('MAC')
const mod = isMac ? '⌘' : 'Ctrl'

const shortcuts = [
  { section: 'General' },
  { keys: `${mod} N`, label: 'New Site' },
  { keys: `${mod} ,`, label: 'Settings' },
  { keys: `${mod} /`, label: 'Keyboard Shortcuts' },
  { keys: 'Esc', label: 'Close Panel / Modal' },

  { section: 'Sites' },
  { keys: '↑ / ↓', label: 'Navigate Sites' },
  { keys: `${mod} O`, label: 'Open in Browser' },
  { keys: `${mod} R`, label: 'Restart Server' },
  { keys: `${mod} ⌫`, label: 'Remove Site' },
  { keys: `${mod} V`, label: 'Paste Path to Add Site' },

  { section: 'Window' },
  { keys: `${mod} W`, label: isMac ? 'Close Window' : 'Close' },
  { keys: `${mod} M`, label: 'Minimize' },
  ...(isMac
    ? [
        { keys: '⌘ H', label: 'Hide TunnelBox' },
        { keys: '⌘ Q', label: 'Quit' }
      ]
    : [])
] as Array<{ section?: string; keys?: string; label?: string }>

function ShortcutsPanel({ open, onClose }: ShortcutsPanelProps): React.ReactElement {
  return (
    <>
      {open && <div className="shortcuts-overlay" data-dismiss onClick={onClose} />}
      <aside className={`shortcuts-panel${open ? ' shortcuts-panel-open' : ''}`}>
        <div className="shortcuts-panel-header">
          <h2 className="panel-title">Keyboard Shortcuts</h2>
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
