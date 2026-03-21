import { useState, useCallback } from 'react'
import type { SiteInfo } from '../../../shared/types'

interface LanSharingControlsProps {
  site: SiteInfo
  onEnable: (siteId: string) => Promise<void>
  onDisable: (siteId: string) => Promise<void>
}

function LanSharingControls({
  site,
  onEnable,
  onDisable
}: LanSharingControlsProps): React.ReactElement | null {
  const [copied, setCopied] = useState(false)
  const [toggling, setToggling] = useState(false)

  const handleCopy = useCallback(async () => {
    if (!site.lanUrl) return
    await navigator.clipboard.writeText(site.lanUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [site.lanUrl])

  const handleToggle = useCallback(async () => {
    setToggling(true)
    try {
      if (site.lanUrl) {
        await onDisable(site.id)
      } else {
        await onEnable(site.id)
      }
    } finally {
      setToggling(false)
    }
  }, [site.id, site.lanUrl, onEnable, onDisable])

  // Only show when site is running
  if (site.status !== 'running') {
    return (
      <div className="sharing-row sharing-row--disabled">
        <span className="sharing-badge sharing-badge--lan">LAN</span>
        <span className="sharing-hint">啟動站點後可使用區網分享</span>
      </div>
    )
  }

  // LAN sharing is active — show URL
  if (site.lanUrl) {
    return (
      <div className="sharing-row">
        <span className="sharing-badge sharing-badge--lan">LAN</span>
        <div className="sharing-url-row">
          <a
            className="sharing-url"
            href={site.lanUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {site.lanUrl}
          </a>
          {site.lanInterfaceName && (
            <span className="sharing-iface">({site.lanInterfaceName})</span>
          )}
          <button
            className="btn-copy"
            onClick={handleCopy}
            title="複製區網網址"
          >
            {copied ? '已複製' : '📋'}
          </button>
        </div>
        <button
          className="btn btn-sm btn-sharing-stop--neutral"
          onClick={handleToggle}
          disabled={toggling}
        >
          關閉區網
        </button>
      </div>
    )
  }

  // LAN sharing is not active — show enable button
  return (
    <div className="sharing-row">
      <span className="sharing-badge sharing-badge--lan">LAN</span>
      <button
        className="btn btn-sm btn-sharing-action--lan"
        onClick={handleToggle}
        disabled={toggling}
      >
        {toggling ? '開啟中...' : '區網分享'}
      </button>
    </div>
  )
}

export default LanSharingControls
