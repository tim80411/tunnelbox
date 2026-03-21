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
  onStartFrpTunnel?: (siteId: string) => Promise<void>
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
  onLogin,
  onStartFrpTunnel
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
  const isFrp = site.providerType === 'frp'
  const isAvailable = isRunning && (isFrp || cloudflaredAvailable)

  // Status light color
  const lightColor = tunnel?.status === 'running'
    ? 'green'
    : tunnel?.status === 'error'
      ? 'red'
      : (tunnel?.status === 'stopped' && isNamed)
        ? 'orange'
        : (tunnel?.status === 'starting' || tunnel?.status === 'reconnecting')
          ? 'orange'
          : 'gray'

  // WAN URL
  const wanUrl = tunnel?.status === 'running' && tunnel.publicUrl ? tunnel.publicUrl : null

  // Play button: start quick tunnel, named tunnel, or frp tunnel
  const canPlay = isAvailable && (!tunnel || tunnel.status === 'stopped' || tunnel.status === 'error')
  const handlePlay = () => {
    if (!canPlay) return
    if (isFrp) {
      onStartFrpTunnel?.(site.id)
    } else if (isNamed) {
      onStartNamedTunnel(site.id)
    } else {
      const isAuthError = tunnel?.errorMessage?.includes('認證已過期') || tunnel?.errorMessage?.includes('過期')
      if (tunnel?.status === 'error' && isAuthError) {
        onLogin()
      } else {
        onShare(site.id)
      }
    }
  }

  // Stop button
  const canStop = tunnel?.status === 'running' || tunnel?.status === 'reconnecting'
  const handleStop = () => {
    if (!canStop) return
    if (isNamed) {
      onStopNamedTunnel(site.id)
    } else {
      onStopSharing(site.id)
    }
  }

  // Provider badge label
  const providerBadge = isFrp ? 'frp' : 'CF'

  // Placeholder text
  const placeholderText = tunnel?.status === 'starting'
    ? (isNamed ? '固定網域啟動中...' : '啟動中...')
    : tunnel?.status === 'reconnecting'
      ? 'Tunnel 重連中...'
      : tunnel?.status === 'error'
        ? (tunnel.errorMessage || 'Tunnel 發生錯誤')
        : isFrp
          ? (!isRunning ? '啟動站點後可使用' : '尚未公開')
          : !cloudflaredAvailable
            ? '需安裝 cloudflared'
            : !isRunning
              ? '啟動站點後可使用'
              : '尚未公開'

  // Info tooltip
  const infoTooltip = isFrp
    ? (tunnel?.status === 'running' ? '類型：frp Tunnel（TCP 轉發）' : 'frp Tunnel 公開分享')
    : isNamed
      ? `類型：固定網域｜Tunnel ID：${tunnel?.tunnelId?.slice(0, 8) || '—'}...`
      : tunnel?.status === 'running'
        ? '類型：Quick Tunnel（隨機網址）'
        : 'Cloudflare Tunnel 公開分享'

  return (
    <>
      <div className="site-item-url-row">
        <span className={`status-light status-light--${lightColor}`} />
        <span className="sharing-badge sharing-badge--wan">WAN</span>
        <span className={`provider-badge provider-badge--${isFrp ? 'frp' : 'cf'}`}>{providerBadge}</span>

        {wanUrl ? (
          <a className="site-item-url" href={wanUrl} target="_blank" rel="noopener noreferrer" title={wanUrl}>
            {wanUrl}
          </a>
        ) : (
          <span className="site-item-url site-item-url--placeholder">
            {placeholderText}
          </span>
        )}

        {(tunnel?.status === 'starting' || tunnel?.status === 'reconnecting') && (
          <span className="cloudflared-spinner" />
        )}

        {/* Info */}
        <span className="btn-icon btn-icon--info" data-tooltip={infoTooltip}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        </span>

        {/* Play / Stop */}
        <button
          className="btn-icon"
          onClick={handlePlay}
          disabled={!canPlay}
          data-tooltip={isNamed && tunnel?.status === 'stopped' ? '恢復公開' : '公開分享'}
        >
          <svg width="10" height="10" viewBox="0 0 10 10"><polygon points="2,1 2,9 9,5" fill="currentColor"/></svg>
        </button>
        <button
          className="btn-icon"
          onClick={handleStop}
          disabled={!canStop}
          data-tooltip={isNamed ? '暫停公開' : '停止公開'}
        >
          <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" fill="currentColor"/></svg>
        </button>

        {/* Copy / QR / Refresh */}
        <CopyButton text={wanUrl || ''} tooltip="複製公開網址" disabled={!wanUrl} />
        <QrButton url={wanUrl || ''} disabled={!wanUrl} title="WAN QR Code" />
        <button className="btn-icon" disabled data-tooltip="重新偵測">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21.5 2v6h-6"/><path d="M2.5 22v-6h6"/><path d="M2.5 11.5a10 10 0 0 1 18.4-4.5"/><path d="M21.5 12.5a10 10 0 0 1-18.4 4.5"/></svg>
        </button>

        {/* Fixed domain button — only for Cloudflare when available and no active tunnel */}
        {!isFrp && isAvailable && !tunnel && cloudflaredAvailable && (
          <button
            className="btn btn-xs"
            onClick={() => isLoggedIn ? setShowDomainModal(true) : onLogin()}
            title={!isLoggedIn ? '需要先登入 Cloudflare' : undefined}
          >
            固定網域
          </button>
        )}

        {/* Unbind button — only for named tunnels */}
        {isNamed && (
          <button
            className="btn btn-xs btn-danger"
            onClick={() => setShowUnbindConfirm(true)}
          >
            解除綁定
          </button>
        )}
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

export default TunnelControls
