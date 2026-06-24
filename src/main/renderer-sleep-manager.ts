import { BrowserWindow, app } from 'electron'
import { is } from '@electron-toolkit/utils'
import path from 'node:path'
import { createLogger } from './logger'

const log = createLogger('RendererSleepManager')

/**
 * TIM-228 — Tray-only sleep mode.
 *
 * When every TunnelBox window is hidden (the app is living in the tray), the
 * renderer process is still holding its full DOM + JS heap + GPU surfaces in
 * RAM even though nothing is on screen. This manager releases that memory while
 * the app sleeps in the tray and rehydrates it the moment the user re-opens the
 * window from the tray.
 *
 * WHY about:blank instead of destroying the window:
 *   The rest of the app (index.ts, app-menu, downgrade watcher, paste-forwarding)
 *   holds a long-lived `mainWindow` reference and calls `.show()/.focus()` on it.
 *   Destroying the BrowserWindow would dangle all of those. Instead we keep the
 *   (cheap, hidden) window object alive and navigate its webContents to
 *   `about:blank`, which tears down the React tree, the DOM, and frees the bulk
 *   of the renderer's working set. On wake we navigate back to the real renderer
 *   entry; React re-mounts and re-hydrates from the main process (App.tsx calls
 *   `window.electron.getSites()` + subscribes to `onSiteUpdated` on mount), so no
 *   site/tunnel state is lost — all of that lives in the main process stores and
 *   managers, not in the renderer.
 *
 * State safety: the renderer holds NO authoritative state. Sites, tunnels,
 * license tier, settings and history all live in main-process stores
 * (store.ts, server-manager, tunnel-provider-manager, settings-store, …). The
 * renderer is a pure view that rebuilds itself from main on every mount, which
 * is exactly what makes sleeping/waking it safe.
 */

const BLANK_URL = 'about:blank'

interface SleepManagerOptions {
  /** Returns the current main window (may be null/destroyed). */
  getWindow: () => BrowserWindow | null
  /**
   * Delay (ms) after the last window hides before the renderer is put to sleep.
   * A short grace period avoids thrashing when the user toggles quickly.
   */
  sleepDelayMs?: number
}

let asleep = false
let sleepTimer: NodeJS.Timeout | null = null
let started = false

function rendererEntryUrl(): string {
  // Mirror the load logic in index.ts:createWindow so wake restores the same view.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return process.env['ELECTRON_RENDERER_URL']
  }
  // file:// URL to the packaged renderer index.html.
  const filePath = path.join(__dirname, '../renderer/index.html')
  return `file://${filePath}`
}

/** True while the renderer is parked on about:blank. */
export function isAsleep(): boolean {
  return asleep
}

/**
 * Put the renderer to sleep: navigate it to about:blank to release the DOM/JS
 * heap. Safe to call repeatedly. No-op if already asleep or a window is visible.
 */
function sleepRenderer(getWindow: () => BrowserWindow | null): void {
  if (asleep) return
  const win = getWindow()
  if (!win || win.isDestroyed()) return
  // Guard: only sleep when nothing is actually visible.
  if (BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.isVisible())) {
    return
  }
  try {
    log.info('All windows hidden — releasing renderer (about:blank) to free RAM')
    // about:blank drops the React tree, DOM and most of the V8 heap. Electron
    // also tears down the associated GPU/raster surfaces once nothing paints.
    win.webContents.loadURL(BLANK_URL).catch((err) => {
      log.error('Failed to navigate renderer to about:blank:', err)
    })
    asleep = true
  } catch (err) {
    log.error('sleepRenderer failed:', err)
  }
}

/**
 * Wake the renderer: reload the real renderer entry and show the window.
 * Resolves once the renderer has finished loading (or immediately if not asleep).
 * Target: window visible and interactive in < 2s.
 */
export async function wakeRenderer(getWindow: () => BrowserWindow | null): Promise<void> {
  // Cancel any pending sleep — the user is coming back.
  if (sleepTimer) {
    clearTimeout(sleepTimer)
    sleepTimer = null
  }

  const win = getWindow()
  if (!win || win.isDestroyed()) {
    // Nothing to wake — the caller (tray click) will create a fresh window.
    return
  }

  if (!asleep) {
    // Renderer is still hydrated; just surface the window.
    win.show()
    win.focus()
    return
  }

  log.info('Waking renderer — reloading entry and rehydrating from main state')
  const start = Date.now()
  asleep = false

  await new Promise<void>((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      win.webContents.removeListener('did-finish-load', finish)
      win.webContents.removeListener('did-fail-load', onFail)
      log.info(`Renderer rehydrated in ${Date.now() - start}ms`)
      resolve()
    }
    const onFail = (_e: unknown, code: number, desc: string): void => {
      log.error(`Renderer reload failed (${code}): ${desc}`)
      finish()
    }

    win.webContents.once('did-finish-load', finish)
    win.webContents.once('did-fail-load', onFail)

    // Safety: never hang the wake — resolve after 2s even if load events are slow.
    setTimeout(finish, 2000).unref?.()

    win.webContents.loadURL(rendererEntryUrl()).catch((err) => {
      log.error('Failed to reload renderer entry:', err)
      finish()
    })
  })

  // Show as soon as the reload kicks off / completes so wake feels instant.
  if (!win.isDestroyed()) {
    win.show()
    win.focus()
  }
}

/**
 * Start tracking window visibility. Hooks the window's `hide` event (and the
 * app-level `window-all-closed`) so that once nothing is visible, the renderer
 * is put to sleep after a short grace delay.
 *
 * Idempotent — calling again rebinds to the current window.
 */
export function startRendererSleepTracking(opts: SleepManagerOptions): void {
  const { getWindow, sleepDelayMs = 1500 } = opts

  const scheduleSleep = (): void => {
    if (sleepTimer) clearTimeout(sleepTimer)
    sleepTimer = setTimeout(() => {
      sleepTimer = null
      sleepRenderer(getWindow)
    }, sleepDelayMs)
    sleepTimer.unref?.()
  }

  const bind = (win: BrowserWindow): void => {
    // When the window is hidden (tray-only close on Pro, or minimise-to-tray),
    // schedule the renderer to sleep.
    win.on('hide', () => {
      // Pending state is now hidden; if everything is hidden, schedule sleep.
      if (!BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.isVisible())) {
        scheduleSleep()
      }
    })
    // If the window is shown again before/while sleeping, make sure we wake.
    // This covers EVERY show path (tray click, dock activate, Pro→Free
    // downgrade in window-close-handler) without those callers needing to know
    // about sleep: a bare `win.show()` on a slept (about:blank) renderer would
    // otherwise surface a blank window, so rehydrate it here.
    win.on('show', () => {
      if (sleepTimer) {
        clearTimeout(sleepTimer)
        sleepTimer = null
      }
      if (asleep) {
        wakeRenderer(getWindow).catch((err) => log.error('wakeRenderer (show) failed:', err))
      }
    })
  }

  const win = getWindow()
  if (win && !win.isDestroyed()) {
    bind(win)
  }

  // Rebind whenever a new main window is created (e.g. after the user quits to
  // tray and reopens, index.ts may call createWindow again).
  app.on('browser-window-created', (_e, created) => {
    // Only track top-level app windows, not the transient error window.
    bind(created)
  })

  started = true
  log.info('Renderer sleep tracking started')
}

/** Test/debug helper: whether tracking has been initialised. */
export function isSleepTrackingStarted(): boolean {
  return started
}
