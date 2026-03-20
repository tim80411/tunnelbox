import { Tray, Menu, nativeImage, app } from 'electron'
import path from 'node:path'
import type { SiteInfo } from '../shared/types'
import { createLogger } from './logger'

const log = createLogger('TrayManager')

let tray: Tray | null = null
let showWindowCallback: (() => void) | null = null

function getIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'tray', 'iconTemplate.png')
  }
  return path.join(app.getAppPath(), 'resources', 'tray', 'iconTemplate.png')
}

export function createTray(onShowWindow: () => void): void {
  showWindowCallback = onShowWindow

  const icon = nativeImage.createFromPath(getIconPath())
  icon.setTemplateImage(true)

  tray = new Tray(icon)
  tray.setToolTip('TunnelBox')

  // On Windows, left-click opens the main window
  if (process.platform === 'win32') {
    tray.on('click', () => {
      showWindowCallback?.()
    })
  }

  updateTrayMenu([])
  log.info('Tray created')
}

export function updateTrayMenu(sites: SiteInfo[]): void {
  if (!tray) return

  const menuItems: Electron.MenuItemConstructorOptions[] = []

  if (sites.length === 0) {
    menuItems.push({ label: '尚無站點', enabled: false })
  } else {
    for (const site of sites) {
      const statusLabel =
        site.status === 'running' ? '● ' :
        site.status === 'error' ? '✕ ' : '○ '

      let sublabel = ''
      if (site.tunnel?.publicUrl) {
        sublabel = site.tunnel.publicUrl
      } else if (site.status === 'running') {
        sublabel = site.url
      }

      menuItems.push({
        label: `${statusLabel}${site.name}`,
        sublabel,
        enabled: false
      })
    }
  }

  menuItems.push({ type: 'separator' })
  menuItems.push({
    label: '開啟 TunnelBox',
    click: () => showWindowCallback?.()
  })
  menuItems.push({
    label: '退出',
    click: () => {
      app.quit()
    }
  })

  const contextMenu = Menu.buildFromTemplate(menuItems)
  tray.setContextMenu(contextMenu)
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
