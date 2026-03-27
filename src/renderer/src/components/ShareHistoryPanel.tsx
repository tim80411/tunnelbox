import { useShareHistory } from '../hooks/useShareHistory'

interface ShareHistoryPanelProps {
  open: boolean
  onClose: () => void
}

function formatTime(isoString: string): string {
  const d = new Date(isoString)
  const pad = (n: number): string => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function ShareHistoryPanel({ open, onClose }: ShareHistoryPanelProps): React.ReactElement | null {
  const { records, loading, error, exportCsv } = useShareHistory()

  if (!open) return null

  return (
    <div className="modal-overlay" data-dismiss onClick={onClose}>
      <div className="modal share-history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="share-history-header">
          <h2 className="modal-title">Share History</h2>
          <div className="share-history-header-actions">
            <button
              className="btn btn-sm"
              onClick={exportCsv}
              disabled={records.length === 0}
              title={records.length === 0 ? 'No records to export' : 'Export to CSV'}
            >
              Export CSV
            </button>
            <button className="btn btn-sm" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {error && (
          <div className="modal-error">{error}</div>
        )}

        {loading ? (
          <div className="share-history-empty">Loading...</div>
        ) : records.length === 0 ? (
          <div className="share-history-empty">
            <p className="empty-title">No share history yet</p>
            <p className="empty-desc">Share records will appear here after you start a tunnel.</p>
          </div>
        ) : (
          <div className="share-history-list">
            {records.map((record) => (
              <div key={record.id} className="share-history-item">
                <div className="share-history-item-header">
                  <span className="share-history-site-name">{record.siteName}</span>
                  <div className="share-history-badges">
                    <span className="share-history-provider-badge">{record.providerType}</span>
                    {record.endedAt === null ? (
                      <span className="share-history-status-badge share-history-status-badge--active">
                        In Progress
                      </span>
                    ) : record.abnormalEnd ? (
                      <span className="share-history-status-badge share-history-status-badge--warning">
                        Abnormal End
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="share-history-item-detail">
                  <span className="share-history-label">Path:</span>
                  <span className="share-history-value">{record.sitePath}</span>
                </div>
                <div className="share-history-item-detail">
                  <span className="share-history-label">URL:</span>
                  <span className="share-history-value share-history-url">{record.tunnelUrl}</span>
                </div>
                <div className="share-history-item-detail">
                  <span className="share-history-label">Started:</span>
                  <span className="share-history-value">{formatTime(record.startedAt)}</span>
                </div>
                {record.endedAt && (
                  <div className="share-history-item-detail">
                    <span className="share-history-label">Ended:</span>
                    <span className="share-history-value">{formatTime(record.endedAt)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ShareHistoryPanel
