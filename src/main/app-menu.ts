import { Menu, app, BrowserWindow } from 'electron'
import { createLogger } from './logger'

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
          : [])
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  log.info('Application menu installed')
}
