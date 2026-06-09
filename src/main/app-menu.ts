import { Menu, app, BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { createLogger } from './logger'
import { tierGate } from './license/tier-gate'
import { DAEMON_COPY } from '../shared/copy/pro-strings'

const log = createLogger('AppMenu')

function sendToFocusedWindow(channel: string): void {
  const win = BrowserWindow.getFocusedWindow()
  if (win) {
    win.webContents.send(channel)
  } else {
    log.debug(`No focused window for channel: ${channel}`)
  }
}

export function setAppMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    // macOS app menu (first menu = app name)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              {
                label: 'Settings...',
                accelerator: 'Cmd+,',
                click: (): void => sendToFocusedWindow('menu:open-settings')
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),

    // File
    {
      label: 'File',
      submenu: [
        {
          label: 'New Site',
          accelerator: 'CmdOrCtrl+N',
          click: (): void => sendToFocusedWindow('menu:add-site')
        },
        ...(!isMac
          ? [
              {
                label: 'Settings',
                accelerator: 'Ctrl+,',
                click: (): void => sendToFocusedWindow('menu:open-settings')
              }
            ]
          : []),
        { type: 'separator' as const },
        isMac ? { role: 'close' as const } : { role: 'quit' as const }
      ]
    },

    // Edit (required for native text editing on macOS)
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const }
      ]
    },

    // Sites
    {
      label: 'Sites',
      submenu: [
        {
          label: 'Open in Browser',
          accelerator: 'CmdOrCtrl+O',
          click: (): void => sendToFocusedWindow('menu:open-in-browser')
        },
        {
          label: 'Restart Server',
          accelerator: 'CmdOrCtrl+R',
          click: (): void => sendToFocusedWindow('menu:restart-server')
        },
        { type: 'separator' as const },
        {
          label: 'Remove Site',
          accelerator: 'CmdOrCtrl+Backspace',
          click: (): void => sendToFocusedWindow('menu:remove-site')
        }
      ]
    },

    // Window
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac
          ? [{ type: 'separator' as const }, { role: 'front' as const }]
          : []),
        { type: 'separator' as const },
        {
          label: tierGate.isPro()
            ? DAEMON_COPY.menuRunInBackgroundPro
            : DAEMON_COPY.menuRunInBackgroundFree,
          enabled: tierGate.isPro(),
          toolTip: tierGate.isPro() ? undefined : DAEMON_COPY.menuRunInBackgroundTooltip,
          click: (): void => {
            if (tierGate.isPro()) {
              // Hide all windows — app stays alive in tray
              BrowserWindow.getAllWindows().forEach((w) => w.hide())
            } else {
              // Tell renderer to show upgrade dialog
              sendToFocusedWindow('open-upgrade-dialog')
            }
          }
        }
      ]
    },

    // Help
    {
      label: 'Help',
      submenu: [
        {
          label: 'Keyboard Shortcuts',
          accelerator: 'CmdOrCtrl+/',
          click: (): void => sendToFocusedWindow('menu:show-shortcuts')
        }
      ]
    },

    // Developer (dev mode only — never appears in production builds)
    ...(is.dev
      ? [
          {
            label: 'Developer',
            submenu: [
              {
                label: `Tier: ${tierGate.isPro() ? 'Pro ✓' : 'Free'}  — click to toggle`,
                click: (): void => {
                  const next = tierGate.isPro()
                    ? { isPro: false, tier: 'free' as const, softLocked: false, founderTier: null }
                    : { isPro: true, tier: 'pro' as const, softLocked: false, founderTier: 1 }
                  tierGate._forceState(next)
                  // Rebuild menu so label reflects new tier
                  setAppMenu()
                  log.info(`[DEV] Tier forced to: ${next.tier}`)
                }
              },
              {
                label: 'Force Tier: Free',
                click: (): void => {
                  tierGate._forceState({
                    isPro: false,
                    tier: 'free',
                    softLocked: false,
                    founderTier: null
                  })
                  setAppMenu()
                  log.info('[DEV] Tier forced to: free')
                }
              },
              {
                label: 'Force Tier: Pro (founder #1)',
                click: (): void => {
                  tierGate._forceState({
                    isPro: true,
                    tier: 'pro',
                    softLocked: false,
                    founderTier: 1
                  })
                  setAppMenu()
                  log.info('[DEV] Tier forced to: pro (founder #1)')
                }
              },
              {
                label: 'Force Tier: Pro (no badge)',
                click: (): void => {
                  tierGate._forceState({
                    isPro: true,
                    tier: 'pro',
                    softLocked: false,
                    founderTier: null
                  })
                  setAppMenu()
                  log.info('[DEV] Tier forced to: pro (no badge)')
                }
              },
              { type: 'separator' as const },
              {
                label: 'Log Current Tier State',
                click: (): void => {
                  log.info('[DEV] Tier state:', {
                    isPro: tierGate.isPro(),
                    tier: tierGate.getTier(),
                    founderTier: tierGate.getFounderTier(),
                    softLocked: tierGate.isSoftLocked()
                  })
                }
              }
            ]
          }
        ]
      : [])
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  log.info('Application menu installed')
}
