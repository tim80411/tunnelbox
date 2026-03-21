import { ipcMain, BrowserWindow } from 'electron'
import * as settingsStore from './settings-store'
import type { AppSettings } from '../shared/types'

function broadcastSettingsChanged(settings: AppSettings): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('settings-changed', settings)
  }
}

export function registerSettingsIpcHandlers(): void {
  ipcMain.handle('get-settings', async () => {
    return settingsStore.getSettings()
  })

  ipcMain.handle('update-settings', async (_event, patch: Partial<AppSettings>) => {
    const updated = settingsStore.updateSettings(patch)
    broadcastSettingsChanged(updated)
    return updated
  })
}
