import type { AppSettings, ServeMode } from '../../../shared/types'
import type { UpdateState } from '../../../shared/update-types'

interface SettingsPanelProps {
  open: boolean
  settings: AppSettings
  onClose: () => void
  onUpdate: (patch: Partial<AppSettings>) => Promise<AppSettings>
  appVersion: string
  updateState: UpdateState
  onCheckForUpdates: () => Promise<void>
}

function SettingsPanel({
  open, settings, onClose, onUpdate,
  appVersion, updateState, onCheckForUpdates
}: SettingsPanelProps): React.ReactElement {
  const isChecking = updateState.phase === 'checking'

  // Derive display text from update state
  const updateStatusText = (() => {
    switch (updateState.phase) {
      case 'checking': return '正在檢查...'
      case 'available': return `新版本 v${updateState.version} 可用`
      case 'downloading': return `下載中... ${updateState.percent}%`
      case 'ready': return `v${updateState.version} 已就緒，待重新啟動`
      case 'not-available': return '已是最新版本'
      case 'error': return `檢查失敗：${updateState.message}`
      default: return ''
    }
  })()

  return (
    <>
      {open && <div className="settings-overlay" data-dismiss onClick={onClose} />}
      <aside className={`settings-panel${open ? ' settings-panel-open' : ''}`}>
        <div className="settings-header">
          <h2 className="panel-title">Settings</h2>
          <button className="panel-close" onClick={onClose}>×</button>
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

          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">Version</span>
              <span className="settings-item-desc">v{appVersion || '...'}</span>
            </div>
          </div>

          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">Updates</span>
              {updateStatusText && (
                <span className="settings-item-desc">{updateStatusText}</span>
              )}
            </div>
            <button
              className="btn btn-sm"
              onClick={onCheckForUpdates}
              disabled={isChecking || updateState.phase === 'downloading'}
            >
              {isChecking ? '檢查中...' : '檢查更新'}
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

export default SettingsPanel
