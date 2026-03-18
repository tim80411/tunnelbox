import { useState, useCallback } from 'react'
import type { SiteInfo } from '../../../shared/types'

interface TunnelControlsProps {
  site: SiteInfo
  cloudflaredAvailable: boolean
  onShare: (siteId: string) => Promise<void>
  onStopSharing: (siteId: string) => Promise<void>
}

function TunnelControls({ site, cloudflaredAvailable, onShare, onStopSharing }: TunnelControlsProps): React.ReactElement | null {
  const [copied, setCopied] = useState(false)

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

  // No tunnel active — show share button
  if (!tunnel) {
    return (
      <div className="tunnel-controls">
        <button
          className="btn btn-sm btn-tunnel-share"
          onClick={() => onShare(site.id)}
        >
          公開分享
        </button>
      </div>
    )
  }

  return (
    <div className="tunnel-controls">
      {tunnel.status === 'starting' && (
        <span className="tunnel-status-text tunnel-starting">
          <span className="cloudflared-spinner" />
          啟動中...
        </span>
      )}

      {tunnel.status === 'running' && (
        <>
          <div className="tunnel-url-row">
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
          <button
            className="btn btn-sm btn-tunnel-stop"
            onClick={() => onStopSharing(site.id)}
          >
            停止公開
          </button>
        </>
      )}

      {tunnel.status === 'reconnecting' && (
        <>
          {tunnel.publicUrl && (
            <div className="tunnel-url-row">
              <span className="tunnel-url tunnel-url-dimmed">{tunnel.publicUrl}</span>
            </div>
          )}
          <span className="tunnel-status-text tunnel-reconnecting">
            <span className="cloudflared-spinner" />
            Tunnel 重連中...
          </span>
          <button
            className="btn btn-sm btn-tunnel-stop"
            onClick={() => onStopSharing(site.id)}
            disabled
          >
            停止公開
          </button>
        </>
      )}

      {tunnel.status === 'error' && (
        <div className="tunnel-error-row">
          <span className="tunnel-status-text tunnel-error-text">
            {tunnel.errorMessage || 'Tunnel 發生錯誤'}
          </span>
          <button
            className="btn btn-sm btn-tunnel-share"
            onClick={() => onShare(site.id)}
          >
            {tunnel.errorMessage?.includes('已斷線') ? '重新啟動' : '重試'}
          </button>
        </div>
      )}

      {tunnel.status === 'stopped' && (
        <button
          className="btn btn-sm btn-tunnel-share"
          onClick={() => onShare(site.id)}
        >
          公開分享
        </button>
      )}
    </div>
  )
}

export default TunnelControls
