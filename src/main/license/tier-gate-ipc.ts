import { ipcMain, BrowserWindow } from 'electron'
import { tierGate } from './tier-gate'
import type { TierState } from '../../shared/license-types'

export function registerTierGateIpc(): void {
  ipcMain.handle('tier-gate:get-state', (): TierState => ({
    isPro: tierGate.isPro(),
    tier: tierGate.getTier(),
    softLocked: tierGate.isSoftLocked(),
    founderTier: tierGate.getFounderTier()
  }))

  ipcMain.handle('tier-gate:refresh', async (): Promise<TierState> => {
    await tierGate.refresh()
    return {
      isPro: tierGate.isPro(),
      tier: tierGate.getTier(),
      softLocked: tierGate.isSoftLocked(),
      founderTier: tierGate.getFounderTier()
    }
  })

  // Broadcast state changes to all renderer windows
  tierGate.onChange((state: TierState) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('tier-gate:changed', state)
      }
    }
  })
}
