import type { ProviderEnv } from '../../../shared/provider-types'

interface ProviderInstallBarEntry {
  type: string
  label: string
  env: ProviderEnv
  onInstall: () => Promise<void>
  hasRelevantSites: boolean
  priority: number
}

interface ProviderInstallBarProps {
  providers: ProviderInstallBarEntry[]
}

function ProviderInstallBar({ providers }: ProviderInstallBarProps): React.ReactElement | null {
  // 1. Filter: env.status not 'available'
  // 2. Filter: hasRelevantSites === true
  // 3. Sort by priority ascending
  // 4. Take first item only
  const candidate = providers
    .filter((p) => p.env.status !== 'available' && p.env.status !== 'checking' && p.hasRelevantSites)
    .sort((a, b) => a.priority - b.priority)[0]

  if (!candidate) return null

  const { label, env, onInstall } = candidate

  return (
    <div className={`provider-bar provider-bar--${env.status}`}>
      {env.status === 'not_installed' && (
        <span className="provider-bar-text">
          {label} 尚未安裝
          <button className="btn btn-sm btn-primary provider-bar-btn" onClick={onInstall}>
            安裝
          </button>
        </span>
      )}

      {env.status === 'installing' && (
        <span className="provider-bar-text">
          <span className="cloudflared-spinner" />
          安裝 {label} 中...
        </span>
      )}

      {env.status === 'install_failed' && (
        <span className="provider-bar-text">
          {label} 安裝失敗{env.errorMessage ? `：${env.errorMessage}` : ''}
          <button className="btn btn-sm provider-bar-btn" onClick={onInstall}>
            重試
          </button>
        </span>
      )}

      {env.status === 'outdated' && (
        <span className="provider-bar-text">
          {label} 版本過舊{env.version ? ` (${env.version})` : ''}
          <button className="btn btn-sm btn-primary provider-bar-btn" onClick={onInstall}>
            更新
          </button>
        </span>
      )}

      {env.status === 'error' && (
        <span className="provider-bar-text">
          {label} 環境錯誤{env.errorMessage ? `：${env.errorMessage}` : ''}
        </span>
      )}
    </div>
  )
}

export default ProviderInstallBar
