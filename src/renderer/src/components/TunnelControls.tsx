import { useState, useCallback } from 'react'
import type { SiteInfo, AuthStatus } from '../../../shared/types'
import CopyButton from './CopyButton'
import QrButton from './QrButton'

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
  const [unbinding, setUnbinding] = useState(false)

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

  const tunnel = site.tunnel
  const isNamed = tunnel?.type === 'named'
  const isLoggedIn = authStatus === 'logged_in'
  const isRunning = site.status === 'running'
  const isDisabled = !isRunning || !cloudflaredAvailable

  // WAN URL display — only when tunnel is running with a URL
  const wanUrl = tunnel?.status === 'running' && tunnel.publicUrl ? tunnel.publicUrl : null

  return (
    <>
      <div className={`site-item-url-row${isDisabled ? ' site-item-url-row--disabled' : ''}`}>
        <span className="sharing-badge sharing-badge--wan">WAN</span>

        {/* URL or status text */}
        {wanUrl ? (
          <a
            className="site-item-url"
            href={wanUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={wanUrl}
          >
            {wanUrl}
          </a>
        ) : (
          <span className="site-item-url site-item-url--placeholder">
            {tunnel?.status === 'starting'
              ? (isNamed ? '固定網域啟動中...' : '啟動中...')
              : tunnel?.status === 'reconnecting'
                ? 'Tunnel 重連中...'
                : tunnel?.status === 'error'
                  ? (tunnel.errorMessage || 'Tunnel 發生錯誤')
                  : !cloudflaredAvailable
                    ? '需安裝 cloudflared'
                    : !isRunning
                      ? '啟動站點後可使用'
                      : '尚未公開'}
          </span>
        )}

        {/* Spinner for starting/reconnecting */}
        {(tunnel?.status === 'starting' || tunnel?.status === 'reconnecting') && (
          <span className="cloudflared-spinner" />
        )}

        {/* Copy + QR — enabled only when WAN URL exists */}
        <CopyButton text={wanUrl || ''} tooltip="複製公開網址" disabled={!wanUrl} />
        <QrButton url={wanUrl || ''} disabled={!wanUrl} title="WAN QR Code" />

        {/* Action buttons */}
        <WanActions
          site={site}
          tunnel={tunnel}
          isNamed={isNamed}
          isLoggedIn={isLoggedIn}
          isDisabled={isDisabled}
          cloudflaredAvailable={cloudflaredAvailable}
          onShare={onShare}
          onStopSharing={onStopSharing}
          onStopNamedTunnel={onStopNamedTunnel}
          onStartNamedTunnel={onStartNamedTunnel}
          onLogin={onLogin}
          onShowDomainModal={() => setShowDomainModal(true)}
          onShowUnbindConfirm={() => setShowUnbindConfirm(true)}
        />
      </div>

      {/* Domain binding modal */}
      {showDomainModal && (
        <div className="modal-overlay" data-dismiss onClick={() => setShowDomainModal(false)}>
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

      {/* Unbind Confirmation Modal */}
      {showUnbindConfirm && (
        <div className="modal-overlay" data-dismiss={!unbinding ? true : undefined} onClick={() => { if (!unbinding) setShowUnbindConfirm(false) }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">確認解除綁定</h2>
            <p className="confirm-text">
              {unbinding
                ? '正在解除綁定，請稍候...'
                : '確定要解除網域綁定嗎？Tunnel 和 DNS 路由將一併刪除。'}
            </p>
            {unbinding && (
              <div className="modal-loading">
                <span className="cloudflared-spinner" />
              </div>
            )}
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowUnbindConfirm(false)} disabled={unbinding}>
                取消
              </button>
              <button
                className="btn btn-danger"
                disabled={unbinding}
                onClick={async () => {
                  setUnbinding(true)
                  try {
                    await onUnbindFixedDomain(site.id)
                  } finally {
                    setUnbinding(false)
                    setShowUnbindConfirm(false)
                  }
                }}
              >
                {unbinding ? '解除中...' : '確認解除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** WAN action buttons — always visible, disabled when not applicable */
function WanActions({
  site,
  tunnel,
  isNamed,
  isLoggedIn,
  isDisabled,
  cloudflaredAvailable,
  onShare,
  onStopSharing,
  onStopNamedTunnel,
  onStartNamedTunnel,
  onLogin,
  onShowDomainModal,
  onShowUnbindConfirm
}: {
  site: SiteInfo
  tunnel: SiteInfo['tunnel']
  isNamed: boolean
  isLoggedIn: boolean
  isDisabled: boolean
  cloudflaredAvailable: boolean
  onShare: (id: string) => Promise<void>
  onStopSharing: (id: string) => Promise<void>
  onStopNamedTunnel: (id: string) => Promise<void>
  onStartNamedTunnel: (id: string) => Promise<void>
  onLogin: () => void
  onShowDomainModal: () => void
  onShowUnbindConfirm: () => void
}): React.ReactElement {
  // Named tunnel has its own action set
  if (isNamed) {
    const running = tunnel?.status === 'running'
    const stopped = tunnel?.status === 'stopped'
    const canStop = running || tunnel?.status === 'reconnecting'
    const canResume = stopped || tunnel?.status === 'error'

    return (
      <div className="wan-actions">
        <button
          className="btn btn-xs"
          onClick={() => canStop ? onStopNamedTunnel(site.id) : onStartNamedTunnel(site.id)}
          disabled={!canStop && !canResume}
        >
          {canStop ? '暫停公開' : '恢復公開'}
        </button>
        <button
          className="btn btn-xs btn-danger"
          onClick={onShowUnbindConfirm}
        >
          解除綁定
        </button>
      </div>
    )
  }

  // Quick tunnel or no tunnel
  const tunnelRunning = tunnel?.status === 'running'
  const tunnelReconnecting = tunnel?.status === 'reconnecting'
  const canStop = tunnelRunning || tunnelReconnecting
  const tunnelError = tunnel?.status === 'error'
  const isAuthError = tunnel?.errorMessage?.includes('認證已過期') || tunnel?.errorMessage?.includes('過期')

  return (
    <div className="wan-actions">
      {canStop ? (
        <button
          className="btn btn-xs"
          onClick={() => onStopSharing(site.id)}
          disabled={tunnelReconnecting}
        >
          停止公開
        </button>
      ) : (
        <>
          <button
            className="btn btn-xs btn-sharing-action"
            onClick={() => tunnelError && isAuthError ? onLogin() : onShare(site.id)}
            disabled={isDisabled}
          >
            公開分享
          </button>
          {cloudflaredAvailable && (
            <button
              className="btn btn-xs"
              onClick={() => isLoggedIn ? onShowDomainModal() : onLogin()}
              disabled={isDisabled}
              title={!isLoggedIn ? '需要先登入 Cloudflare' : undefined}
            >
              固定網域
            </button>
          )}
        </>
      )}
    </div>
  )
}

export default TunnelControls
