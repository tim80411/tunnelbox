import path from 'node:path'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { app, ipcMain } from 'electron'
import { getResourcePath } from './resource-path'
import { createLogger } from './logger'

const log = createLogger('QuickAction')

const isMac = process.platform === 'darwin'
const isWin = process.platform === 'win32'

// --- macOS ---

const WORKFLOW_NAME = 'Add to TunnelBox.workflow'

function getMacServicesDir(): string {
  return path.join(app.getPath('home'), 'Library', 'Services')
}

function getMacSourcePath(): string {
  return getResourcePath('quick-action', WORKFLOW_NAME)
}

function getMacInstalledPath(): string {
  return path.join(getMacServicesDir(), WORKFLOW_NAME)
}

function isMacInstalled(): boolean {
  return fs.existsSync(getMacInstalledPath())
}

function installMac(): void {
  const source = getMacSourcePath()
  const dest = getMacInstalledPath()

  if (!fs.existsSync(source)) {
    throw new Error('Quick Action workflow not found in app bundle')
  }

  fs.mkdirSync(getMacServicesDir(), { recursive: true })

  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true })
  }

  fs.cpSync(source, dest, { recursive: true })
  log.info(`Quick Action installed to ${dest}`)
}

// --- Windows ---

const REG_KEY = 'HKCU\\Software\\Classes\\Directory\\shell\\TunnelBox'

function getExePath(): string {
  if (app.isPackaged) {
    return app.getPath('exe')
  }
  return process.execPath
}

function isWindowsInstalled(): boolean {
  try {
    execSync(`reg query "${REG_KEY}" /ve`, { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function installWindows(): void {
  const exe = getExePath()

  // Create the shell key with display name
  execSync(`reg add "${REG_KEY}" /ve /d "Add to TunnelBox" /f`, { stdio: 'pipe' })
  execSync(`reg add "${REG_KEY}" /v "Icon" /d "${exe}" /f`, { stdio: 'pipe' })

  // Create the command subkey
  // %V is replaced by Windows Explorer with the selected folder path
  const command = `"${exe}" "tunnelbox://add?path=%V"`
  execSync(`reg add "${REG_KEY}\\command" /ve /d "${command}" /f`, { stdio: 'pipe' })

  log.info('Windows Explorer context menu registered')
}

function uninstallWindows(): void {
  try {
    execSync(`reg delete "${REG_KEY}" /f`, { stdio: 'pipe' })
    log.info('Windows Explorer context menu removed')
  } catch {
    // Key may not exist
  }
}

// --- Unified handlers ---

export function registerQuickActionHandlers(): void {
  ipcMain.handle('is-quick-action-installed', async () => {
    try {
      if (isMac) return isMacInstalled()
      if (isWin) return isWindowsInstalled()
      return false // Linux: not supported yet
    } catch {
      return false
    }
  })

  ipcMain.handle('install-quick-action', async () => {
    if (isMac) {
      installMac()
    } else if (isWin) {
      installWindows()
    } else {
      throw new Error('Context menu integration is not supported on this platform')
    }
  })

  ipcMain.handle('uninstall-quick-action', async () => {
    if (isWin) {
      uninstallWindows()
    } else if (isMac) {
      const dest = getMacInstalledPath()
      if (fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true })
        log.info('Quick Action removed')
      }
    }
  })
}
