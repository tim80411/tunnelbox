import { useState, useCallback } from 'react'
import type { SiteInfo, AuthStatus } from '../../../shared/types'

interface TunnelControlsProps {
  site: SiteInfo
  cloudflaredAvailable: boolean
  authStatus: AuthStatus
  onShare: (siteId: string) => Promise<void>
  onStopSharing: (siteId: string) => Promise<void>
  onCreateNamedTunnel: (siteId: string) => Promise<void>
  onStartNamedTunnel: (siteId: string) => Promise<void>
  onStopNamedTunnel: (siteId: string) => Promise<void>
  onDeleteNamedTunnel: (siteId: string) => Promise<void>
  onLogin: () => void
}

function TunnelControls({
  site,
  cloudflaredAvailable,
  authStatus,
  onShare,
  onStopSharing,
  onCreateNamedTunnel,
  onStartNamedTunnel,
  onStopNamedTunnel,
  onDeleteNamedTunnel,
  onLogin
}: TunnelControlsProps): React.ReactElement | null {
  const [copied, setCopied] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleCopyUrl = useCallback(async (url: string) => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  // Don't show tunnel controls if site is not running or cloudflared not available
  if (site.status !== 'running' || !cloudflaredAvailable) {
    return null
  }

  const tunnel = site.tunnel
  const isNamed = tunnel?.type === 'named'
  const isLoggedIn = authStatus === 'logged_in'
  const hasDomain = !!site.domain

  // No tunnel active — show share buttons
  if (!tunnel) {
    return (
      <div className="tunnel-controls">
        <button
          className="btn btn-sm btn-tunnel-share"
          onClick={() => onShare(site.id)}
        >
          公開分享
        </button>
        {isLoggedIn ? (
          <button
            className="btn btn-sm btn-tunnel-named"
            onClick={() => onCreateNamedTunnel(site.id)}
          >
            建立持久 Tunnel
          </button>
        ) : (
          <button
            className="btn btn-sm btn-tunnel-named-disabled"
            onClick={onLogin}
            title="需要先登入 Cloudflare"
          >
            建立持久 Tunnel
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="tunnel-controls">
      {tunnel.status === 'starting' && (
        <span className="tunnel-status-text tunnel-starting">
          <span className="cloudflared-spinner" />
          {isNamed ? '持久 Tunnel 啟動中...' : '啟動中...'}
        </span>
      )}

      {tunnel.status === 'running' && (
        <>
          <div className="tunnel-url-row">
            {isNamed && <span className="tunnel-badge tunnel-badge-named">持久</span>}
            <a
              className="tunnel-url"
              href={tunnel.publicUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {tunnel.publicUrl}
            </a>
            <button
              className="btn-copy"
              onClick={() => handleCopyUrl(tunnel.publicUrl)}
              title="複製公開網址"
            >
              {copied ? '已複製' : '📋'}
            </button>
          </div>
          {isNamed ? (
            <div className="tunnel-named-actions">
              <button
                className="btn btn-sm btn-tunnel-stop"
                onClick={() => onStopNamedTunnel(site.id)}
              >
                停止 Tunnel
              </button>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => setShowDeleteConfirm(true)}
              >
                刪除 Tunnel
              </button>
            </div>
          ) : (
            <button
              className="btn btn-sm btn-tunnel-stop"
              onClick={() => onStopSharing(site.id)}
            >
              停止公開
            </button>
          )}
        </>
      )}

      {tunnel.status === 'reconnecting' && (
        <>
          {tunnel.publicUrl && (
            <div className="tunnel-url-row">
              {isNamed && <span className="tunnel-badge tunnel-badge-named">持久</span>}
              <span className="tunnel-url tunnel-url-dimmed">{tunnel.publicUrl}</span>
            </div>
          )}
          <span className="tunnel-status-text tunnel-reconnecting">
            <span className="cloudflared-spinner" />
            Tunnel 重連中...
          </span>
          <button
            className="btn btn-sm btn-tunnel-stop"
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
            <div className="tunnel-controls">
              {tunnel.publicUrl && (
                <div className="tunnel-url-row">
                  <span className="tunnel-badge tunnel-badge-named tunnel-badge-stopped">持久(已停止)</span>
                  <span className="tunnel-url tunnel-url-dimmed">{tunnel.publicUrl}</span>
                </div>
              )}
              <div className="tunnel-named-actions">
                <button
                  className="btn btn-sm btn-tunnel-share"
                  onClick={() => onStartNamedTunnel(site.id)}
                >
                  啟動 Tunnel
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  刪除 Tunnel
                </button>
              </div>
            </div>
          ) : (
            <button
              className="btn btn-sm btn-tunnel-share"
              onClick={() => onShare(site.id)}
            >
              公開分享
            </button>
          )}
        </>
      )}

      {/* Delete Named Tunnel Confirmation */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">確認刪除 Tunnel</h2>
            <p className="confirm-text">
              {hasDomain
                ? '刪除 Tunnel 將同時解除自訂網域綁定，是否繼續？'
                : '確定要刪除此 Tunnel？URL 將永久失效。'}
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowDeleteConfirm(false)}>
                取消
              </button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  setShowDeleteConfirm(false)
                  await onDeleteNamedTunnel(site.id)
                }}
              >
                確認刪除
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
    <div className="tunnel-error-row">
      <span className="tunnel-status-text tunnel-error-text">
        {msg || 'Tunnel 發生錯誤'}
      </span>
      {isAuthExpired ? (
        <button className="btn btn-sm btn-auth-login" onClick={onLogin}>
          重新登入
        </button>
      ) : isQuotaExceeded ? null : (
        <button
          className="btn btn-sm btn-tunnel-share"
          onClick={() => isNamed ? onStartNamedTunnel(siteId) : onShare(siteId)}
        >
          {isDisconnected ? '重新啟動' : '重試'}
        </button>
      )}
    </div>
  )
}

export default TunnelControls
