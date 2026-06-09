import type { AppSettings, ServeMode, CloudflareAuth, CloudflareAccountsState } from '../../../shared/types'
import type { UpdateState } from '../../../shared/update-types'
import type { TierState } from '../../../shared/license-types'
import type { ProviderType } from '../providers/registry'
import type { ProviderEnv } from '../../../shared/provider-types'
import { providers as providerDefs } from '../providers/registry'
import ProviderTabs from './ProviderTabs'
import ProviderStatus from './ProviderStatus'
import ProviderConfigForm from './ProviderConfigForm'
import CloudflareAuthSection from './CloudflareAuthSection'
import CloudflareAccountsSection from './CloudflareAccountsSection'
import FounderBadge from './FounderBadge'
import { DAEMON_COPY } from '../../../shared/copy/pro-strings'

interface SettingsPanelProps {
  open: boolean
  settings: AppSettings
  onClose: () => void
  onUpdate: (patch: Partial<AppSettings>) => Promise<AppSettings>
  appVersion: string
  updateState: UpdateState
  onCheckForUpdates: () => Promise<void>
  tierState?: TierState
  onUpgrade?: () => void
  onActivatePro?: () => void

  providers?: Record<ProviderType, {
    env: ProviderEnv
    config: unknown
    install: () => Promise<void>
    saveConfig: (c: unknown) => Promise<unknown>
  }>
  auth?: CloudflareAuth
  hasRunningNamedTunnels?: boolean
  onLogin?: () => Promise<void>
  onLogout?: () => Promise<void>
  cfAccountsState?: CloudflareAccountsState
  onAddCfAccount?: () => Promise<CloudflareAccountsState>
  onRemoveCfAccount?: (accountId: string) => Promise<CloudflareAccountsState>
  onSetActiveCfAccount?: (accountId: string) => Promise<CloudflareAccountsState>
  onSetCfAccountLabel?: (accountId: string, label: string | null) => Promise<CloudflareAccountsState>
}

// Default no-op env for fallback
const defaultEnv: ProviderEnv = { status: 'checking' }
const noop = async (): Promise<void> => {}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noopSave = async (c: any): Promise<any> => c

const defaultProviders: Record<ProviderType, {
  env: ProviderEnv
  config: unknown
  install: () => Promise<void>
  saveConfig: (c: unknown) => Promise<unknown>
}> = {
  cloudflare: { env: defaultEnv, config: null, install: noop, saveConfig: noopSave },
  frp: { env: defaultEnv, config: null, install: noop, saveConfig: noopSave },
  bore: { env: defaultEnv, config: null, install: noop, saveConfig: noopSave }
}

