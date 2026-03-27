import { useState, useEffect, useRef, useCallback } from 'react'
import type { RemoteConsoleEntry, ConsoleLevel } from '../../../shared/types'

interface RemoteConsolePanelProps {
  siteId: string
  open: boolean
  onClose: () => void
  enabled: boolean
}

const LEVEL_COLORS: Record<ConsoleLevel, string> = {
  log: '#e0e0e0',
  warn: '#ffb74d',
  error: '#ef5350'
}

const LEVEL_LABELS: Record<ConsoleLevel, string> = {
  log: 'LOG',
  warn: 'WARN',
  error: 'ERR'
}

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (a === null) return 'null'
      if (a === undefined) return 'undefined'
      if (typeof a === 'object' && a !== null && '__error' in (a as Record<string, unknown>)) {
        const e = a as { message?: string; stack?: string }
        return e.stack || e.message || 'Error'
      }
      if (typeof a === 'object') {
        try {
          return JSON.stringify(a, null, 2)
        } catch {
          return String(a)
        }
      }
      return String(a)
    })
    .join(' ')
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString()
}

function RemoteConsolePanel({
  siteId,
  open,
  onClose,
  enabled
}: RemoteConsolePanelProps): React.ReactElement {
  const [entries, setEntries] = useState<RemoteConsoleEntry[]>([])
  const [filter, setFilter] = useState<ConsoleLevel | 'all'>('all')
  const listRef = useRef<HTMLDivElement>(null)

  // Load existing entries when opening
  useEffect(() => {
    if (!open || !enabled) return
    window.electron.getRemoteConsoleLogs(siteId).then(setEntries).catch(() => {})
  }, [open, siteId, enabled])

  // Listen for new entries
  useEffect(() => {
    if (!open || !enabled) return
    const unsub = window.electron.onRemoteConsoleEntry((entry) => {
      if (entry.siteId === siteId) {
        setEntries((prev) => {
          const next = [...prev, entry]
          // Keep at most 500 in the UI
          return next.length > 500 ? next.slice(next.length - 500) : next
        })
      }
    })
    return unsub
  }, [open, siteId, enabled])

  // Auto-scroll to bottom
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [entries])

  const handleClear = useCallback(() => {
    window.electron.clearRemoteConsoleLogs(siteId).catch(() => {})
    setEntries([])
  }, [siteId])

  const filtered =
    filter === 'all' ? entries : entries.filter((e) => e.level === filter)

  if (!open) return <></>

  return (
    <>
      <div className="settings-overlay" data-dismiss onClick={onClose} />
      <aside className="remote-console-panel">
        <div className="settings-header">
          <h2 className="panel-title">Remote Console</h2>
          <button className="panel-close" onClick={onClose}>
            x
          </button>
        </div>

        {!enabled ? (
          <div className="remote-console-disabled">
            Remote console is disabled. Enable it in Settings.
          </div>
        ) : (
          <>
            <div className="remote-console-toolbar">
              <div className="remote-console-filters">
                {(['all', 'log', 'warn', 'error'] as const).map((level) => (
                  <button
                    key={level}
                    className={`remote-console-filter-btn${filter === level ? ' active' : ''}`}
                    onClick={() => setFilter(level)}
                  >
                    {level === 'all' ? 'All' : level.toUpperCase()}
                  </button>
                ))}
              </div>
              <button className="btn btn-sm" onClick={handleClear}>
                Clear
              </button>
            </div>
            <div className="remote-console-list" ref={listRef}>
              {filtered.length === 0 ? (
                <div className="remote-console-empty">
                  No console output yet. Waiting for visitors...
                </div>
              ) : (
                filtered.map((entry, i) => (
                  <div
                    key={`${entry.timestamp}-${i}`}
                    className={`remote-console-entry remote-console-entry--${entry.level}`}
                    style={{ color: LEVEL_COLORS[entry.level] }}
                  >
                    <span className="remote-console-time">
                      {formatTime(entry.timestamp)}
                    </span>
                    <span className="remote-console-level">
                      [{LEVEL_LABELS[entry.level]}]
                    </span>
                    <span className="remote-console-session" title={entry.sessionId}>
                      {entry.sessionId.slice(0, 6)}
                    </span>
                    <span className="remote-console-msg">
                      {formatArgs(entry.args)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </aside>
    </>
  )
}

export default RemoteConsolePanel
