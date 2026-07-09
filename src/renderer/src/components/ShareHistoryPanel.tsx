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
  { key: 'all', label: '全部' },
  { key: 'active', label: '進行中' },
  { key: 'ended', label: '已結束' }
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
            分享紀錄
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
            <span className="share-bar-count">{records.length} 筆紀錄 · {activeCount} 進行中</span>
            <button
              className="btn btn-sm"
              onClick={exportCsv}
              disabled={records.length === 0}
              title={records.length === 0 ? '沒有可匯出的紀錄' : '匯出為 CSV'}
            >
              匯出 CSV
            </button>
          </div>
        </div>

        <div className="modal-body">
          {error && <div className="modal-error">{error}</div>}

          {loading ? (
            <div className="share-history-empty">
              <p className="empty-desc">載入中…</p>
            </div>
          ) : records.length === 0 ? (
            <div className="share-history-empty">
              <div className="share-history-empty-ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </div>
              <p className="empty-title">尚無分享紀錄</p>
              <p className="empty-desc">啟動 Tunnel 分享後，紀錄會顯示在這裡。</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="share-history-empty">
              <p className="empty-title">{filter === 'active' ? '沒有進行中的分享' : '沒有已結束的分享'}</p>
              <p className="empty-desc">試試切換篩選條件。</p>
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
                const statusLabel = live ? '進行中' : record.abnormalEnd ? '異常結束' : '已結束'
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
                      title={`開始於 ${formatTime(record.startedAt)}${record.endedAt ? `\n結束於 ${formatTime(record.endedAt)}` : ''}`}
                    >
                      <span className="tm">
                        {live ? `開始於 ${formatShort(record.startedAt)}` : `結束於 ${formatShort(record.endedAt!)}`}
                      </span>
                      <span className="tm">
                        {live ? `已進行 ${formatDuration(record.startedAt, record.endedAt)}` : formatDuration(record.startedAt, record.endedAt)}
                      </span>
                    </div>
                    <div className="share-act">
                      <CopyButton text={record.tunnelUrl} tooltip="複製網址" />
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
