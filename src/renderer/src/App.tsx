import { useEffect, useState, useCallback, useMemo } from 'react'
import type { SiteInfo, CloudflareAuth, ServeMode, CloudflareAccountsState } from '../../shared/types'
import ConcurrentSharesDialog from './components/ConcurrentSharesDialog'
import SensitivePortDialog from './components/SensitivePortDialog'
import SsrfRiskDialog from './components/SsrfRiskDialog'
import { sensitivePortName } from '../../shared/sensitive-ports'
import { extractPort, proxyTargetSsrfRisk } from '../../shared/proxy-utils'
import ProviderInstallBar from './components/ProviderInstallBar'
import SettingsPanel from './components/SettingsPanel'
import ShortcutsPanel from './components/ShortcutsPanel'
import ShareHistoryPanel from './components/ShareHistoryPanel'
import RemoteConsolePanel from './components/RemoteConsolePanel'
import RequestDetailPanel from './components/RequestDetailPanel'
import DashboardPanel from './components/DashboardPanel'
import SiteSummaryStrip from './components/SiteSummaryStrip'
import SiteRail from './components/SiteRail'
import SiteDetail from './components/SiteDetail'
import SiteDetailEmpty from './components/SiteDetailEmpty'
import { summarizeSites, filterSites, type SiteFilter } from './utils/site-view'
import NotificationBell from './components/NotificationBell'
import { useSettings } from './hooks/useSettings'
import { useRequestLog } from './hooks/useRequestLog'
import { useAutoUpdate } from './hooks/useAutoUpdate'
import { useProvider } from './hooks/useProvider'
import { useTierGate } from './hooks/useTierGate'
import FounderBadge from './components/FounderBadge'
import { shouldShowRenewBanner, majorMinor } from '../../shared/renew-banner'
import { providers } from './providers/registry'
import { useSiteDropZone } from './hooks/useSiteDropZone'
import { usePasteToAdd } from './hooks/usePasteToAdd'
import { useUrlAddNotification } from './hooks/useUrlAddNotification'
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation'
import { useMenuCommands } from './hooks/useMenuCommands'

