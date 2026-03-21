import type { AppSettings, ServeMode } from '../../../shared/types'

interface SettingsPanelProps {
  open: boolean
  settings: AppSettings
  onClose: () => void
  onUpdate: (patch: Partial<AppSettings>) => Promise<AppSettings>
}

function SettingsPanel({ open, settings, onClose, onUpdate }: SettingsPanelProps): React.ReactElement {
  return (
    <>
      {open && <div className="settings-overlay" onClick={onClose} />}
      <aside className={`settings-panel${open ? ' settings-panel-open' : ''}`}>
        <div className="settings-header">
          <h2 className="settings-title">Settings</h2>
          <button className="settings-close" onClick={onClose}>×</button>
        </div>

        <div className="settings-body">
          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">Auto-start servers</span>
              <span className="settings-item-desc">啟動應用程式時自動啟動所有伺服器</span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={settings.autoStartServers}
                onChange={(e) => onUpdate({ autoStartServers: e.target.checked })}
              />
              <span className="settings-toggle-track" />
            </label>
          </div>

          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">Default serve mode</span>
              <span className="settings-item-desc">新增站點時的預設模式</span>
            </div>
            <select
              className="settings-select"
              value={settings.defaultServeMode}
              onChange={(e) => onUpdate({ defaultServeMode: e.target.value as ServeMode })}
            >
              <option value="static">Static</option>
              <option value="proxy">Proxy</option>
            </select>
          </div>
        </div>
      </aside>
    </>
  )
}

export default SettingsPanel
