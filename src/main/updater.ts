import { app, ipcMain, BrowserWindow } from 'electron'
import https from 'node:https'
import { createLogger } from './logger'
import type { UpdateState, ForceUpdateConfig, ForceUpdateCheckResult } from '../shared/update-types'

const log = createLogger('Updater')

const FORCE_UPDATE_CONFIG_URL =
  'https://raw.githubusercontent.com/tim80411/tunnelbox/main/update-config.json'

// --- State Machine ---

let currentState: UpdateState = { phase: 'idle' }

function setState(next: UpdateState): void {
  currentState = next
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('update-state-changed', currentState)
  }
}

export function getUpdateState(): UpdateState {
  return currentState
}

// --- Semver Compare ---

function isVersionBelow(current: string, min: string): boolean {
  const c = current.split('.').map(Number)
  const m = min.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((c[i] ?? 0) < (m[i] ?? 0)) return true
    if ((c[i] ?? 0) > (m[i] ?? 0)) return false
  }
  return false
}

// --- Force Update ---

function fetchForceUpdateConfig(): Promise<ForceUpdateConfig | null> {
  return new Promise((resolve) => {
    const req = https.get(FORCE_UPDATE_CONFIG_URL, { timeout: 5000 }, (res) => {
      if (res.statusCode !== 200) {
        log.warn(`Force-update config returned HTTP ${res.statusCode}`)
        res.resume()
        resolve(null)
        return
      }
      let data = ''
      res.on('data', (chunk: Buffer) => { data += chunk.toString() })
      res.on('end', () => {
        try {
          const config = JSON.parse(data) as ForceUpdateConfig
          if (config.minVersion) {
            resolve(config)
          } else {
            resolve(null)
          }
        } catch {
          log.warn('Failed to parse force-update config')
          resolve(null)
        }
      })
    })
    req.on('error', (err) => {
      log.warn('Failed to fetch force-update config:', err.message)
      resolve(null)
    })
    req.on('timeout', () => {
      req.destroy()
      log.warn('Force-update config fetch timed out')
      resolve(null)
    })
  })
}

export async function checkForceUpdate(): Promise<ForceUpdateCheckResult> {
  const currentVersion = app.getVersion()
  const config = await fetchForceUpdateConfig()
  if (!config) {
    return { blocked: false, config: null, currentVersion }
  }
  const blocked = isVersionBelow(currentVersion, config.minVersion)
  return { blocked, config, currentVersion }
}

// --- Auto Updater ---

let autoUpdaterInitialized = false

function initAutoUpdater(): void {
  if (autoUpdaterInitialized) return
  if (!app.isPackaged) {
    log.info('Skipping auto-updater in dev mode')
    return
  }
  autoUpdaterInitialized = true

  // Dynamic import to avoid issues in dev mode
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { autoUpdater } = require('electron-updater')

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    setState({ phase: 'checking' })
  })

  autoUpdater.on('update-available', (info: { version: string }) => {
    setState({ phase: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    setState({ phase: 'not-available' })
  })

  autoUpdater.on('download-progress', (progress: { percent: number }) => {
    setState({ phase: 'downloading', percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info: { version: string }) => {
    setState({ phase: 'ready', version: info.version })
  })

  autoUpdater.on('error', (err: Error) => {
    log.error('Auto-updater error:', err.message)
    setState({ phase: 'error', message: err.message })
  })

  // Check on startup
  autoUpdater.checkForUpdates().catch((err: Error) => {
    log.warn('Startup update check failed:', err.message)
  })
}

export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) {
    setState({ phase: 'not-available' })
    return
  }
  initAutoUpdater()
  const { autoUpdater } = require('electron-updater')
  await autoUpdater.checkForUpdates()
}

export async function downloadUpdate(): Promise<void> {
  if (!app.isPackaged) return
  initAutoUpdater()
  const { autoUpdater } = require('electron-updater')
  await autoUpdater.downloadUpdate()
}

export function installUpdate(): void {
  if (!app.isPackaged) return
  const { autoUpdater } = require('electron-updater')
  autoUpdater.quitAndInstall()
}

// --- IPC Registration ---

export function registerUpdaterHandlers(): void {
  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  ipcMain.handle('get-update-state', () => {
    return getUpdateState()
  })

  ipcMain.handle('check-for-updates', async () => {
    await checkForUpdates()
  })

  ipcMain.handle('download-update', async () => {
    await downloadUpdate()
  })

  ipcMain.handle('install-update', () => {
    installUpdate()
  })

  ipcMain.handle('check-force-update', async () => {
    return await checkForceUpdate()
  })

  // Initialize auto-updater (no-op in dev mode)
  initAutoUpdater()
}
