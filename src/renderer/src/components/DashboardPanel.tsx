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
      <h3 className="dashboard-title">Dashboard</h3>
      {!dashboardSiteId ? (
        <button
          className="btn btn-sm"
          onClick={handleGenerate}
          disabled={generating || tunnelSiteCount === 0}
          title={tunnelSiteCount === 0 ? 'At least one site must be sharing via tunnel' : ''}
        >
          {generating ? 'Generating...' : `Generate Dashboard (${tunnelSiteCount} sites)`}
        </button>
      ) : (
        <div className="dashboard-controls">
          <p className="dashboard-hint">Dashboard site created. Start a tunnel on it to share.</p>
          <div className="dashboard-actions">
            <button className="btn btn-sm" onClick={handleGenerate}>Regenerate</button>
            <button className="btn btn-sm btn-danger" onClick={handleRemove}>Remove</button>
          </div>
          {dashboardPublicUrl && allTags.length > 0 && (
            <div className="dashboard-group-urls">
              <p className="dashboard-group-label">Group filter URLs:</p>
              {allTags.map((tag) => (
                <div key={tag} className="dashboard-group-url-row">
                  <span className="tag-chip">{tag}</span>
                  <CopyButton
                    text={`${dashboardPublicUrl}?group=${encodeURIComponent(tag)}`}
                    tooltip={`Copy filtered URL for "${tag}"`}
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