function SettingsPanel({
  open, settings, onClose, onUpdate,
  appVersion, updateState, onCheckForUpdates,
  providers: providersProp,
  auth: authProp,
  hasRunningNamedTunnels = false,
  onLogin,
  onLogout,
  tierState,
  onUpgrade,
  onActivatePro,
  cfAccountsState,
  onAddCfAccount,
  onRemoveCfAccount,
  onSetActiveCfAccount,
  onSetCfAccountLabel
}: SettingsPanelProps): React.ReactElement {
  const isChecking = updateState.phase === 'checking'
  const isPro = tierState?.isPro ?? false

  const resolvedProviders = providersProp ?? defaultProviders
  const resolvedAuth: CloudflareAuth = authProp ?? { status: 'logged_out' }

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
              <span className="settings-item-label">Visitor notifications</span>
              <span className="settings-item-desc">訪客透過 tunnel 到訪時顯示桌面通知</span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={settings.visitorNotifications}
                onChange={(e) => onUpdate({ visitorNotifications: e.target.checked })}
              />
              <span className="settings-toggle-track" />
            </label>
          </div>

          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">Remote console</span>
              <span className="settings-item-desc">在注入 script 中攔截訪客端 console 輸出並回傳至本地 app</span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={settings.remoteConsoleEnabled}
                onChange={(e) => onUpdate({ remoteConsoleEnabled: e.target.checked })}
              />
              <span className="settings-toggle-track" />
            </label>
          </div>

          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">Request log limit</span>
              <span className="settings-item-desc">每個 Proxy 站點保留的最大請求記錄數</span>
            </div>
            <input
              className="settings-select"
              type="number"
              min={50}
              max={1000}
              value={settings.requestLogMaxEntries}
              onChange={(e) => onUpdate({ requestLogMaxEntries: Math.max(50, Math.min(1000, Number(e.target.value))) })}
              style={{ width: 80, textAlign: 'center' }}
            />
          </div>

          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">Version</span>
              <span className="settings-item-desc">v{appVersion || '...'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isPro && tierState?.founderTier != null && (
                <FounderBadge founderTier={tierState.founderTier} />
              )}
              {isPro && tierState?.founderTier == null && (
                <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>Pro</span>
              )}
              {!isPro && onActivatePro && (
                <button className="btn btn-sm btn-primary" onClick={onActivatePro}>
                  Activate Pro
                </button>
              )}
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

          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">
                Beta channel
                {!isPro && (
                  <span className="pro-tag" style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                    Pro = early access workflow
                  </span>
                )}
              </span>
              <span className="settings-item-desc">
                {isPro
                  ? '下次「Check for updates」時偵測 beta 版本'
                  : '提前取得新功能的 Pro early-access 模式'}
              </span>
            </div>
            <label
              className="settings-toggle"
              style={!isPro ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              onClick={!isPro ? onUpgrade : undefined}
            >
              <input
                type="checkbox"
                checked={isPro && (settings.betaChannel ?? false)}
                disabled={!isPro}
                onChange={(e) => isPro && onUpdate({ betaChannel: e.target.checked })}
              />
              <span className="settings-toggle-track" />
            </label>
          </div>

          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">
                {DAEMON_COPY.launchAtStartupLabel}
                {!isPro && (
                  <span className="pro-tag" style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                    Pro = 24/7 share mode
                  </span>
                )}
              </span>
              <span className="settings-item-desc">{DAEMON_COPY.launchAtStartupDesc}</span>
            </div>
            <label
              className="settings-toggle"
              style={!isPro ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              onClick={!isPro ? onUpgrade : undefined}
            >
              <input
                type="checkbox"
                checked={isPro && (settings.launchAtStartup ?? false)}
                disabled={!isPro}
                onChange={(e) => isPro && onUpdate({ launchAtStartup: e.target.checked })}
              />
              <span className="settings-toggle-track" />
            </label>
          </div>

          {/* Provider Sections */}
          <div className="settings-section-divider">Providers</div>

          <ProviderTabs tabs={[
            {
              key: 'cloudflare',
              label: 'Cloudflare',
              content: (
                <>
                  <ProviderStatus
                    env={resolvedProviders.cloudflare.env}
                    onInstall={resolvedProviders.cloudflare.install}
                    label="cloudflared"
                  />
                  {cfAccountsState && onAddCfAccount && onRemoveCfAccount && onSetActiveCfAccount && onSetCfAccountLabel ? (
                    <CloudflareAccountsSection
                      state={cfAccountsState}
                      isPro={isPro}
                      onAdd={onAddCfAccount}
                      onRemove={onRemoveCfAccount}
                      onSetActive={onSetActiveCfAccount}
                      onSetLabel={onSetCfAccountLabel}
                    />
                  ) : (
                    <CloudflareAuthSection
                      auth={resolvedAuth}
                      hasRunningNamedTunnels={hasRunningNamedTunnels}
                      onLogin={onLogin ?? noop}
                      onLogout={onLogout ?? noop}
                    />
                  )}
                </>
              )
            },
            {
              key: 'frp',
              label: 'frp',
              content: (
                <>
                  <ProviderStatus
                    env={resolvedProviders.frp.env}
                    onInstall={resolvedProviders.frp.install}
                    label="frpc"
                  />
                  <ProviderConfigForm
                    fields={providerDefs.frp.configFields!}
                    config={resolvedProviders.frp.config as Record<string, unknown> | null}
                    onSave={resolvedProviders.frp.saveConfig as (c: Record<string, unknown>) => Promise<unknown>}
                    resetKey={open ? 1 : 0}
                  />
                </>
              )
            },
            {
              key: 'bore',
              label: 'bore',
              content: (
                <>
                  <ProviderStatus
                    env={resolvedProviders.bore.env}
                    onInstall={resolvedProviders.bore.install}
                    label="bore"
                  />
                  <ProviderConfigForm
                    fields={providerDefs.bore.configFields!}
                    config={resolvedProviders.bore.config as Record<string, unknown> | null}
                    onSave={resolvedProviders.bore.saveConfig as (c: Record<string, unknown>) => Promise<unknown>}
                    resetKey={open ? 1 : 0}
                  />
                </>
              )
            }
          ]} />
        </div>
      </aside>
    </>
  )
}

export default SettingsPanel
