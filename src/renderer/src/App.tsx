import { useEffect, useState, useCallback } from 'react'
import type { SiteInfo, CloudflaredEnv, CloudflareAuth, ServeMode } from '../../shared/types'
import TunnelControls from './components/TunnelControls'
import LanSharingControls from './components/LanSharingControls'
import AuthPanel from './components/AuthPanel'
import SettingsPanel from './components/SettingsPanel'
import { useSettings } from './hooks/useSettings'
import { useSiteDropZone } from './hooks/useSiteDropZone'
import { usePasteToAdd } from './hooks/usePasteToAdd'
import { useUrlAddNotification } from './hooks/useUrlAddNotification'
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation'
import { useMenuCommands } from './hooks/useMenuCommands'

function App(): React.ReactElement {
  const [sites, setSites] = useState<SiteInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cloudflaredEnv, setCloudflaredEnv] = useState<CloudflaredEnv>({ status: 'checking' })
  const [auth, setAuth] = useState<CloudflareAuth>({ status: 'logged_out' })

  // Confirm remove modal state
  const [confirmRemove, setConfirmRemove] = useState<SiteInfo | null>(null)

  // Quick Action install state
  const [quickActionInstalled, setQuickActionInstalled] = useState<boolean | null>(null)
  const [installingQuickAction, setInstallingQuickAction] = useState(false)

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Settings panel state
  const [showSettings, setShowSettings] = useState(false)
  const { settings, update: updateSettings } = useSettings()

  // Add-site modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [newSiteName, setNewSiteName] = useState('')
  const [newSitePath, setNewSitePath] = useState('')
  const [newServeMode, setNewServeMode] = useState<ServeMode>('static')
  const [newProxyTarget, setNewProxyTarget] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [settingsSiteId, setSettingsSiteId] = useState<string | null>(null)

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

    window.electron.getCloudflaredStatus?.().then(setCloudflaredEnv).catch(() => {
      setCloudflaredEnv({ status: 'error', errorMessage: '無法取得 cloudflared 狀態' })
    })

    window.electron.getAuthStatus?.().then(setAuth).catch(() => {})
    window.electron.isQuickActionInstalled?.().then(setQuickActionInstalled).catch(() => {})

    const unsubSites = window.electron.onSiteUpdated((updatedSites) => {
      setSites(updatedSites)
    })

    const unsubFiles = window.electron.onFileChanged(() => {
      // File change events are handled by WebSocket hot reload on the browser side.
    })

    const unsubCloudflared = window.electron.onCloudflaredStatusChanged?.(setCloudflaredEnv)

    const unsubTunnel = window.electron.onTunnelStatusChanged?.((siteId, tunnel) => {
      try {
        // Ensure tunnel.errorMessage is always a string if present
        if (tunnel && tunnel.errorMessage && typeof tunnel.errorMessage !== 'string') {
          tunnel.errorMessage = String(tunnel.errorMessage)
        }
        setSites((prev) =>
          prev.map((s) => (s.id === siteId ? { ...s, tunnel: tunnel ?? undefined } : s))
        )
      } catch (err) {
        console.error('[App] Error processing tunnel status change:', err)
      }
    })

    const unsubAuth = window.electron.onAuthStatusChanged?.(setAuth)

    return () => {
      unsubSites()
      unsubFiles()
      unsubCloudflared?.()
      unsubTunnel?.()
      unsubAuth?.()
    }
  }, [loadSites])

  const openAddModal = useCallback(() => {
    setNewSiteName('')
    setNewSitePath('')
    setNewServeMode(settings.defaultServeMode)
    setNewProxyTarget('')
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

    if (newServeMode === 'proxy') {
      if (!newProxyTarget.trim()) {
        setAddError('請輸入 Proxy 目標 URL')
        return
      }
    } else {
      if (!newSitePath.trim()) {
        setAddError('請選擇資料夾路徑')
        return
      }
    }

    setAdding(true)
    try {
      if (newServeMode === 'proxy') {
        await window.electron.addSite({ serveMode: 'proxy', name: newSiteName.trim(), proxyTarget: newProxyTarget.trim() })
      } else {
        await window.electron.addSite({ serveMode: 'static', name: newSiteName.trim(), folderPath: newSitePath })
      }
      setShowAddModal(false)
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add site')
    } finally {
      setAdding(false)
    }
  }, [newSiteName, newSitePath, newServeMode, newProxyTarget])

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
      await window.electron.openInBrowser(site.id)
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

  const handleRestartServer = useCallback(async (site: SiteInfo) => {
    try {
      setError(null)
      if (site.status === 'running') await window.electron.stopServer(site.id)
      await window.electron.startServer(site.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restart server')
    }
  }, [])

  const handleInstallCloudflared = useCallback(async () => {
    try {
      setCloudflaredEnv({ status: 'installing' })
      await window.electron.installCloudflared()
    } catch (err) {
      setCloudflaredEnv({
        status: 'install_failed',
        errorMessage: err instanceof Error ? err.message : '安裝失敗'
      })
    }
  }, [])

  const handleEnableLanSharing = useCallback(async (siteId: string) => {
    try {
      setError(null)
      await window.electron.setLanSharing(siteId, true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '啟用區網分享失敗')
    }
  }, [])

  const handleDisableLanSharing = useCallback(async (siteId: string) => {
    try {
      setError(null)
      await window.electron.setLanSharing(siteId, false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '關閉區網分享失敗')
    }
  }, [])

  const handleShareSite = useCallback(async (siteId: string) => {
    try {
      setError(null)
      await window.electron.startQuickTunnel(siteId)
    } catch (err) {
      setError(err instanceof Error ? err.message : '啟動 Tunnel 失敗')
    }
  }, [])

  const handleStopSharing = useCallback(async (siteId: string) => {
    try {
      setError(null)
      await window.electron.stopTunnel(siteId)
    } catch (err) {
      setError(err instanceof Error ? err.message : '停止 Tunnel 失敗')
    }
  }, [])

  const handleLogin = useCallback(async () => {
    try {
      setError(null)
      setAuth({ status: 'logging_in' })
      const result = await window.electron.loginCloudflare()
      setAuth(result)
    } catch (err) {
      setAuth({ status: 'logged_out' })
      setError(err instanceof Error ? err.message : '登入失敗')
    }
  }, [])

  const handleLogout = useCallback(async () => {
    try {
      setError(null)
      await window.electron.logoutCloudflare()
      setAuth({ status: 'logged_out' })
    } catch (err) {
      setError(err instanceof Error ? err.message : '登出失敗')
    }
  }, [])

  const handleBindFixedDomain = useCallback(async (siteId: string, domain: string) => {
    try {
      setError(null)
      await window.electron.bindFixedDomain(siteId, domain)
    } catch (err) {
      setError(err instanceof Error ? err.message : '綁定固定網域失敗')
      throw err
    }
  }, [])

  const handleUnbindFixedDomain = useCallback(async (siteId: string) => {
    try {
      setError(null)
      await window.electron.unbindFixedDomain(siteId)
    } catch (err) {
      setError(err instanceof Error ? err.message : '解除綁定失敗')
    }
  }, [])

  const handleStartNamedTunnel = useCallback(async (siteId: string) => {
    try {
      setError(null)
      await window.electron.startNamedTunnel(siteId)
    } catch (err) {
      setError(err instanceof Error ? err.message : '啟動 Named Tunnel 失敗')
    }
  }, [])

  const handleStopNamedTunnel = useCallback(async (siteId: string) => {
    try {
      setError(null)
      await window.electron.stopNamedTunnel(siteId)
    } catch (err) {
      setError(err instanceof Error ? err.message : '停止 Named Tunnel 失敗')
    }
  }, [])

  const handleStartRename = useCallback((site: SiteInfo) => {
    setRenamingId(site.id)
    setRenameValue(site.name)
  }, [])

  const handleConfirmRename = useCallback(async () => {
    if (!renamingId) return
    try {
      setError(null)
      await window.electron.renameSite(renamingId, renameValue)
      setRenamingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '重新命名失敗')
    }
  }, [renamingId, renameValue])

  const handleCancelRename = useCallback(() => {
    setRenamingId(null)
  }, [])

  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const handleUrlAddSuccess = useCallback((msg: string) => {
    setSuccessMessage(msg)
    setTimeout(() => setSuccessMessage(null), 3000)
  }, [])

  const handleInstallQuickAction = useCallback(async () => {
    try {
      setInstallingQuickAction(true)
      await window.electron.installQuickAction()
      setQuickActionInstalled(true)
      setSuccessMessage('Right-click menu installed! Right-click a folder to add it to TunnelBox.')
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to install Quick Action')
    } finally {
      setInstallingQuickAction(false)
    }
  }, [])

  const { isDraggingOver, dropZoneHandlers } = useSiteDropZone({ onError: setError })
  usePasteToAdd({ onError: setError })
  useUrlAddNotification({ onSuccess: handleUrlAddSuccess, onError: setError })

  const isModalOpen = showAddModal || showSettings || !!confirmRemove
  const { selectedSiteId, setSelectedSiteId, listRef } = useKeyboardNavigation({
    sites,
    disabled: isModalOpen
  })

  const handleOpenSettings = useCallback(() => setShowSettings(true), [])
  const handleRemoveSiteConfirm = useCallback((site: SiteInfo) => setConfirmRemove(site), [])

  useMenuCommands({
    sites,
    selectedSiteId,
    onAddSite: openAddModal,
    onOpenSettings: handleOpenSettings,
    onOpenInBrowser: handleOpenInBrowser,
    onRestartServer: handleRestartServer,
    onRemoveSite: handleRemoveSiteConfirm
  })

  const hasRunningNamedTunnels = sites.some(
    (s) => s.tunnel?.type === 'named' && s.tunnel.status === 'running'
  )

  const settingsSite = settingsSiteId ? sites.find((s) => s.id === settingsSiteId) ?? null : null

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>TunnelBox</h1>
        <div className="app-header-actions">
          <AuthPanel
            auth={auth}
            hasRunningNamedTunnels={hasRunningNamedTunnels}
            onLogin={handleLogin}
            onLogout={handleLogout}
          />
          {quickActionInstalled === false && (
            <button
              className="btn btn-sm"
              onClick={handleInstallQuickAction}
              disabled={installingQuickAction}
              title="Install right-click context menu integration"
            >
              {installingQuickAction ? 'Installing...' : 'Setup Right-Click'}
            </button>
          )}
          <button
            className="btn btn-icon"
            onClick={() => setShowSettings((v) => !v)}
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6.5 1L6.2 2.6C5.8 2.8 5.4 3 5.1 3.3L3.5 2.7L2 5.3L3.3 6.4C3.3 6.6 3.2 6.8 3.2 7C3.2 7.2 3.2 7.4 3.3 7.6L2 8.7L3.5 11.3L5.1 10.7C5.4 11 5.8 11.2 6.2 11.4L6.5 13H9.5L9.8 11.4C10.2 11.2 10.6 11 10.9 10.7L12.5 11.3L14 8.7L12.7 7.6C12.7 7.4 12.8 7.2 12.8 7C12.8 6.8 12.8 6.6 12.7 6.4L14 5.3L12.5 2.7L10.9 3.3C10.6 3 10.2 2.8 9.8 2.6L9.5 1H6.5ZM8 5C9.1 5 10 5.9 10 7C10 8.1 9.1 9 8 9C6.9 9 6 8.1 6 7C6 5.9 6.9 5 8 5Z" fill="currentColor"/>
            </svg>
          </button>
          <button className="btn btn-primary" onClick={openAddModal}>
            + Add Site
          </button>
        </div>
      </header>

      {successMessage && (
        <div className="success-bar">
          {successMessage}
          <button className="success-close" onClick={() => setSuccessMessage(null)}>×</button>
        </div>
      )}

      {error && (
        <div className="error-bar">
          {error}
          <button className="error-close" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {cloudflaredEnv.status !== 'available' && (
        <div className={`cloudflared-bar cloudflared-${cloudflaredEnv.status}`}>
          {cloudflaredEnv.status === 'checking' && (
            <span className="cloudflared-bar-text">
              <span className="cloudflared-spinner" />
              正在檢查 cloudflared 環境...
            </span>
          )}
          {cloudflaredEnv.status === 'not_installed' && (
            <span className="cloudflared-bar-text">
              cloudflared 尚未安裝，無法使用 Tunnel 功能
              <button className="btn btn-sm btn-primary cloudflared-bar-btn" onClick={handleInstallCloudflared}>
                安裝
              </button>
            </span>
          )}
          {cloudflaredEnv.status === 'installing' && (
            <span className="cloudflared-bar-text">
              <span className="cloudflared-spinner" />
              正在安裝 cloudflared...
            </span>
          )}
          {cloudflaredEnv.status === 'install_failed' && (
            <span className="cloudflared-bar-text">
              cloudflared 安裝失敗{cloudflaredEnv.errorMessage ? `：${cloudflaredEnv.errorMessage}` : ''}
              <a
                className="cloudflared-bar-link"
                href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
                target="_blank"
                rel="noopener noreferrer"
              >
                手動安裝說明
              </a>
              <button className="btn btn-sm cloudflared-bar-btn" onClick={handleInstallCloudflared}>
                重試
              </button>
            </span>
          )}
          {cloudflaredEnv.status === 'outdated' && (
            <span className="cloudflared-bar-text">
              cloudflared 版本過舊{cloudflaredEnv.version ? ` (${cloudflaredEnv.version})` : ''}，建議更新
              <button className="btn btn-sm btn-primary cloudflared-bar-btn" onClick={handleInstallCloudflared}>
                更新
              </button>
            </span>
          )}
          {cloudflaredEnv.status === 'error' && (
            <span className="cloudflared-bar-text">
              cloudflared 環境錯誤{cloudflaredEnv.errorMessage ? `：${cloudflaredEnv.errorMessage}` : ''}
            </span>
          )}
        </div>
      )}

      <div className="app-body">
        <div
          ref={listRef}
          className={`site-list${isDraggingOver ? ' site-list-drop-active' : ''}`}
          {...dropZoneHandlers}
        >
          {isDraggingOver && (
            <div className="site-list-drop-hint">拖曳資料夾至此新增</div>
          )}
          {sites.length === 0 ? (
            <div className="site-list-empty">
              <div className="empty-icon">📂</div>
              <p className="empty-title">尚未建立任何網頁</p>
              <p className="empty-desc">拖曳資料夾至此，或點擊下方按鈕來建立你的第一個網頁</p>
              <button className="btn btn-primary" onClick={openAddModal}>
                + 新增網頁
              </button>
            </div>
          ) : (
            sites.map((site) => (
              <div
                key={site.id}
                data-site-id={site.id}
                className={`site-item${selectedSiteId === site.id ? ' site-item-selected' : ''}`}
                onClick={() => setSelectedSiteId(site.id)}
              >
                <div className="site-item-info">
                  <div className="site-item-name-row">
                    <div className="site-item-name-group">
                      <span className={`site-mode-badge site-mode-badge--${site.serveMode}`}>
                        {site.serveMode}
                      </span>
                      {renamingId === site.id ? (
                        <form
                          className="site-rename-form"
                          onSubmit={(e) => { e.preventDefault(); handleConfirmRename() }}
                        >
                          <input
                            className="site-rename-input"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={handleConfirmRename}
                            onKeyDown={(e) => { if (e.key === 'Escape') handleCancelRename() }}
                            autoFocus
                          />
                        </form>
                      ) : (
                        <span
                          className="site-item-name site-item-name-editable"
                          onDoubleClick={() => handleStartRename(site)}
                          title="Double-click to rename"
                        >
                          {site.name}
                          <svg className="site-item-name-edit-icon" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                          </svg>
                        </span>
                      )}
                    </div>
                    <span className={`site-item-status ${site.status}`}>
                      {site.status === 'running'
                        ? '運行中'
                        : site.status === 'stopped'
                          ? '已停止'
                          : '錯誤'}
                    </span>
                  </div>
                  <div className="site-item-path-row">
                    <span className="site-item-path">
                      {site.serveMode === 'proxy' ? `Proxy → ${site.proxyTarget}` : site.folderPath}
                    </span>
                    <button
                      className="btn-copy"
                      onClick={async () => {
                        await navigator.clipboard.writeText(
                          site.serveMode === 'proxy' ? site.proxyTarget : site.folderPath
                        )
                      }}
                      title={site.serveMode === 'proxy' ? '複製目標 URL' : '複製路徑'}
                    >
                      📋
                    </button>
                  </div>
                  {site.status === 'running' && site.url ? (
                    <>
                      <div className="site-item-url-row">
                        <a
                          className="site-item-url"
                          href={site.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {site.url}
                        </a>
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
                      {site.lanUrl && (
                        <div className="site-item-url-row">
                          <span className="sharing-badge sharing-badge--lan">LAN</span>
                          <a
                            className="site-item-url"
                            href={site.lanUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {site.lanUrl}
                          </a>
                          {site.lanInterfaceName && (
                            <span className="sharing-iface">({site.lanInterfaceName})</span>
                          )}
                          <button
                            className="btn-copy"
                            onClick={async () => {
                              await navigator.clipboard.writeText(site.lanUrl!)
                            }}
                            title="複製區網網址"
                          >
                            📋
                          </button>
                        </div>
                      )}
                      {site.tunnel?.status === 'running' && site.tunnel.publicUrl && (
                        <div className="site-item-url-row">
                          <span className="sharing-badge sharing-badge--wan">WAN</span>
                          <a
                            className="site-item-url"
                            href={site.tunnel.publicUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {site.tunnel.publicUrl}
                          </a>
                          <button
                            className="btn-copy"
                            onClick={async () => {
                              await navigator.clipboard.writeText(site.tunnel!.publicUrl!)
                            }}
                            title="複製公開網址"
                          >
                            📋
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="site-item-url-unavailable">網址不可用</span>
                  )}
                </div>
                <div className="site-sharing-section">
                  <LanSharingControls
                    site={site}
                    onEnable={handleEnableLanSharing}
                    onDisable={handleDisableLanSharing}
                  />
                  <TunnelControls
                    site={site}
                    cloudflaredAvailable={cloudflaredEnv.status === 'available'}
                    authStatus={auth.status}
                    onShare={handleShareSite}
                    onStopSharing={handleStopSharing}
                    onBindFixedDomain={handleBindFixedDomain}
                    onUnbindFixedDomain={handleUnbindFixedDomain}
                    onStartNamedTunnel={handleStartNamedTunnel}
                    onStopNamedTunnel={handleStopNamedTunnel}
                    onLogin={handleLogin}
                  />
                </div>
                <div className="site-item-actions">
                  <button
                    className="btn btn-sm"
                    onClick={() => handleOpenInBrowser(site)}
                    disabled={site.status !== 'running'}
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

      <SettingsPanel
        open={showSettings}
        settings={settings}
        onClose={() => setShowSettings(false)}
        onUpdate={updateSettings}
      />

      {/* Add Site Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={closeAddModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Add New Site</h2>

            {addError && (
              <div className="modal-error">{addError}</div>
            )}

            <div className="form-group">
              <label className="form-label">Mode</label>
              <div className="serve-mode-toggle">
                <button
                  className={`serve-mode-btn${newServeMode === 'static' ? ' active' : ''}`}
                  onClick={() => setNewServeMode('static')}
                  type="button"
                >
                  Static
                </button>
                <button
                  className={`serve-mode-btn${newServeMode === 'proxy' ? ' active' : ''}`}
                  onClick={() => setNewServeMode('proxy')}
                  type="button"
                >
                  Proxy
                </button>
              </div>
            </div>

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

            {newServeMode === 'static' ? (
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
            ) : (
              <div className="form-group">
                <label className="form-label">Proxy Target URL</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="http://localhost:3000"
                  value={newProxyTarget}
                  onChange={(e) => setNewProxyTarget(e.target.value)}
                />
              </div>
            )}

            <div className="modal-actions">
              <button className="btn" onClick={closeAddModal}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleConfirmAdd}
                disabled={adding || (newServeMode === 'proxy' ? !newProxyTarget.trim() : !newSitePath.trim())}
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
