import { ipcMain, dialog, BrowserWindow } from 'electron'
import { importLicenseFromFile, findDownloadedLicense } from './import'

export function registerLicenseImportIpc(): void {
  // Path 1 (drag-drop) — renderer resolves the dropped file path and passes it here.
  ipcMain.handle('license:import', (_e, filePath: string) => importLicenseFromFile(filePath))

  // Path 2 (Settings → Activate Pro) — native file picker; returns the chosen
  // path so the renderer runs the same import (incl. replace-confirm) as drag-drop.
  ipcMain.handle('license:pick', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const opts = {
      title: 'Activate Pro — select your license file',
      filters: [{ name: 'License', extensions: ['json', 'dat'] }],
      properties: ['openFile' as const]
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })

  // Path 3 (startup scan) — renderer asks whether a license is sitting in ~/Downloads.
  ipcMain.handle('license:find-downloaded', () => findDownloadedLicense())
}
