import path from 'node:path'
import fs from 'node:fs'
import { app, ipcMain } from 'electron'
import { createLogger } from './logger'

const log = createLogger('QuickAction')

const WORKFLOW_NAME = 'Add to TunnelBox.workflow'
const SERVICES_DIR = path.join(app.getPath('home'), 'Library', 'Services')

function getSourcePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'quick-action', WORKFLOW_NAME)
  }
  // Dev mode: use the project's resources directory
  return path.join(app.getAppPath(), 'resources', 'quick-action', WORKFLOW_NAME)
}

function getInstalledPath(): string {
  return path.join(SERVICES_DIR, WORKFLOW_NAME)
}

export function registerQuickActionHandlers(): void {
  ipcMain.handle('is-quick-action-installed', async () => {
    try {
      const installed = fs.existsSync(getInstalledPath())
      return installed
    } catch {
      return false
    }
  })

  ipcMain.handle('install-quick-action', async () => {
    const source = getSourcePath()
    const dest = getInstalledPath()

    if (!fs.existsSync(source)) {
      throw new Error('Quick Action workflow not found in app bundle')
    }

    // Ensure ~/Library/Services/ exists
    fs.mkdirSync(SERVICES_DIR, { recursive: true })

    // Remove old version if exists
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true })
    }

    // Copy workflow
    fs.cpSync(source, dest, { recursive: true })

    log.info(`Quick Action installed to ${dest}`)
  })
}
