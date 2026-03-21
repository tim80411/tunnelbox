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
      <div className="lan-sharing-controls lan-sharing-disabled">
        <span className="lan-sharing-label">LAN</span>
        <span className="lan-sharing-hint">啟動站點後可使用區網分享</span>
      </div>
    )
  }

  // LAN sharing is active — show URL
  if (site.lanUrl) {
    return (
      <div className="lan-sharing-controls">
        <span className="lan-sharing-label">LAN</span>
        <div className="lan-sharing-url-row">
          <span className="lan-sharing-url">{site.lanUrl}</span>
          {site.lanInterfaceName && (
            <span className="lan-sharing-iface">({site.lanInterfaceName})</span>
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
          className="btn btn-sm btn-lan-stop"
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
    <div className="lan-sharing-controls">
      <span className="lan-sharing-label">LAN</span>
      <button
        className="btn btn-sm btn-lan-share"
        onClick={handleToggle}
        disabled={toggling}
      >
        {toggling ? '開啟中...' : '區網分享'}
      </button>
    </div>
  )
}

export default LanSharingControls
