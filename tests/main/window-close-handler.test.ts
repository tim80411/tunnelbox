import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TierState } from '../../src/shared/license-types'

// --- Electron mock ---
const mockDialogShowMessageBox = vi.fn()
const mockNotificationShow = vi.fn()
const mockNotificationIsSupported = vi.fn().mockReturnValue(true)

vi.mock('electron', () => ({
  dialog: { showMessageBox: mockDialogShowMessageBox },
  Notification: class {
    static isSupported = mockNotificationIsSupported
    body = ''
    constructor(opts: { title: string; body: string }) { this.body = opts.body }
    show = mockNotificationShow
  }
}))

// --- electron-store mock ---
const storeData: Record<string, unknown> = {}
vi.mock('electron-store', () => ({
  default: class {
    private defaults: Record<string, unknown>
    constructor(opts: { defaults?: Record<string, unknown> }) {
      this.defaults = opts.defaults ?? {}
    }
    get(key: string) { return storeData[key] ?? this.defaults[key] }
    set(key: string, val: unknown) { storeData[key] = val }
  }
}))

// --- tier-gate mock (overridden per test) ---
let mockIsPro = false
vi.mock('../../src/main/license/tier-gate', () => ({
  tierGate: {
    isPro: () => mockIsPro,
    onChange: vi.fn().mockReturnValue(vi.fn())
  }
}))

// --- logger mock ---
vi.mock('../../src/main/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
}))

// Helper: create a minimal BrowserWindow mock
function makeMockWindow() {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {}
  return {
    on(event: string, cb: (...args: unknown[]) => void) {
      handlers[event] = handlers[event] ?? []
      handlers[event].push(cb)
    },
    emit(event: string, ...args: unknown[]) {
      for (const cb of handlers[event] ?? []) cb(...args)
    },
    hide: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    isDestroyed: () => false
  }
}

describe('window-close-handler', () => {
  beforeEach(async () => {
    // Reset store + quit state between tests
    for (const k of Object.keys(storeData)) delete storeData[k]
    mockIsPro = false
    mockDialogShowMessageBox.mockClear()
    mockNotificationShow.mockClear()
    // Re-import to get fresh module state (quitConfirmed flag)
    vi.resetModules()
  })

  it('Scenario 1: Pro — close hides window, does not quit', async () => {
    mockIsPro = true
    const { attachCloseHandler } = await import('../../src/main/window-close-handler')
    const win = makeMockWindow()
    const quitFn = vi.fn()
    const upgradeFn = vi.fn()

    attachCloseHandler(win as never, quitFn, upgradeFn)

    const fakeEvent = { preventDefault: vi.fn() }
    win.emit('close', fakeEvent)

    expect(fakeEvent.preventDefault).toHaveBeenCalled()
    expect(win.hide).toHaveBeenCalled()
    expect(quitFn).not.toHaveBeenCalled()
  })

  it('Scenario 2: Free first close — dialog shown with correct buttons', async () => {
    mockIsPro = false
    mockDialogShowMessageBox.mockResolvedValue({ response: 2, checkboxChecked: false }) // Cancel
    const { attachCloseHandler } = await import('../../src/main/window-close-handler')
    const win = makeMockWindow()
    const quitFn = vi.fn()
    const upgradeFn = vi.fn()

    attachCloseHandler(win as never, quitFn, upgradeFn)
    win.emit('close', { preventDefault: vi.fn() })

    // Dialog must be shown
    expect(mockDialogShowMessageBox).toHaveBeenCalledOnce()
    const callArgs = mockDialogShowMessageBox.mock.calls[0][1]
    expect(callArgs.buttons).toHaveLength(3)
    // Use-case framing: no paywall language
    expect(callArgs.title).not.toMatch(/paywall|locked|unlock|can't|cannot/i)
    expect(callArgs.detail).toMatch(/one-shot demo|24\/7/i)
  })

  it('Scenario 3: Free confirms quit — quit called, dialog sets checkboxChecked=false', async () => {
    mockIsPro = false
    mockDialogShowMessageBox.mockResolvedValue({ response: 0, checkboxChecked: false })
    const { attachCloseHandler } = await import('../../src/main/window-close-handler')
    const win = makeMockWindow()
    const quitFn = vi.fn()

    attachCloseHandler(win as never, quitFn, vi.fn())
    win.emit('close', { preventDefault: vi.fn() })
    await new Promise(r => setTimeout(r, 0)) // flush promise

    expect(quitFn).toHaveBeenCalledOnce()
  })

  it('Scenario 4: Free with "don\'t show again" set — direct quit, no dialog', async () => {
    mockIsPro = false
    storeData['skipFreeCloseDialog'] = true
    const { attachCloseHandler } = await import('../../src/main/window-close-handler')
    const win = makeMockWindow()
    const quitFn = vi.fn()

    attachCloseHandler(win as never, quitFn, vi.fn())
    win.emit('close', { preventDefault: vi.fn() })

    expect(mockDialogShowMessageBox).not.toHaveBeenCalled()
    expect(quitFn).toHaveBeenCalledOnce()
  })

  it('Scenario 6: Free upgrade click — upgrade dialog opened, app not quit', async () => {
    mockIsPro = false
    mockDialogShowMessageBox.mockResolvedValue({ response: 1, checkboxChecked: false }) // Upgrade
    const { attachCloseHandler } = await import('../../src/main/window-close-handler')
    const win = makeMockWindow()
    const quitFn = vi.fn()
    const upgradeFn = vi.fn()

    attachCloseHandler(win as never, quitFn, upgradeFn)
    win.emit('close', { preventDefault: vi.fn() })
    await new Promise(r => setTimeout(r, 0))

    expect(upgradeFn).toHaveBeenCalledOnce()
    expect(quitFn).not.toHaveBeenCalled()
  })

  it('"Don\'t show again" checkbox persists skipFreeCloseDialog', async () => {
    mockIsPro = false
    mockDialogShowMessageBox.mockResolvedValue({ response: 0, checkboxChecked: true })
    const { attachCloseHandler, getSkipFreeCloseDialog } = await import('../../src/main/window-close-handler')
    const win = makeMockWindow()

    attachCloseHandler(win as never, vi.fn(), vi.fn())
    win.emit('close', { preventDefault: vi.fn() })
    await new Promise(r => setTimeout(r, 0))

    expect(getSkipFreeCloseDialog()).toBe(true)
  })
})
