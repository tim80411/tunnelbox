import { useMemo, useState } from 'react'
import { useShareHistory } from '../hooks/useShareHistory'
import CopyButton from './CopyButton'

interface ShareHistoryPanelProps {
  open: boolean
  onClose: () => void
}

type ShareFilter = 'all' | 'active' | 'ended'

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function formatTime(isoString: string): string {
  const d = new Date(isoString)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// Compact "M/D HH:MM" for the right-aligned meta column.
function formatShort(isoString: string): string {
  const d = new Date(isoString)
  return `${d.getMonth() + 1}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDuration(start: string, end: string | null): string {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()
  const mins = Math.max(0, Math.floor(ms / 60000))
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

const FILTERS: { key: ShareFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'In Progress' },
  { key: 'ended', label: 'Ended' }
]

function ShareHistoryPanel({ open, onClose }: ShareHistoryPanelProps): React.ReactElement | null {
  const { records, loading, error, exportCsv } = useShareHistory()
  const [filter, setFilter] = useState<ShareFilter>('all')

  const activeCount = useMemo(() => records.filter((r) => r.endedAt === null).length, [records])
  const filtered = useMemo(
    () =>
      records.filter((r) => {
        if (filter === 'active') return r.endedAt === null
        if (filter === 'ended') return r.endedAt !== null
        return true
      }),
    [records, filter]
  )

  if (!open) return null

  return (
    <div className="modal-overlay" data-dismiss onClick={onClose}>
      <div className="modal share-history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-head-title">
            <span className="modal-head-ic">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
            </span>
            Share History
          </h2>
          <button className="panel-close" onClick={onClose}>×</button>
        </div>

        <div className="share-bar">
          <div className="seg">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`seg-btn${filter === f.key ? ' active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="share-bar-right">
            <span className="share-bar-count">{records.length} records · {activeCount} active</span>
            <button
              className="btn btn-sm"
              onClick={exportCsv}
              disabled={records.length === 0}
              title={records.length === 0 ? 'No records to export' : 'Export to CSV'}
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="modal-body">
          {error && <div className="modal-error">{error}</div>}

          {loading ? (
            <div className="share-history-empty">
              <p className="empty-desc">Loading...</p>
            </div>
          ) : records.length === 0 ? (
            <div className="share-history-empty">
              <div className="share-history-empty-ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </div>
              <p className="empty-title">No share history yet</p>
              <p className="empty-desc">Share records will appear here after you start a tunnel.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="share-history-empty">
              <p className="empty-title">No {filter === 'active' ? 'in-progress' : 'ended'} shares</p>
              <p className="empty-desc">Try a different filter.</p>
            </div>
          ) : (
            <div className="share-history-list">
              {filtered.map((record) => {
                const live = record.endedAt === null
                const statusClass = live
                  ? 'share-status--live'
                  : record.abnormalEnd
                    ? 'share-status--warning'
                    : 'share-status--ended'
                const statusLabel = live ? 'In Progress' : record.abnormalEnd ? 'Abnormal End' : 'Ended'
                return (
                  <div key={record.id} className={`share-row${live ? ' share-row--live' : ''}`}>
                    <span className={`share-provider-badge share-provider-badge--${record.providerType}`}>
                      {record.providerType}
                    </span>
                    <div className="share-main">
                      <div className="share-name">
                        <b title={record.siteName}>{record.siteName}</b>
                        <span className={`share-status ${statusClass}`}>
                          {live && <span className="share-status-dot" />}
                          {statusLabel}
                        </span>
                      </div>
                      <div className="share-url" title={record.tunnelUrl}>{record.tunnelUrl}</div>
                    </div>
                    <div
                      className="share-meta"
                      title={`Started ${formatTime(record.startedAt)}${record.endedAt ? `\nEnded ${formatTime(record.endedAt)}` : ''}`}
                    >
                      <span className="tm">
                        {live ? `Started ${formatShort(record.startedAt)}` : `Ended ${formatShort(record.endedAt!)}`}
                      </span>
                      <span className="tm">
                        {formatDuration(record.startedAt, record.endedAt)}{live ? ' elapsed' : ''}
                      </span>
                    </div>
                    <div className="share-act">
                      <CopyButton text={record.tunnelUrl} tooltip="Copy URL" />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ShareHistoryPanel
