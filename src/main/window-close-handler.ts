import { dialog, Notification, BrowserWindow } from 'electron'
import Store from 'electron-store'
import { tierGate } from './license/tier-gate'
import { DAEMON_COPY } from '../shared/copy/pro-strings'
import { createLogger } from './logger'

const log = createLogger('WindowCloseHandler')

interface ClosePrefs {
  skipFreeCloseDialog: boolean
}

const closePrefs = new Store<ClosePrefs>({
  name: 'tunnelbox-close-prefs',
  defaults: { skipFreeCloseDialog: false }
})

let quitConfirmed = false

export function resetQuitConfirmed(): void {
  quitConfirmed = false
}

export function isQuitConfirmed(): boolean {
  return quitConfirmed
}

export function getSkipFreeCloseDialog(): boolean {
  return closePrefs.get('skipFreeCloseDialog')
}

export function setSkipFreeCloseDialog(value: boolean): void {
  closePrefs.set('skipFreeCloseDialog', value)
}

/**
 * Attach the close handler to mainWindow.
 * - Pro: hide window (app + tunnels stay alive in tray)
 * - Free + skip set: quit immediately
 * - Free first close: show one-shot dialog
 */
export function attachCloseHandler(
  mainWindow: BrowserWindow,
  performQuit: () => void,
  openUpgradeDialog: () => void
): void {
  mainWindow.on('close', (event) => {
    if (quitConfirmed) {
      // Cleanup path — let the window close and app.quit() proceed
      return
    }

    event.preventDefault()

    if (tierGate.isPro()) {
      mainWindow.hide()
      return
    }

    // Free tier
    if (closePrefs.get('skipFreeCloseDialog')) {
      quitConfirmed = true
      performQuit()
      return
    }

    showFreeCloseDialog(mainWindow, performQuit, openUpgradeDialog)
  })
}

function showFreeCloseDialog(
  mainWindow: BrowserWindow,
  performQuit: () => void,
  openUpgradeDialog: () => void
): void {
  // dialog.showMessageBox is async; preventDefault already called in the 'close' handler
  dialog
    .showMessageBox(mainWindow, {
      type: 'info',
      title: DAEMON_COPY.firstCloseTitle,
      message: DAEMON_COPY.firstCloseTitle,
      detail: DAEMON_COPY.firstCloseBody,
      buttons: [
        DAEMON_COPY.quitLabel,
        DAEMON_COPY.upgradeLabel,
        DAEMON_COPY.cancelLabel
      ],
      defaultId: 2, // Cancel
      cancelId: 2,
      checkboxLabel: DAEMON_COPY.dontShowAgainLabel,
      checkboxChecked: false
    })
    .then(({ response, checkboxChecked }) => {
      if (checkboxChecked) {
        closePrefs.set('skipFreeCloseDialog', true)
      }

      if (response === 0) {
        // "Quit & Stop Shares"
        quitConfirmed = true
        performQuit()
      } else if (response === 1) {
        // "Upgrade"
        openUpgradeDialog()
      }
      // response === 2 is Cancel — do nothing, window stays open
    })
    .catch((err) => {
      log.error('Close dialog error:', err)
    })
}

/**
 * Subscribe to tier changes so a Pro→Free downgrade brings the window back to foreground.
 * Returns an unsubscribe function.
 */
export function watchTierForDowngrade(getMainWindow: () => BrowserWindow | null): () => void {
  return tierGate.onChange((state) => {
    if (!state.isPro) {
      const win = getMainWindow()
      if (win && !win.isDestroyed()) {
        win.show()
        win.focus()
        showDowngradeNotification()
        log.info('Pro→Free downgrade: main window brought to foreground')
      }
    }
  })
}

function showDowngradeNotification(): void {
  if (Notification.isSupported()) {
    new Notification({
      title: 'TunnelBox',
      body: DAEMON_COPY.downgradeNotification
    }).show()
  }
}
