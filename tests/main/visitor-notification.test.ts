import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { VisitorEvent } from '../../src/shared/types'

// Mock Electron Notification
const mockNotificationShow = vi.fn()
const mockNotificationIsSupported = vi.fn().mockReturnValue(true)

vi.mock('electron', () => ({
  Notification: class MockNotification {
    static isSupported = mockNotificationIsSupported
    title: string
    body: string
    constructor(opts: { title: string; body: string }) {
      this.title = opts.title
      this.body = opts.body
    }
    show = mockNotificationShow
  }
}))

// Mock logger
vi.mock('../../src/main/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })
}))

// Mock settings-store — default: notifications enabled
const mockGetSettings = vi.fn().mockReturnValue({
  autoStartServers: false,
  defaultServeMode: 'static',
  visitorNotifications: true,
  remoteConsoleEnabled: false
})

vi.mock('../../src/main/settings-store', () => ({
  getSettings: () => mockGetSettings()
}))

// We need the real visitor-tracker but its logger is mocked
vi.mock('../../src/main/visitor-tracker', async () => {
  const { VisitorTracker } = await vi.importActual<typeof import('../../src/main/visitor-tracker')>(
    '../../src/main/visitor-tracker'
  )
  const instance = new VisitorTracker()
  return { visitorTracker: instance, VisitorTracker }
})

// Import after mocks
const { initVisitorNotifications, stopVisitorNotifications, _reset } = await import(
  '../../src/main/visitor-notification'
)
const { visitorTracker } = await import('../../src/main/visitor-tracker')

function makeEvent(overrides: Partial<VisitorEvent> = {}): VisitorEvent {
  return {
    siteId: 'site-1',
    visitorIp: '1.2.3.4',
    timestamp: Date.now(),
    requestPath: '/',
    siteName: 'Test Site',
    ...overrides
  }
}

describe('VisitorNotification', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _reset()
    mockNotificationShow.mockClear()
    mockNotificationIsSupported.mockReturnValue(true)
    mockGetSettings.mockReturnValue({
      autoStartServers: false,
      defaultServeMode: 'static',
      visitorNotifications: true,
      remoteConsoleEnabled: false
    })
    initVisitorNotifications()
  })

  afterEach(() => {
    stopVisitorNotifications()
    vi.useRealTimers()
  })

  it('shows notification on visitor event', () => {
    visitorTracker.emit('visitor', makeEvent())
    expect(mockNotificationShow).toHaveBeenCalledOnce()
  })

  it('does not show notification when setting is disabled', () => {
    mockGetSettings.mockReturnValue({
      autoStartServers: false,
      defaultServeMode: 'static',
      visitorNotifications: false,
      remoteConsoleEnabled: false
    })

    visitorTracker.emit('visitor', makeEvent())
    expect(mockNotificationShow).not.toHaveBeenCalled()
  })

  it('batches multiple visitors within 10s for the same site', () => {
    // First visitor — immediate notification
    visitorTracker.emit('visitor', makeEvent({ visitorIp: '1.1.1.1' }))
    expect(mockNotificationShow).toHaveBeenCalledTimes(1)

    // Second visitor within 10s — batched, no immediate extra notification
    visitorTracker.emit('visitor', makeEvent({ visitorIp: '2.2.2.2' }))
    expect(mockNotificationShow).toHaveBeenCalledTimes(1)

    // Advance past batch window
    vi.advanceTimersByTime(10_000)
    expect(mockNotificationShow).toHaveBeenCalledTimes(2) // summary notification
  })

  it('does not crash when OS notifications unsupported', () => {
    mockNotificationIsSupported.mockReturnValue(false)
    expect(() => {
      visitorTracker.emit('visitor', makeEvent())
    }).not.toThrow()
  })

  it('handles events from different sites independently', () => {
    visitorTracker.emit('visitor', makeEvent({ siteId: 'a', siteName: 'A' }))
    visitorTracker.emit('visitor', makeEvent({ siteId: 'b', siteName: 'B' }))
    // Each site gets its own immediate notification
    expect(mockNotificationShow).toHaveBeenCalledTimes(2)
  })
})
