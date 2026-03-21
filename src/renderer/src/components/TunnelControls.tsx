import { useState, useCallback } from 'react'
import type { SiteInfo, AuthStatus } from '../../../shared/types'

interface TunnelControlsProps {
  site: SiteInfo
  cloudflaredAvailable: boolean
  authStatus: AuthStatus
  onShare: (siteId: string) => Promise<void>
  onStopSharing: (siteId: string) => Promise<void>
  onBindFixedDomain: (siteId: string, domain: string) => Promise<void>
  onUnbindFixedDomain: (siteId: string) => Promise<void>
  onStartNamedTunnel: (siteId: string) => Promise<void>
  onStopNamedTunnel: (siteId: string) => Promise<void>
  onLogin: () => void
}

function TunnelControls({
  site,
  cloudflaredAvailable,
  authStatus,
  onShare,
  onStopSharing,
  onBindFixedDomain,
  onUnbindFixedDomain,
  onStartNamedTunnel,
  onStopNamedTunnel,
  onLogin
}: TunnelControlsProps): React.ReactElement {
  const [showDomainModal, setShowDomainModal] = useState(false)
  const [domainInput, setDomainInput] = useState('')
  const [domainError, setDomainError] = useState<string | null>(null)
  const [binding, setBinding] = useState(false)
  const [showUnbindConfirm, setShowUnbindConfirm] = useState(false)

  const handleBindDomain = useCallback(async () => {
    const trimmed = domainInput.trim()
    if (!trimmed) {
      setDomainError('請輸入網域名稱')
      return
    }
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}$/.test(trimmed)) {
      setDomainError('請輸入有效的網域名稱，例如 dev.example.com')
      return
    }
    setDomainError(null)
    setBinding(true)
    try {
      await onBindFixedDomain(site.id, trimmed)
      setShowDomainModal(false)
      setDomainInput('')
    } catch (err) {
      setDomainError(err instanceof Error ? err.message : '綁定失敗')
    } finally {
      setBinding(false)
    }
  }, [domainInput, site.id, onBindFixedDomain])

  // Unavailable — site not running or cloudflared missing
  if (site.status !== 'running' || !cloudflaredAvailable) {
    const hint = !cloudflaredAvailable
      ? '需安裝 cloudflared'
      : '啟動站點後可使用公開分享'
    return (
      <div className="sharing-row sharing-row--disabled">
        <span className="sharing-badge sharing-badge--wan">WAN</span>
        <span className="sharing-hint">{hint}</span>
      </div>
    )
  }

  const tunnel = site.tunnel
  const isNamed = tunnel?.type === 'named'
  const isLoggedIn = authStatus === 'logged_in'

  // No tunnel active — show share buttons
  if (!tunnel) {
    return (
      <div className="sharing-row">
        <span className="sharing-badge sharing-badge--wan">WAN</span>
        <button
          className="btn btn-sm btn-sharing-action"
          onClick={() => onShare(site.id)}
        >
          公開分享
        </button>
        {isLoggedIn ? (
          <button
            className="btn btn-sm btn-sharing-action"
            onClick={() => setShowDomainModal(true)}
          >
            公開（固定網域）
          </button>
        ) : (
          <button
            className="btn btn-sm btn-sharing-action--disabled"
            onClick={onLogin}
            title="需要先登入 Cloudflare"
          >
            公開（固定網域）
          </button>
        )}

        {/* Domain binding modal */}
        {showDomainModal && (
          <div className="modal-overlay" onClick={() => setShowDomainModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2 className="modal-title">公開（固定網域）</h2>
              {domainError && <div className="modal-error">{domainError}</div>}
              <div className="form-group">
                <label className="form-label">
                  網域
                  <span
                    className="form-hint"
                    data-tooltip="網域需由 Cloudflare 託管 DNS。若尚未設定，請先至 Cloudflare 新增網域。"
                  >
                    ⓘ
                  </span>
                </label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="dev.example.com"
                  value={domainInput}
                  onChange={(e) => {
                    setDomainInput(e.target.value)
                    setDomainError(null)
                  }}
                  autoFocus
                />
              </div>
              <div className="modal-actions">
                <button className="btn" onClick={() => setShowDomainModal(false)}>
                  取消
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleBindDomain}
                  disabled={binding}
                >
                  {binding ? '建立中...' : '建立並綁定'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="sharing-row">
      <span className="sharing-badge sharing-badge--wan">WAN</span>

      {tunnel.status === 'starting' && (
        <span className="sharing-status-text sharing-status-text--starting">
          <span className="cloudflared-spinner" />
          {isNamed ? '固定網域啟動中...' : '啟動中...'}
        </span>
      )}

      {tunnel.status === 'running' && (
        <>
          {isNamed ? (
            <div className="sharing-actions-group">
              <button
                className="btn btn-sm btn-sharing-stop"
                onClick={() => onStopNamedTunnel(site.id)}
              >
                停止公開
              </button>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => setShowUnbindConfirm(true)}
              >
                解除綁定
              </button>
            </div>
          ) : (
            <button
              className="btn btn-sm btn-sharing-stop"
              onClick={() => onStopSharing(site.id)}
            >
              停止公開
            </button>
          )}
        </>
      )}

      {tunnel.status === 'reconnecting' && (
        <>
          <span className="sharing-status-text sharing-status-text--reconnecting">
            <span className="cloudflared-spinner" />
            Tunnel 重連中...
          </span>
          <button
            className="btn btn-sm btn-sharing-stop"
            onClick={() => isNamed ? onStopNamedTunnel(site.id) : onStopSharing(site.id)}
            disabled
          >
            停止公開
          </button>
        </>
      )}

      {tunnel.status === 'error' && (
        <TunnelErrorRow
          tunnel={tunnel}
          isNamed={isNamed}
          siteId={site.id}
          onLogin={onLogin}
          onStartNamedTunnel={onStartNamedTunnel}
          onShare={onShare}
        />
      )}

      {tunnel.status === 'stopped' && (
        <>
          {isNamed ? (
            <div className="sharing-actions-group">
              <button
                className="btn btn-sm btn-sharing-action"
                onClick={() => onStartNamedTunnel(site.id)}
              >
                啟動
              </button>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => setShowUnbindConfirm(true)}
              >
                解除綁定
              </button>
            </div>
          ) : (
            <button
              className="btn btn-sm btn-sharing-action"
              onClick={() => onShare(site.id)}
            >
              公開分享
            </button>
          )}
        </>
      )}

      {/* Unbind Confirmation Modal */}
      {showUnbindConfirm && (
        <div className="modal-overlay" onClick={() => setShowUnbindConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">確認解除綁定</h2>
            <p className="confirm-text">
              確定要解除網域綁定嗎？Tunnel 和 DNS 路由將一併刪除。
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowUnbindConfirm(false)}>
                取消
              </button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  setShowUnbindConfirm(false)
                  await onUnbindFixedDomain(site.id)
                }}
              >
                確認解除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TunnelErrorRow({
  tunnel,
  isNamed,
  siteId,
  onLogin,
  onStartNamedTunnel,
  onShare
}: {
  tunnel: { errorMessage?: string }
  isNamed: boolean
  siteId: string
  onLogin: () => void
  onStartNamedTunnel: (id: string) => Promise<void>
  onShare: (id: string) => Promise<void>
}): React.ReactElement {
  const msg = typeof tunnel.errorMessage === 'string' ? tunnel.errorMessage : ''
  const isAuthExpired = msg.includes('認證已過期') || msg.includes('過期')
  const isQuotaExceeded = msg.includes('數量上限') || msg.includes('配額')
  const isDisconnected = msg.includes('已斷線')

  return (
    <div className="sharing-error-row">
      <span className="sharing-status-text sharing-status-text--error">
        {msg || 'Tunnel 發生錯誤'}
      </span>
      {isAuthExpired ? (
        <button className="btn btn-sm btn-auth-login" onClick={onLogin}>
          重新登入
        </button>
      ) : isQuotaExceeded ? null : (
        <button
          className="btn btn-sm btn-sharing-action"
          onClick={() => isNamed ? onStartNamedTunnel(siteId) : onShare(siteId)}
        >
          {isDisconnected ? '重新啟動' : '重試'}
        </button>
      )}
    </div>
  )
}

export default TunnelControls
