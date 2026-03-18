import { useEffect, useState, useCallback } from 'react'
import type { SiteInfo } from '../../shared/types'

function App(): React.ReactElement {
  const [sites, setSites] = useState<SiteInfo[]>([])
  const [error, setError] = useState<string | null>(null)

  // Confirm remove modal state
  const [confirmRemove, setConfirmRemove] = useState<SiteInfo | null>(null)

  // Add-site modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [newSiteName, setNewSiteName] = useState('')
  const [newSitePath, setNewSitePath] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const loadSites = useCallback(async () => {
    try {
      const siteList = await window.electron.getSites()
      setSites(siteList)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sites')
    }
  }, [])

  useEffect(() => {
    loadSites()

    const unsubSites = window.electron.onSiteUpdated((updatedSites) => {
      setSites(updatedSites)
    })

    const unsubFiles = window.electron.onFileChanged(() => {
      // File change events are handled by WebSocket hot reload on the browser side.
    })

    return () => {
      unsubSites()
      unsubFiles()
    }
  }, [loadSites])

  const openAddModal = useCallback(() => {
    setNewSiteName('')
    setNewSitePath('')
    setAddError(null)
    setShowAddModal(true)
  }, [])

  const closeAddModal = useCallback(() => {
    setShowAddModal(false)
    setAddError(null)
  }, [])

  const handleSelectFolder = useCallback(async () => {
    try {
      const folderPath = await window.electron.selectFolder()
      if (folderPath) {
        setNewSitePath(folderPath)
        // Auto-fill name if empty
        if (!newSiteName.trim()) {
          const folderName = folderPath.split('/').pop() || folderPath.split('\\').pop() || ''
          setNewSiteName(folderName)
        }
      }
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to select folder')
    }
  }, [newSiteName])

  const handleConfirmAdd = useCallback(async () => {
    setAddError(null)

    if (!newSiteName.trim()) {
      setAddError('請輸入網頁名稱')
      return
    }
    if (!newSitePath.trim()) {
      setAddError('請選擇資料夾路徑')
      return
    }

    setAdding(true)
    try {
      await window.electron.addSite(newSiteName.trim(), newSitePath)
      setShowAddModal(false)
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add site')
    } finally {
      setAdding(false)
    }
  }, [newSiteName, newSitePath])

  const handleRemoveSite = useCallback(async (id: string) => {
    try {
      setError(null)
      await window.electron.removeSite(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove site')
    }
  }, [])

  const handleOpenInBrowser = useCallback(async (site: SiteInfo) => {
    try {
      setError(null)
      if (site.status !== 'running') {
        // Prompt: server not running, offer to start
        await window.electron.startServer(site.id)
        // After starting, open in browser
        await window.electron.openInBrowser(site.id)
      } else {
        await window.electron.openInBrowser(site.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open in browser')
    }
  }, [])

  const handleStartServer = useCallback(async (id: string) => {
    try {
      setError(null)
      await window.electron.startServer(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start server')
    }
  }, [])

  const handleStopServer = useCallback(async (id: string) => {
    try {
      setError(null)
      await window.electron.stopServer(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop server')
    }
  }, [])

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Site Holder</h1>
        <button className="btn btn-primary" onClick={openAddModal}>
          + Add Site
        </button>
      </header>

      {error && (
        <div className="error-bar">
          {error}
          <button className="error-close" onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="app-body">
        <div className="site-list">
          {sites.length === 0 ? (
            <div className="site-list-empty">
              <div className="empty-icon">📂</div>
              <p className="empty-title">尚未建立任何網頁</p>
              <p className="empty-desc">點擊下方按鈕，選擇本地資料夾來建立你的第一個靜態網頁</p>
              <button className="btn btn-primary" onClick={openAddModal}>
                + 新增網頁
              </button>
            </div>
          ) : (
            sites.map((site) => (
              <div key={site.id} className="site-item">
                <div className="site-item-info">
                  <span className="site-item-name">{site.name}</span>
                  <span className="site-item-path">{site.folderPath}</span>
                  {site.status === 'running' && site.url ? (
                    <div className="site-item-url-row">
                      <span className="site-item-url">{site.url}</span>
                      <button
                        className="btn-copy"
                        onClick={async () => {
                          await navigator.clipboard.writeText(site.url)
                        }}
                        title="複製網址"
                      >
                        📋
                      </button>
                    </div>
                  ) : (
                    <span className="site-item-url site-item-url-unavailable">網址不可用</span>
                  )}
                </div>
                <span className={`site-item-status ${site.status}`}>
                  {site.status === 'running'
                    ? '運行中'
                    : site.status === 'stopped'
                      ? '已停止'
                      : '錯誤'}
                </span>
                <div className="site-item-actions">
                  <button
                    className="btn btn-sm"
                    onClick={() => handleOpenInBrowser(site)}
                  >
                    Open
                  </button>
                  {site.status === 'running' ? (
                    <button
                      className="btn btn-sm"
                      onClick={() => handleStopServer(site.id)}
                    >
                      Stop
                    </button>
                  ) : (
                    <button
                      className="btn btn-sm"
                      onClick={() => handleStartServer(site.id)}
                    >
                      Start
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => setConfirmRemove(site)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Confirm Remove Modal */}
      {confirmRemove && (
        <div className="modal-overlay" onClick={() => setConfirmRemove(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">確認刪除</h2>
            <p className="confirm-text">
              確定要刪除「{confirmRemove.name}」嗎？此操作將停止對應的伺服器，但不會刪除本地檔案。
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmRemove(null)}>
                取消
              </button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  await handleRemoveSite(confirmRemove.id)
                  setConfirmRemove(null)
                }}
              >
                確認刪除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Site Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={closeAddModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Add New Site</h2>

            {addError && (
              <div className="modal-error">{addError}</div>
            )}

            <div className="form-group">
              <label className="form-label">Name</label>
              <input
                className="form-input"
                type="text"
                placeholder="My Website"
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Folder Path</label>
              <div className="form-row">
                <input
                  className="form-input"
                  type="text"
                  placeholder="Select a folder..."
                  value={newSitePath}
                  readOnly
                />
                <button className="btn" onClick={handleSelectFolder}>
                  Browse
                </button>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={closeAddModal}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleConfirmAdd}
                disabled={adding}
              >
                {adding ? 'Adding...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
