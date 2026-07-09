import { useState, useCallback, useMemo, useEffect } from 'react'
import type { SiteInfo } from '../../../shared/types'
import CopyButton from './CopyButton'

interface DashboardPanelProps {
  sites: SiteInfo[]
}

function DashboardPanel({ sites }: DashboardPanelProps): React.ReactElement {
  const [dashboardSiteId, setDashboardSiteId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  // Collect unique tags from all sites
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    for (const site of sites) {
      for (const tag of site.tags || []) {
        tagSet.add(tag)
      }
    }
    return Array.from(tagSet).sort()
  }, [sites])

  // Find the dashboard site to get its URL/tunnel info
  const dashboardSite = useMemo(
    () => (dashboardSiteId ? sites.find((s) => s.id === dashboardSiteId) : null),
    [sites, dashboardSiteId]
  )

  const dashboardPublicUrl = dashboardSite?.tunnel?.publicUrl

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    try {
      const result = await window.electron.generateDashboard()
      setDashboardSiteId(result?.siteId ?? null)
    } catch { /* non-critical */ }
    finally { setGenerating(false) }
  }, [])

  const handleRemove = useCallback(async () => {
    try {
      await window.electron.removeDashboard()
      setDashboardSiteId(null)
    } catch { /* non-critical */ }
  }, [])

  // Check on mount
  useEffect(() => {
    window.electron.getDashboardSiteId().then(setDashboardSiteId).catch(() => {})
  }, [])

  const tunnelSiteCount = useMemo(
    () => sites.filter((s) => s.tunnel?.status === 'running' && s.tunnel.publicUrl).length,
    [sites]
  )

  return (
    <div className="dashboard-panel">
      <h3 className="dashboard-title">儀表板</h3>
      {!dashboardSiteId ? (
        <button
          className="btn btn-sm"
          onClick={handleGenerate}
          disabled={generating || tunnelSiteCount === 0}
          title={tunnelSiteCount === 0 ? '需要至少一個網站正在透過 Tunnel 分享' : ''}
        >
          {generating ? '產生中…' : `產生儀表板（${tunnelSiteCount} 個網站）`}
        </button>
      ) : (
        <div className="dashboard-controls">
          <p className="dashboard-hint">儀表板網站已建立，啟動 Tunnel 即可分享。</p>
          <div className="dashboard-actions">
            <button className="btn btn-sm" onClick={handleGenerate}>重新產生</button>
            <button className="btn btn-sm btn-danger" onClick={handleRemove}>移除</button>
          </div>
          {dashboardPublicUrl && allTags.length > 0 && (
            <div className="dashboard-group-urls">
              <p className="dashboard-group-label">依標籤篩選的網址：</p>
              {allTags.map((tag) => (
                <div key={tag} className="dashboard-group-url-row">
                  <span className="tag-chip">{tag}</span>
                  <CopyButton
                    text={`${dashboardPublicUrl}?group=${encodeURIComponent(tag)}`}
                    tooltip={`複製「${tag}」的篩選網址`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DashboardPanel
