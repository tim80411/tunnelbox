import { useState } from 'react'
import type { RequestLogEntry } from '../../../shared/types'
import CopyButton from './CopyButton'

interface RequestDetailPanelProps {
  entry: RequestLogEntry
  onClose: () => void
}

function formatBody(body: string | null): string {
  if (!body) return ''
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

function formatHeaders(
  headers: Record<string, string | string[] | undefined>
): { key: string; value: string }[] {
  return Object.entries(headers)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => ({
      key,
      value: Array.isArray(value) ? value.join(', ') : String(value)
    }))
}

function RequestDetailPanel({
  entry,
  onClose
}: RequestDetailPanelProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<'request-headers' | 'request-body' | 'response-headers'>('request-headers')
  const formattedBody = formatBody(entry.requestBody)
  const requestHeaders = formatHeaders(entry.requestHeaders)
  const responseHeaders = formatHeaders(entry.responseHeaders)

  return (
    <>
      <div className="settings-overlay" data-dismiss onClick={onClose} />
      <aside className="request-detail-panel">
        <div className="request-detail-header">
          <div className="request-detail-summary">
            <span className="request-detail-method">{entry.method}</span>
            <span className="request-detail-path" title={entry.path}>{entry.path}</span>
            <span className="request-detail-status">{entry.statusCode}</span>
            <span className="request-detail-duration">{entry.duration}ms</span>
          </div>
          <button className="panel-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="request-detail-tabs">
          <button
            className={`request-detail-tab${activeTab === 'request-headers' ? ' active' : ''}`}
            onClick={() => setActiveTab('request-headers')}
          >
            Request Headers
          </button>
          <button
            className={`request-detail-tab${activeTab === 'request-body' ? ' active' : ''}`}
            onClick={() => setActiveTab('request-body')}
          >
            Request Body
          </button>
          <button
            className={`request-detail-tab${activeTab === 'response-headers' ? ' active' : ''}`}
            onClick={() => setActiveTab('response-headers')}
          >
            Response Headers
          </button>
        </div>

        <div className="request-detail-content">
          {activeTab === 'request-headers' && (
            <div className="request-detail-section">
              {requestHeaders.length === 0 ? (
                <div className="request-detail-empty">No request headers</div>
              ) : (
                <table className="request-detail-table">
                  <tbody>
                    {requestHeaders.map((h) => (
                      <tr key={h.key}>
                        <td className="request-detail-key">{h.key}</td>
                        <td className="request-detail-value">{h.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'request-body' && (
            <div className="request-detail-section">
              {entry.requestBodyTruncated && (
                <div className="request-detail-notice">
                  Body truncated (original size: {entry.requestBodySize} bytes)
                </div>
              )}
              {!entry.requestBody ? (
                <div className="request-detail-empty">No request body</div>
              ) : (
                <>
                  <div className="request-detail-body-actions">
                    <CopyButton text={formattedBody} tooltip="Copy body" />
                  </div>
                  <pre className="request-detail-body">{formattedBody}</pre>
                </>
              )}
            </div>
          )}

          {activeTab === 'response-headers' && (
            <div className="request-detail-section">
              {responseHeaders.length === 0 ? (
                <div className="request-detail-empty">No response headers</div>
              ) : (
                <table className="request-detail-table">
                  <tbody>
                    {responseHeaders.map((h) => (
                      <tr key={h.key}>
                        <td className="request-detail-key">{h.key}</td>
                        <td className="request-detail-value">{h.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

export default RequestDetailPanel
