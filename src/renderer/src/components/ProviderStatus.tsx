import type { ProviderEnv } from '../../../shared/provider-types'

interface ProviderStatusProps {
  env: ProviderEnv
  onInstall: () => Promise<void>
  label: string
}

function ProviderStatus({ env, onInstall, label }: ProviderStatusProps): React.ReactElement {
  return (
    <div className="provider-status">
      {env.status === 'checking' && (
        <span>
          <span className="cloudflared-spinner" />
          偵測中...
        </span>
      )}

      {env.status === 'available' && (
        <span>✓ 已安裝{env.version ? ` (${env.version})` : ''}</span>
      )}

      {env.status === 'not_installed' && (
        <span>
          未安裝
          <button className="btn btn-sm btn-primary" onClick={onInstall} style={{ marginLeft: 8 }}>
            安裝
          </button>
        </span>
      )}

      {env.status === 'installing' && (
        <span>
          <span className="cloudflared-spinner" />
          安裝中...
        </span>
      )}

      {env.status === 'install_failed' && (
        <span>
          安裝失敗{env.errorMessage ? `：${env.errorMessage}` : ''}
          <button className="btn btn-sm" onClick={onInstall} style={{ marginLeft: 8 }}>
            重試
          </button>
        </span>
      )}

      {env.status === 'outdated' && (
        <span>
          版本過舊{env.version ? ` (${env.version})` : ''}
          <button className="btn btn-sm btn-primary" onClick={onInstall} style={{ marginLeft: 8 }}>
            更新
          </button>
        </span>
      )}

      {env.status === 'error' && (
        <span>
          {label} 環境錯誤{env.errorMessage ? `：${env.errorMessage}` : ''}
        </span>
      )}
    </div>
  )
}

export default ProviderStatus
