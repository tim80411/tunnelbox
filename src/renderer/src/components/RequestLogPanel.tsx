import { useRef, useEffect } from 'react'
import type { RequestLogEntry } from '../../../shared/types'

interface RequestLogPanelProps {
  entries: RequestLogEntry[]
  selectedEntry: RequestLogEntry | null
  onSelectEntry: (entry: RequestLogEntry | null) => void
  onClear: () => void
}

const METHOD_COLORS: Record<string, string> = {
  GET: '#5b9bd5',
  POST: '#6bb86b',
  PUT: '#e5a04b',
  DELETE: '#e06060',
  PATCH: '#c084cf',
  HEAD: '#888',
  OPTIONS: '#888'
}

function getMethodColor(method: string): string {
  return METHOD_COLORS[method.toUpperCase()] || '#888'
}

function getStatusColor(code: number): string {
  if (code >= 200 && code < 300) return '#6bb86b'
  if (code >= 400 && code < 500) return '#e5a04b'
  if (code >= 500) return '#e06060'
  return '#888'
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function RequestLogPanel({
  entries,
  selectedEntry,
  onSelectEntry,
  onClear
}: RequestLogPanelProps): React.ReactElement {
  const listRef = useRef<HTMLDivElement>(null)

  // Keep newest at top — entries already arrive newest-first from the hook
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0
    }
  }, [entries.length])

  return (
    <div className="request-log-panel">
      <div className="request-log-header">
        <span className="request-log-title">Request Log</span>
        <button className="btn btn-sm" onClick={onClear}>
          Clear
        </button>
      </div>
      <div className="request-log-list" ref={listRef}>
        {entries.length === 0 ? (
          <div className="request-log-empty">No requests yet</div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className={`request-log-row${selectedEntry?.id === entry.id ? ' request-log-row--selected' : ''}`}
              onClick={() => onSelectEntry(selectedEntry?.id === entry.id ? null : entry)}
            >
              <span className="request-log-time">{formatTime(entry.timestamp)}</span>
              <span
                className="request-log-method"
                style={{ color: getMethodColor(entry.method) }}
              >
                {entry.method}
              </span>
              <span className="request-log-path" title={entry.path}>
                {entry.path}
              </span>
              <span
                className="request-log-status"
                style={{ color: getStatusColor(entry.statusCode) }}
              >
                {entry.statusCode}
              </span>
              <span className="request-log-duration">{entry.duration}ms</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default RequestLogPanel