function App(): React.ReactElement {
  const [sites, setSites] = useState<SiteInfo[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<SiteFilter>('all')
  const [error, setError] = useState<string | null>(null)
  const [auth, setAuth] = useState<CloudflareAuth>({ status: 'logged_out' })
  const [cfAccounts, setCfAccounts] = useState<CloudflareAccountsState>({ accounts: [], activeAccountId: null })

  // Confirm remove modal state
  const [confirmRemove, setConfirmRemove] = useState<SiteInfo | null>(null)

  // Quick Action install state
  const [quickActionInstalled, setQuickActionInstalled] = useState<boolean | null>(null)
  const [installingQuickAction, setInstallingQuickAction] = useState(false)

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Concurrent shares dialog state (US-219)
  const [shareGateDialog, setShareGateDialog] = useState<{
    targetSite: SiteInfo
    activeIds: string[]
    startFn: () => Promise<unknown>
  } | null>(null)

  // Sensitive-port confirmation dialog state (TIM-226)
  const [sensitivePortDialog, setSensitivePortDialog] = useState<{
    siteName: string
    port: number
    serviceName: string
    proceed: () => void
  } | null>(null)

  // SSRF confirmation dialog state (TIM-312 / F06)
  const [ssrfRiskDialog, setSsrfRiskDialog] = useState<{
    siteName: string
    hostname: string
    risk: 'link-local' | 'private'
    proceed: () => void
  } | null>(null)

  // Panel state
  const [showSettings, setShowSettings] = useState(false)
  // TIM-224: static sites whose file watcher was detected unhealthy (live reload paused).
  const [unhealthyWatchers, setUnhealthyWatchers] = useState<Set<string>>(() => new Set())
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showShareHistory, setShowShareHistory] = useState(false)
  const [consoleForSiteId, setConsoleForSiteId] = useState<string | null>(null)
  const [showUpgradePro, setShowUpgradePro] = useState(false)
  // License import (US-105)
  const [proActivated, setProActivated] = useState<{ email: string } | null>(null)
  const [pendingLicenseReplace, setPendingLicenseReplace] = useState<string | null>(null)
  const [downloadsLicensePrompt, setDownloadsLicensePrompt] = useState<string | null>(null)
  const { settings, update: updateSettings } = useSettings()
  const tierState = useTierGate()
  const {
    state: updateState, appVersion, forceUpdate,
    checkForUpdates, downloadUpdate, installUpdate, dismissUpdate
  } = useAutoUpdate()
  const cfProvider = useProvider(providers.cloudflare)
  const frpProvider = useProvider(providers.frp)
  const boreProvider = useProvider(providers.bore)

  // Add-site modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [newSiteName, setNewSiteName] = useState('')
  const [newSitePath, setNewSitePath] = useState('')
  const [newServeMode, setNewServeMode] = useState<ServeMode>('static')
  const [newProxyTarget, setNewProxyTarget] = useState('')
  const [newPassthrough, setNewPassthrough] = useState(false)
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

    window.electron.getAuthStatus?.().then(setAuth).catch(() => {})
    window.electron.isQuickActionInstalled?.().then(setQuickActionInstalled).catch(() => {})
    window.electron.listCfAccounts?.().then(setCfAccounts).catch(() => {})

    const unsubSites = window.electron.onSiteUpdated((updatedSites) => {
      setSites(updatedSites)
    })

    const unsubFiles = window.electron.onFileChanged((siteId) => {
      // File change events are handled by WebSocket hot reload on the browser side.
      // A delivered event also proves the watcher is alive again — clear any
      // stale "unhealthy" flag for this site (TIM-224).
      setUnhealthyWatchers((prev) => {
        if (!prev.has(siteId)) return prev
        const next = new Set(prev)
        next.delete(siteId)
        return next
      })
    })

    const unsubWatcher = window.electron.onWatcherUnhealthy?.((siteId) => {
      setUnhealthyWatchers((prev) => new Set(prev).add(siteId))
    })

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
    const unsubCfAccounts = window.electron.onCfAccountsChanged?.(setCfAccounts)

    return () => {
      unsubSites()
      unsubFiles()
      unsubWatcher?.()
      unsubTunnel?.()
      unsubAuth?.()
      unsubCfAccounts?.()
    }
  }, [loadSites])

  const handleRestartWatcher = useCallback(async (siteId: string) => {
    try {
      await window.electron.restartWatcher?.(siteId)
    } finally {
      setUnhealthyWatchers((prev) => {
        if (!prev.has(siteId)) return prev
        const next = new Set(prev)
        next.delete(siteId)
        return next
      })
    }
  }, [])

  const openAddModal = useCallback(() => {
    setNewSiteName('')
    setNewSitePath('')
    setNewServeMode(settings.defaultServeMode)
    setNewProxyTarget('')
    setNewPassthrough(false)
    setAddError(null)
    setShowAddModal(true)
  }, [settings.defaultServeMode])

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
        setAddError('請輸入 Proxy 目標 URL 或 Port')
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
        await window.electron.addSite({
          serveMode: 'proxy',
          name: newSiteName.trim(),
          proxyTarget: newProxyTarget.trim(),
          ...(newPassthrough && { passthrough: true })
        })
      } else {
        await window.electron.addSite({ serveMode: 'static', name: newSiteName.trim(), folderPath: newSitePath })
      }
      setShowAddModal(false)
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add site')
    } finally {
      setAdding(false)
    }
  }, [newSiteName, newSitePath, newServeMode, newProxyTarget, newPassthrough])

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

  const handleOpenFolder = useCallback(async (folderPath: string) => {
    try {
      setError(null)
      await window.electron.openFolder(folderPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : '無法開啟資料夾')
    }
  }, [])

  // If a Free user is at the active-site limit, show the swap dialog; otherwise run startFn.
  const withShareGate = useCallback(
    async (siteId: string, startFn: () => Promise<unknown>) => {
      const gate = await window.electron.checkShareGate(siteId)
      if (!gate.allowed) {
        const targetSite = sites.find((s) => s.id === siteId)
        if (!targetSite) return
        setShareGateDialog({ targetSite, activeIds: gate.activeIds, startFn })
        return
      }
      await startFn()
    },
    [sites]
  )

  const handleStartServer = useCallback(async (id: string) => {
    try {
      setError(null)
      await withShareGate(id, () => window.electron.startServer(id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start server')
    }
  }, [withShareGate])

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
      // Restart on an already-running site does not count as a "new start" — bypass gate.
      if (site.status === 'running') await window.electron.stopServer(site.id)
      await window.electron.startServer(site.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restart server')
    }
  }, [])

  const handleRefreshLan = useCallback(async () => {
    try {
      setError(null)
      await window.electron.refreshLan()
    } catch (err) {
      setError(err instanceof Error ? err.message : '重新偵測區網失敗')
    }
  }, [])

  // TIM-225: toggle per-site LAN sharing. The main process persists the flag
  // and rebinds the running server, then broadcasts site-updated — so the UI
  // refreshes via onSiteUpdated and needs no local state here.
  const handleSetLanMode = useCallback(async (siteId: string, enabled: boolean) => {
    try {
      setError(null)
      await window.electron.setSiteLanMode(siteId, enabled)
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定區網分享失敗')
    }
  }, [])

  const handleShareSite = useCallback(async (siteId: string) => {
    try {
      setError(null)
      const site = sites.find((s) => s.id === siteId)
      // TIM-226: the effective downstream port differs by mode — passthrough
      // exposes its target port directly, proxy forwards to the target's port,
      // static only ever serves an allocated HTTP port.
      const exposedPort =
        site && site.serveMode === 'proxy'
          ? site.passthrough
            ? site.passthroughPort
            : extractPort(site.proxyTarget)
          : site?.port
      const serviceName = sensitivePortName(exposedPort)
      const startShare = (): void => {
        void withShareGate(siteId, () => window.electron.startQuickTunnel(siteId)).catch((err) =>
          setError(err instanceof Error ? err.message : '啟動 Tunnel 失敗')
        )
      }

      // Sensitive-port gate (TIM-226), run after any SSRF gate below.
      const portGatedShare = (): void => {
        if (
          site &&
          serviceName != null &&
          exposedPort != null &&
          !(settings.confirmedSensitivePorts ?? []).includes(exposedPort)
        ) {
          setSensitivePortDialog({ siteName: site.name, port: exposedPort, serviceName, proceed: startShare })
          return
        }
        startShare()
      }

      // TIM-312 (F06): SSRF gate FIRST — confirm before sharing a proxy target
      // whose host is cloud-metadata/link-local or internal (RFC1918).
      if (site && site.serveMode === 'proxy') {
        const risk = proxyTargetSsrfRisk(site.proxyTarget)
        let hostname = ''
        try {
          hostname = new URL(site.proxyTarget).hostname
        } catch {
          /* unparseable target — no SSRF gate */
        }
        if (risk && hostname && !(settings.confirmedSsrfHosts ?? []).includes(hostname)) {
          setSsrfRiskDialog({ siteName: site.name, hostname, risk, proceed: portGatedShare })
          return
        }
      }

      portGatedShare()
    } catch (err) {
      setError(err instanceof Error ? err.message : '啟動 Tunnel 失敗')
    }
  }, [withShareGate, sites, settings.confirmedSensitivePorts, settings.confirmedSsrfHosts])

  const handleStopSharing = useCallback(async (siteId: string) => {
    try {
      setError(null)
      await window.electron.stopTunnel(siteId)
    } catch (err) {
      setError(err instanceof Error ? err.message : '停止 Tunnel 失敗')
    }
  }, [])

  const handleStartFrpTunnel = useCallback(async (siteId: string) => {
    try {
      setError(null)
      await withShareGate(siteId, () => window.electron.startFrpTunnel(siteId))
    } catch (err) {
      setError(err instanceof Error ? err.message : '啟動 frp Tunnel 失敗')
    }
  }, [withShareGate])

  const handleStartBoreTunnel = useCallback(async (siteId: string) => {
    try {
      setError(null)
      await withShareGate(siteId, () => window.electron.startBoreTunnel(siteId))
    } catch (err) {
      setError(err instanceof Error ? err.message : '啟動 bore Tunnel 失敗')
    }
  }, [withShareGate])

  const handleSelectProvider = useCallback(async (siteId: string, provider: 'cloudflare' | 'frp' | 'bore') => {
    try {
      setError(null)
      await window.electron.setSiteProvider(siteId, provider)
    } catch (err) {
      setError(err instanceof Error ? err.message : '切換 Provider 失敗')
      throw err
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

  const handleAddCfAccount = useCallback(async () => {
    const state = await window.electron.addCfAccount()
    setCfAccounts(state)
    return state
  }, [])

  const handleRemoveCfAccount = useCallback(async (accountId: string) => {
    const state = await window.electron.removeCfAccount(accountId)
    setCfAccounts(state)
    return state
  }, [])

  const handleSetActiveCfAccount = useCallback(async (accountId: string) => {
    const state = await window.electron.setActiveCfAccount(accountId)
    setCfAccounts(state)
    return state
  }, [])

  const handleSetCfAccountLabel = useCallback(async (accountId: string, label: string | null) => {
    const state = await window.electron.setCfAccountLabel(accountId, label)
    setCfAccounts(state)
    return state
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
      await withShareGate(siteId, () => window.electron.bindFixedDomain(siteId, domain))
    } catch (err) {
      setError(err instanceof Error ? err.message : '綁定固定網域失敗')
      throw err
    }
  }, [withShareGate])

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
      await withShareGate(siteId, () => window.electron.startNamedTunnel(siteId))
    } catch (err) {
      setError(err instanceof Error ? err.message : '啟動 Named Tunnel 失敗')
    }
  }, [withShareGate])

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

  const runLicenseImport = useCallback(async (filePath: string) => {
    const res = await window.electron.importLicense(filePath)
    if (res.ok) {
      setError(null)
      setProActivated({ email: res.email })
    } else if (res.error !== 'cancelled') {
      setError(res.error)
    }
  }, [])

  // Entry point for drag-drop and the picker — confirm before replacing an
  // existing Pro license (US-105 scenario 5).
  const importLicenseAt = useCallback(
    async (filePath: string) => {
      if (tierState.isPro) {
        setPendingLicenseReplace(filePath)
        return
      }
      await runLicenseImport(filePath)
    },
    [tierState.isPro, runLicenseImport]
  )

  const handleActivatePro = useCallback(async () => {
    const filePath = await window.electron.pickLicense()
    if (filePath) await importLicenseAt(filePath)
  }, [importLicenseAt])

  // Soft-lock renew banner (US-107): dismiss is remembered per major.minor.
  const handleDismissRenewBanner = useCallback(() => {
    const mm = majorMinor(appVersion)
    if (mm) void updateSettings({ dismissedRenewBannerVersion: mm })
  }, [appVersion, updateSettings])

  // Path 3: offer to import a license sitting in ~/Downloads (Free users, once per session).
  useEffect(() => {
    if (tierState.isPro) return
    let cancelled = false
    window.electron
      .findDownloadedLicense?.()
      .then((p) => {
        if (!cancelled && p) setDownloadsLicensePrompt(p)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [tierState.isPro])

  const { isDraggingOver, dropZoneHandlers } = useSiteDropZone({
    onError: setError,
    onLicenseFile: importLicenseAt
  })
  usePasteToAdd({ onError: setError })
  useUrlAddNotification({ onSuccess: handleUrlAddSuccess, onError: setError })

  const isModalOpen = showAddModal || showSettings || showShortcuts || showShareHistory || !!confirmRemove || !!shareGateDialog || !!sensitivePortDialog || !!proActivated || !!pendingLicenseReplace || !!downloadsLicensePrompt
  const { selectedSiteId, setSelectedSiteId, listRef } = useKeyboardNavigation({
    sites,
    disabled: isModalOpen
  })

  const handleOpenSettings = useCallback(() => setShowSettings((v) => !v), [])
  const handleRemoveSiteConfirm = useCallback((site: SiteInfo) => setConfirmRemove(site), [])
  const handleShowShortcuts = useCallback(() => setShowShortcuts((v) => !v), [])

  useMenuCommands({
    sites,
    selectedSiteId,
    onAddSite: openAddModal,
    onOpenSettings: handleOpenSettings,
    onOpenInBrowser: handleOpenInBrowser,
    onRestartServer: handleRestartServer,
    onRemoveSite: handleRemoveSiteConfirm,
    onShowShortcuts: handleShowShortcuts
  })

  // Esc closes the topmost open modal/panel by clicking its [data-dismiss] overlay
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      const dismissibles = document.querySelectorAll<HTMLElement>('[data-dismiss]')
      if (dismissibles.length > 0) {
        dismissibles[dismissibles.length - 1].click()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [])

  // Selection + derived view-model for the master-detail layout
  const selectedSite = useMemo(() => sites.find((s) => s.id === selectedSiteId) ?? null, [sites, selectedSiteId])
  const counts = useMemo(() => summarizeSites(sites), [sites])
  const filteredSites = useMemo(() => filterSites(sites, searchQuery, filter), [sites, searchQuery, filter])
  // When the selected site is filtered out, fall back to the first visible site.
  const effectiveSelectedId = useMemo(
    () => (selectedSite && filteredSites.some((s) => s.id === selectedSite.id))
      ? selectedSite.id
      : (filteredSites[0]?.id ?? null),
    [selectedSite, filteredSites]
  )
  const detailSite = useMemo(
    () => sites.find((s) => s.id === effectiveSelectedId) ?? null,
    [sites, effectiveSelectedId]
  )

  // Drop a pending inline-rename if the detail pane stops showing that exact running site
  // (e.g. the site is stopped, or the filter fallback switches the detail to another site).
  useEffect(() => {
    const renamingVisible = !!detailSite && detailSite.status !== 'stopped' && detailSite.id === renamingId
    if (renamingId && !renamingVisible) setRenamingId(null)
  }, [detailSite, renamingId])

  // Request log follows the site actually shown in the detail pane (not just selectedSiteId)
  const selectedProxySiteId = detailSite?.serveMode === 'proxy' ? detailSite.id : null
  const { entries: requestLogEntries, selectedEntry: selectedRequestEntry, setSelectedEntry: setSelectedRequestEntry, clearLog: clearRequestLog } = useRequestLog(selectedProxySiteId)

  const hasRunningNamedTunnels = sites.some(
    (s) => s.tunnel?.type === 'named' && s.tunnel.status === 'running'
  )
  const hasFrpSites = useMemo(() => sites.some((s) => s.providerType === 'frp'), [sites])
  const hasBoreSites = useMemo(() => sites.some((s) => s.providerType === 'bore'), [sites])


  const showRenewBanner = shouldShowRenewBanner({
    isPro: tierState.isPro,
    softLocked: tierState.softLocked,
    appVersion,
    dismissedVersion: settings.dismissedRenewBannerVersion ?? ''
  })

  return (
    <div className="app-container">
      <div className="app-layout">
        <SettingsPanel
          open={showSettings}
          settings={settings}
          onClose={() => setShowSettings(false)}
          onUpdate={updateSettings}
          appVersion={appVersion}
          updateState={updateState}
          onCheckForUpdates={checkForUpdates}
          tierState={tierState}
          onUpgrade={() => setShowUpgradePro(true)}
          onActivatePro={handleActivatePro}
          providers={{
            cloudflare: { env: cfProvider.env, config: cfProvider.config, install: cfProvider.install, saveConfig: cfProvider.saveConfig },
            frp: { env: frpProvider.env, config: frpProvider.config, install: frpProvider.install, saveConfig: frpProvider.saveConfig },
            bore: { env: boreProvider.env, config: boreProvider.config, install: boreProvider.install, saveConfig: boreProvider.saveConfig },
          }}
          auth={auth}
          hasRunningNamedTunnels={hasRunningNamedTunnels}
          onLogin={handleLogin}
          onLogout={handleLogout}
          cfAccountsState={cfAccounts}
          onAddCfAccount={handleAddCfAccount}
          onRemoveCfAccount={handleRemoveCfAccount}
          onSetActiveCfAccount={handleSetActiveCfAccount}
          onSetCfAccountLabel={handleSetCfAccountLabel}
        />
        <div className="app-main">
      <header className="app-header">
        <h1>TunnelBox</h1>
        <div className="app-header-actions">
          {tierState.isPro && tierState.founderTier != null && (
            <FounderBadge founderTier={tierState.founderTier} size="sm" />
          )}
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
          <NotificationBell />
          <button
            className="btn btn-icon"
            onClick={() => setShowShareHistory((v) => !v)}
            title="Share History"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 1C4.1 1 1 4.1 1 8C1 11.9 4.1 15 8 15C11.9 15 15 11.9 15 8C15 4.1 11.9 1 8 1ZM8 13.5C4.9 13.5 2.5 11.1 2.5 8C2.5 4.9 4.9 2.5 8 2.5C11.1 2.5 13.5 4.9 13.5 8C13.5 11.1 11.1 13.5 8 13.5ZM8.5 4.5H7V9L11 11.3L11.8 10L8.5 8.2V4.5Z" fill="currentColor"/>
            </svg>
          </button>
          <button
            className="btn btn-icon"
            onClick={() => setShowSettings((v) => !v)}
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6.5 1L6.2 2.6C5.8 2.8 5.4 3 5.1 3.3L3.5 2.7L2 5.3L3.3 6.4C3.3 6.6 3.2 6.8 3.2 7C3.2 7.2 3.2 7.4 3.3 7.6L2 8.7L3.5 11.3L5.1 10.7C5.4 11 5.8 11.2 6.2 11.4L6.5 13H9.5L9.8 11.4C10.2 11.2 10.6 11 10.9 10.7L12.5 11.3L14 8.7L12.7 7.6C12.7 7.4 12.8 7.2 12.8 7C12.8 6.8 12.8 6.6 12.7 6.4L14 5.3L12.5 2.7L10.9 3.3C10.6 3 10.2 2.8 9.8 2.6L9.5 1H6.5ZM8 5C9.1 5 10 5.9 10 7C10 8.1 9.1 9 8 9C6.9 9 6 8.1 6 7C6 5.9 6.9 5 8 5Z" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </header>

      {showRenewBanner && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 16px',
            background: '#2a2410',
            borderBottom: '1px solid #5a4a1e',
            color: '#e8d8a0',
            fontSize: 13
          }}
        >
          <span style={{ flex: 1 }}>
            您的 Pro 授權已停止更新；目前版本仍可繼續無限期使用。要拿到新功能請續訂。
          </span>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => window.open('https://tunnelbox.teachers-assist.com/#pricing', '_blank')}
          >
            Renew
          </button>
          <button className="btn btn-sm" onClick={handleDismissRenewBanner}>
            Dismiss
          </button>
        </div>
      )}

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

      <ProviderInstallBar providers={[
        { type: 'cloudflare', label: providers.cloudflare.label, env: cfProvider.env, onInstall: cfProvider.install, hasRelevantSites: true, priority: providers.cloudflare.priority },
        { type: 'frp', label: providers.frp.label, env: frpProvider.env, onInstall: frpProvider.install, hasRelevantSites: hasFrpSites, priority: providers.frp.priority },
        { type: 'bore', label: providers.bore.label, env: boreProvider.env, onInstall: boreProvider.install, hasRelevantSites: hasBoreSites, priority: providers.bore.priority },
      ]} />

      {updateState.phase === 'available' && (
        <div className="success-bar">
          新版本 v{updateState.version} 可供下載
          <button className="btn btn-sm btn-primary" style={{ marginLeft: 8 }} onClick={downloadUpdate}>
            下載更新
          </button>
          <button className="success-close" onClick={dismissUpdate}>×</button>
        </div>
      )}

      {updateState.phase === 'downloading' && (
        <div className="success-bar">
          正在下載更新... {updateState.percent}%
        </div>
      )}

      <DashboardPanel sites={sites} />

      {sites.length === 0 ? (
        <div className="app-body">
          <div
            ref={listRef}
            className={`site-list${isDraggingOver ? ' site-list-drop-active' : ''}`}
            {...dropZoneHandlers}
          >
            {isDraggingOver && <div className="site-list-drop-hint">拖曳資料夾至此新增</div>}
            <div className="site-list-empty">
              <div className="empty-icon">📂</div>
              <p className="empty-title">尚未建立任何網頁</p>
              <p className="empty-desc">拖曳資料夾至此，或點擊下方按鈕來建立你的第一個網頁</p>
              <button className="btn btn-primary" onClick={openAddModal}>+ 新增網頁</button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <SiteSummaryStrip counts={counts} filter={filter} onFilterChange={setFilter} />
          <div className="md" ref={listRef} {...dropZoneHandlers}>
            <SiteRail
              sites={filteredSites}
              totalCount={counts.total}
              runningCount={counts.running}
              selectedSiteId={effectiveSelectedId}
              query={searchQuery}
              onQueryChange={setSearchQuery}
              onSelect={setSelectedSiteId}
              onAddSite={openAddModal}
              onOpenSettings={() => setShowSettings((v) => !v)}
            />
            {detailSite && detailSite.status !== 'stopped' ? (
              <SiteDetail
                site={detailSite}
                onOpenInBrowser={handleOpenInBrowser}
                onStartServer={handleStartServer}
                onStopServer={handleStopServer}
                onOpenFolder={handleOpenFolder}
                onRemove={setConfirmRemove}
                onRefreshLan={handleRefreshLan}
                onSetLanMode={handleSetLanMode}
                renamingId={renamingId}
                renameValue={renameValue}
                onRenameValueChange={setRenameValue}
                onStartRename={handleStartRename}
                onConfirmRename={handleConfirmRename}
                onCancelRename={handleCancelRename}
                consoleEnabled={settings.remoteConsoleEnabled}
                onOpenConsole={setConsoleForSiteId}
                cloudflaredAvailable={cfProvider.env.status === 'available'}
                authStatus={auth.status}
                onShare={handleShareSite}
                onStopSharing={handleStopSharing}
                onBindFixedDomain={handleBindFixedDomain}
                onUnbindFixedDomain={handleUnbindFixedDomain}
                onStartNamedTunnel={handleStartNamedTunnel}
                onStopNamedTunnel={handleStopNamedTunnel}
                onLogin={handleLogin}
                onStartFrpTunnel={handleStartFrpTunnel}
                onStartBoreTunnel={handleStartBoreTunnel}
                frpcEnv={frpProvider.env}
                boreEnv={boreProvider.env}
                onSelectProvider={handleSelectProvider}
                requestLogEntries={requestLogEntries}
                selectedRequestEntry={selectedRequestEntry}
                onSelectRequestEntry={setSelectedRequestEntry}
                onClearRequestLog={clearRequestLog}
                watcherUnhealthy={unhealthyWatchers.has(detailSite.id)}
                onRestartWatcher={() => handleRestartWatcher(detailSite.id)}
              />
            ) : detailSite ? (
              <SiteDetailEmpty variant="stopped" siteName={detailSite.name} onStart={() => handleStartServer(detailSite.id)} />
            ) : (
              <SiteDetailEmpty variant="none" />
            )}
          </div>
        </>
      )}
        </div>{/* end app-main */}
      </div>{/* end app-layout */}

      {/* Concurrent Shares Dialog (US-219) */}
      {shareGateDialog && (
        <ConcurrentSharesDialog
          targetSite={shareGateDialog.targetSite}
          activeSites={sites.filter((s) => shareGateDialog.activeIds.includes(s.id))}
          onStopAndStart={async (stopSiteId) => {
            setShareGateDialog(null)
            try {
              await window.electron.stopTunnel(stopSiteId)
              await shareGateDialog.startFn()
            } catch (err) {
              setError(err instanceof Error ? err.message : '切換 share 失敗')
            }
          }}
          onUpgrade={() => {
            setShareGateDialog(null)
          }}
          onCancel={() => setShareGateDialog(null)}
        />
      )}

      {/* Sensitive-port confirmation (TIM-226) */}
      {sensitivePortDialog && (
        <SensitivePortDialog
          siteName={sensitivePortDialog.siteName}
          port={sensitivePortDialog.port}
          serviceName={sensitivePortDialog.serviceName}
          onConfirm={(remember) => {
            const { port, proceed } = sensitivePortDialog
            setSensitivePortDialog(null)
            if (remember) {
              const current = settings.confirmedSensitivePorts ?? []
              if (!current.includes(port)) {
                void updateSettings({ confirmedSensitivePorts: [...current, port] })
              }
            }
            proceed()
          }}
          onCancel={() => setSensitivePortDialog(null)}
        />
      )}

      {/* SSRF (internal / metadata target) confirmation (TIM-312 / F06) */}
      {ssrfRiskDialog && (
        <SsrfRiskDialog
          siteName={ssrfRiskDialog.siteName}
          hostname={ssrfRiskDialog.hostname}
          risk={ssrfRiskDialog.risk}
          onConfirm={(remember) => {
            const { hostname, proceed } = ssrfRiskDialog
            setSsrfRiskDialog(null)
            if (remember) {
              const current = settings.confirmedSsrfHosts ?? []
              if (!current.includes(hostname)) {
                void updateSettings({ confirmedSsrfHosts: [...current, hostname] })
              }
            }
            proceed()
          }}
          onCancel={() => setSsrfRiskDialog(null)}
        />
      )}

      {/* Confirm Remove Modal */}
      {confirmRemove && (
        <div className="modal-overlay" data-dismiss onClick={() => setConfirmRemove(null)}>
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

      {/* Update Ready — Restart to Install */}
      {updateState.phase === 'ready' && (
        <div className="modal-overlay" data-dismiss onClick={dismissUpdate}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">更新已就緒</h2>
            <p className="confirm-text">
              版本 v{updateState.version} 已下載完成。重新啟動 TunnelBox 以完成安裝。
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={dismissUpdate}>稍後</button>
              <button className="btn btn-primary" onClick={installUpdate}>立即重新啟動</button>
            </div>
          </div>
        </div>
      )}

      {/* Force Update — Cannot be dismissed */}
      {forceUpdate?.blocked && (
        <div className="modal-overlay">
          <div className="modal">
            <h2 className="modal-title">必須更新</h2>
            <p className="confirm-text">
              {forceUpdate.config?.message || '此版本已不再支援，請更新至最新版本。'}
            </p>
            <div className="modal-actions">
              <a
                className="btn btn-primary"
                href={forceUpdate.config?.downloadUrl || 'https://github.com/tim80411/tunnelbox/releases/latest'}
                target="_blank"
                rel="noopener noreferrer"
              >
                下載最新版本
              </a>
            </div>
          </div>
        </div>
      )}

      <ShareHistoryPanel
        open={showShareHistory}
        onClose={() => setShowShareHistory(false)}
      />

      <ShortcutsPanel
        open={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />

      <RemoteConsolePanel
        siteId={consoleForSiteId || ''}
        open={!!consoleForSiteId}
        onClose={() => setConsoleForSiteId(null)}
        enabled={settings.remoteConsoleEnabled}
      />

      {selectedRequestEntry && (
        <RequestDetailPanel
          entry={selectedRequestEntry}
          onClose={() => setSelectedRequestEntry(null)}
        />
      )}

      {/* Add Site Modal */}
      {showAddModal && (
        <div className="modal-overlay" data-dismiss onClick={closeAddModal}>
          <div className="modal modal--add" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-head-title">
                <span className="modal-head-ic">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
                Add New Site
              </h2>
              <button className="panel-close" onClick={closeAddModal}>×</button>
            </div>

            <div className="modal-body">
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
                <label className="form-label">Service Mode</label>
                <div className="serve-mode-toggle">
                  <button
                    className={`serve-mode-btn${newServeMode === 'static' ? ' active' : ''}`}
                    onClick={() => { setNewServeMode('static'); setNewPassthrough(false) }}
                    type="button"
                  >
                    Static<small>Static files</small>
                  </button>
                  <button
                    className={`serve-mode-btn${newServeMode === 'proxy' && !newPassthrough ? ' active' : ''}`}
                    onClick={() => { setNewServeMode('proxy'); setNewPassthrough(false) }}
                    type="button"
                  >
                    Proxy<small>Reverse proxy</small>
                  </button>
                  <button
                    className={`serve-mode-btn${newServeMode === 'proxy' && newPassthrough ? ' active' : ''}`}
                    onClick={() => { setNewServeMode('proxy'); setNewPassthrough(true) }}
                    type="button"
                  >
                    Direct<small>Port forward</small>
                  </button>
                </div>
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
                  <span className="form-field-hint">TunnelBox serves the static files in this folder directly.</span>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">
                    {newPassthrough ? 'Port' : 'Proxy Target'}
                  </label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder={newPassthrough ? '3000' : 'http://localhost:3000 or 3000'}
                    value={newProxyTarget}
                    onChange={(e) => setNewProxyTarget(e.target.value)}
                  />
                  <span className="form-field-hint">
                    {newPassthrough
                      ? 'Tunnel points directly to this port — no local proxy server.'
                      : 'Forwards requests to a local server that is already running.'}
                  </span>
                </div>
              )}
            </div>

            <div className="modal-foot">
              <button className="btn" onClick={closeAddModal}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleConfirmAdd}
                disabled={adding || (newServeMode === 'proxy' ? !newProxyTarget.trim() : !newSitePath.trim())}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {adding ? 'Adding...' : 'Create Site'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Pro Modal */}
      {showUpgradePro && (
        <div className="modal-overlay" data-dismiss onClick={() => setShowUpgradePro(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Upgrade to Pro</h2>
            <p className="confirm-text" style={{ marginBottom: 12 }}>
              Pro is for 24/7 share mode, multi-client parallel workflows, and more.
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowUpgradePro(false)}>Maybe later</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setShowUpgradePro(false)
                  window.open('https://tunnelbox.teachers-assist.com/#pricing', '_blank')
                }}
              >
                Get Pro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pro activated confirmation (US-105) */}
      {proActivated && (
        <div className="modal-overlay" data-dismiss onClick={() => setProActivated(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Pro activated 🎉</h2>
            <p className="confirm-text" style={{ marginBottom: 12 }}>
              Thanks for supporting TunnelBox. Pro is now active for <strong>{proActivated.email}</strong>.
            </p>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setProActivated(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Replace existing license confirm (US-105 scenario 5) */}
      {pendingLicenseReplace && (
        <div className="modal-overlay" data-dismiss onClick={() => setPendingLicenseReplace(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Replace existing Pro license?</h2>
            <p className="confirm-text" style={{ marginBottom: 12 }}>
              You already have an active Pro license. Importing this file will replace it.
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setPendingLicenseReplace(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const p = pendingLicenseReplace
                  setPendingLicenseReplace(null)
                  void runLicenseImport(p)
                }}
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Found-in-Downloads prompt (US-105 path 3) */}
      {downloadsLicensePrompt && (
        <div className="modal-overlay" data-dismiss onClick={() => setDownloadsLicensePrompt(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Activate Pro?</h2>
            <p className="confirm-text" style={{ marginBottom: 12 }}>
              Found a license file in your Downloads. Import it to activate Pro?
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setDownloadsLicensePrompt(null)}>Not now</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const p = downloadsLicensePrompt
                  setDownloadsLicensePrompt(null)
                  void runLicenseImport(p)
                }}
              >
                Activate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
