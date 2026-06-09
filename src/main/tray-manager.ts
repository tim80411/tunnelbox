import { Tray, Menu, nativeImage, app } from 'electron'
import type { SiteInfo } from '../shared/types'
import { getResourcePath } from './resource-path'
import { createLogger } from './logger'

const log = createLogger('TrayManager')

const STATUS_ICONS: Record<SiteInfo['status'], string> = {
  running: '● ',
  stopped: '○ ',
  error: '✕ '
}

let tray: Tray | null = null
let showWindowCallback: (() => void) | null = null

export function createTray(onShowWindow: () => void): void {
  showWindowCallback = onShowWindow

  const iconPath = getResourcePath('tray', 'iconTemplate.png')
  const icon = nativeImage.createFromPath(iconPath)
  // setTemplateImage is macOS-only; makes the icon adapt to light/dark menu bar
  if (process.platform === 'darwin') {
    icon.setTemplateImage(true)
  }

  log.info(`Tray icon path: ${iconPath}`)
  log.info(`Tray icon isEmpty=${icon.isEmpty()} size=${JSON.stringify(icon.getSize())}`)

  tray = new Tray(icon)
  tray.setToolTip('TunnelBox')

  // Text fallback in case the template icon fails to render (e.g. unsigned dev build).
  if (process.platform === 'darwin') {
    tray.setTitle('TB')
  }

  // On Windows and Linux, left-click opens the main window
  if (process.platform !== 'darwin') {
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
      let sublabel = ''
      if (site.tunnel?.publicUrl) {
        sublabel = site.tunnel.publicUrl
      } else if (site.status === 'running') {
        sublabel = site.url
      }

      menuItems.push({
        label: `${STATUS_ICONS[site.status]}${site.name}`,
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
