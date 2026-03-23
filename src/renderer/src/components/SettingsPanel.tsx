import { useState, useEffect } from 'react'
import type { AppSettings, ServeMode, CloudflaredEnv, FrpServerConfig, BoreServerConfig } from '../../../shared/types'
import type { UpdateState } from '../../../shared/update-types'

interface SettingsPanelProps {
  open: boolean
  settings: AppSettings
  onClose: () => void
  onUpdate: (patch: Partial<AppSettings>) => Promise<AppSettings>
  appVersion: string
  updateState: UpdateState
  onCheckForUpdates: () => Promise<void>
  frpcEnv: CloudflaredEnv
  frpConfig: FrpServerConfig | null
  onInstallFrpc: () => Promise<void>
  onSaveFrpConfig: (config: FrpServerConfig) => Promise<FrpServerConfig>
  boreEnv: CloudflaredEnv
  boreConfig: BoreServerConfig | null
  onInstallBore: () => Promise<void>
  onSaveBoreConfig: (config: BoreServerConfig) => Promise<BoreServerConfig>
}

function SettingsPanel({
  open, settings, onClose, onUpdate,
  appVersion, updateState, onCheckForUpdates,
  frpcEnv, frpConfig, onInstallFrpc, onSaveFrpConfig,
  boreEnv, boreConfig, onInstallBore, onSaveBoreConfig
}: SettingsPanelProps): React.ReactElement {
  const isChecking = updateState.phase === 'checking'

  // frp config form state
  const [frpAddr, setFrpAddr] = useState('')
  const [frpPort, setFrpPort] = useState('7000')
  const [frpToken, setFrpToken] = useState('')
  const [frpSaving, setFrpSaving] = useState(false)
  const [frpError, setFrpError] = useState<string | null>(null)
  const [frpSaved, setFrpSaved] = useState(false)

  // Populate form when panel opens — intentionally omit frpConfig to avoid
  // resetting form (and killing the "已儲存" flash) on every save
  useEffect(() => {
    if (!open) return
    if (frpConfig) {
      setFrpAddr(frpConfig.serverAddr)
      setFrpPort(String(frpConfig.serverPort))
      setFrpToken(frpConfig.authToken || '')
    } else {
      setFrpAddr('')
      setFrpPort('7000')
      setFrpToken('')
    }
    setFrpError(null)
    setFrpSaved(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // bore config form state
  const [boreAddr, setBoreAddr] = useState('')
  const [borePort, setBorePort] = useState('7835')
  const [boreSecret, setBoreSecret] = useState('')
  const [boreSaving, setBoreSaving] = useState(false)
  const [boreError, setBoreError] = useState<string | null>(null)
  const [boreSaved, setBoreSaved] = useState(false)

  useEffect(() => {
    if (!open) return
    if (boreConfig) {
      setBoreAddr(boreConfig.serverAddr)
      setBorePort(String(boreConfig.serverPort))
      setBoreSecret(boreConfig.secret || '')
    } else {
      setBoreAddr('')
      setBorePort('7835')
      setBoreSecret('')
    }
    setBoreError(null)
    setBoreSaved(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleSaveBoreConfig = async () => {
    const addr = boreAddr.trim()
    if (!addr) {
      setBoreError('請輸入伺服器位址')
      return
    }
    const port = parseInt(borePort, 10)
    if (isNaN(port) || port < 1 || port > 65535) {
      setBoreError('請輸入有效的 Port（1-65535）')
      return
    }
    setBoreError(null)
    setBoreSaving(true)
    setBoreSaved(false)
    try {
      await onSaveBoreConfig({
        serverAddr: addr,
        serverPort: port,
        secret: boreSecret.trim() || undefined
      })
      setBoreSaved(true)
      setTimeout(() => setBoreSaved(false), 2000)
    } catch (err) {
      setBoreError(err instanceof Error ? err.message : '儲存失敗')
    } finally {
      setBoreSaving(false)
    }
  }

  const handleSaveFrpConfig = async () => {
    const addr = frpAddr.trim()
    if (!addr) {
      setFrpError('請輸入伺服器位址')
      return
    }
    const port = parseInt(frpPort, 10)
    if (isNaN(port) || port < 1 || port > 65535) {
      setFrpError('請輸入有效的 Port（1-65535）')
      return
    }
    setFrpError(null)
    setFrpSaving(true)
    setFrpSaved(false)
    try {
      await onSaveFrpConfig({
        serverAddr: addr,
        serverPort: port,
        authToken: frpToken.trim() || undefined
      })
      setFrpSaved(true)
      setTimeout(() => setFrpSaved(false), 2000)
    } catch (err) {
      setFrpError(err instanceof Error ? err.message : '儲存失敗')
    } finally {
      setFrpSaving(false)
    }
  }

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

  // frpc status display
  const frpcStatusText = (() => {
    switch (frpcEnv.status) {
      case 'available': return `已安裝（${frpcEnv.version || '?'}）`
      case 'not_installed': return '未安裝'
      case 'installing': return '安裝中...'
      case 'install_failed': return `安裝失敗${frpcEnv.errorMessage ? `：${frpcEnv.errorMessage}` : ''}`
      case 'outdated': return `版本過舊（${frpcEnv.version || '?'}）`
      case 'checking': return '檢查中...'
      case 'error': return `錯誤${frpcEnv.errorMessage ? `：${frpcEnv.errorMessage}` : ''}`
      default: return ''
    }
  })()

  const canInstallFrpc = frpcEnv.status === 'not_installed' || frpcEnv.status === 'install_failed' || frpcEnv.status === 'outdated'

  // bore status display
  const boreStatusText = (() => {
    switch (boreEnv.status) {
      case 'available': return `已安裝（${boreEnv.version || '?'}）`
      case 'not_installed': return '未安裝'
      case 'installing': return '安裝中...'
      case 'install_failed': return `安裝失敗${boreEnv.errorMessage ? `：${boreEnv.errorMessage}` : ''}`
      case 'outdated': return `版本過舊（${boreEnv.version || '?'}）`
      case 'checking': return '檢查中...'
      case 'error': return `錯誤${boreEnv.errorMessage ? `：${boreEnv.errorMessage}` : ''}`
      default: return ''
    }
  })()

  const canInstallBore = boreEnv.status === 'not_installed' || boreEnv.status === 'install_failed' || boreEnv.status === 'outdated'

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

          {/* frp Provider Section */}
          <div className="settings-section-divider">frp Provider</div>

          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">frpc</span>
              <span className="settings-item-desc">{frpcStatusText}</span>
            </div>
            {canInstallFrpc && (
              <button
                className="btn btn-sm btn-primary"
                onClick={onInstallFrpc}
                disabled={frpcEnv.status === 'installing'}
              >
                {frpcEnv.status === 'installing' ? '安裝中...' : frpcEnv.status === 'outdated' ? '更新' : '安裝'}
              </button>
            )}
          </div>

          <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--sp-3)' }}>
            <div className="settings-item-info">
              <span className="settings-item-label">frp 伺服器設定</span>
              <span className="settings-item-desc">設定 frp 中繼伺服器（frps）的連線資訊</span>
            </div>

            {frpError && <div className="modal-error" style={{ margin: 0 }}>{frpError}</div>}

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Server Address</label>
              <input
                className="form-input"
                type="text"
                placeholder="my-vps.example.com"
                value={frpAddr}
                onChange={(e) => { setFrpAddr(e.target.value); setFrpError(null) }}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Server Port</label>
              <input
                className="form-input"
                type="number"
                placeholder="7000"
                value={frpPort}
                onChange={(e) => { setFrpPort(e.target.value); setFrpError(null) }}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Auth Token（選填）</label>
              <input
                className="form-input"
                type="password"
                placeholder="frps 認證 token"
                value={frpToken}
                onChange={(e) => { setFrpToken(e.target.value); setFrpError(null) }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <button
                className="btn btn-sm btn-primary"
                onClick={handleSaveFrpConfig}
                disabled={frpSaving || !frpAddr.trim()}
              >
                {frpSaving ? '儲存中...' : '儲存'}
              </button>
              {frpSaved && <span className="settings-frp-saved">已儲存</span>}
            </div>
          </div>

          {/* bore Provider Section */}
          <div className="settings-section-divider">bore Provider</div>

          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">bore</span>
              <span className="settings-item-desc">{boreStatusText}</span>
            </div>
            {canInstallBore && (
              <button
                className="btn btn-sm btn-primary"
                onClick={onInstallBore}
                disabled={boreEnv.status === 'installing'}
              >
                {boreEnv.status === 'installing' ? '安裝中...' : boreEnv.status === 'outdated' ? '更新' : '安裝'}
              </button>
            )}
          </div>

          <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--sp-3)' }}>
            <div className="settings-item-info">
              <span className="settings-item-label">bore 伺服器設定</span>
              <span className="settings-item-desc">設定 bore 伺服器的連線資訊</span>
            </div>

            {boreError && <div className="modal-error" style={{ margin: 0 }}>{boreError}</div>}

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Server Address</label>
              <input
                className="form-input"
                type="text"
                placeholder="my-vps.example.com"
                value={boreAddr}
                onChange={(e) => { setBoreAddr(e.target.value); setBoreError(null) }}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Server Port</label>
              <input
                className="form-input"
                type="number"
                placeholder="7835"
                value={borePort}
                onChange={(e) => { setBorePort(e.target.value); setBoreError(null) }}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Secret（選填）</label>
              <input
                className="form-input"
                type="password"
                placeholder="bore server secret"
                value={boreSecret}
                onChange={(e) => { setBoreSecret(e.target.value); setBoreError(null) }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <button
                className="btn btn-sm btn-primary"
                onClick={handleSaveBoreConfig}
                disabled={boreSaving || !boreAddr.trim()}
              >
                {boreSaving ? '儲存中...' : '儲存'}
              </button>
              {boreSaved && <span className="settings-frp-saved">已儲存</span>}
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

export default SettingsPanel
