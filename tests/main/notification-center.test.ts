import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { VisitorEvent, NotificationItem } from '../../src/shared/types'

// Mock electron
const mockSend = vi.fn()
const mockGetAllWindows = vi.fn().mockReturnValue([
  { webContents: { send: mockSend } }
])

const mockHandle = vi.fn()
const mockRemoveHandler = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => mockGetAllWindows()
  },
  ipcMain: {
    handle: (...args: unknown[]) => mockHandle(...args),
    removeHandler: (...args: unknown[]) => mockRemoveHandler(...args)
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

// Use real visitor-tracker with mocked logger
vi.mock('../../src/main/visitor-tracker', async () => {
  const { VisitorTracker } = await vi.importActual<typeof import('../../src/main/visitor-tracker')>(
    '../../src/main/visitor-tracker'
  )
  const instance = new VisitorTracker()
  return { visitorTracker: instance, VisitorTracker }
})

// Import after mocks
const { initNotificationCenter, stopNotificationCenter, _reset, _getNotifications, _getUnreadCount } = await import(
  '../../src/main/notification-center'
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

describe('NotificationCenter', () => {
  beforeEach(() => {
    _reset()
    mockSend.mockClear()
    mockHandle.mockClear()
    mockRemoveHandler.mockClear()
    mockGetAllWindows.mockReturnValue([
      { webContents: { send: mockSend } }
    ])
    initNotificationCenter()
  })

  afterEach(() => {
    _reset()
  })

  it('records a notification when a visitor event is emitted', () => {
    visitorTracker.emit('visitor', makeEvent())
    const notifications = _getNotifications()
    expect(notifications).toHaveLength(1)
    expect(notifications[0].visitorIp).toBe('1.2.3.4')
    expect(notifications[0].siteName).toBe('Test Site')
    expect(notifications[0].siteId).toBe('site-1')
    expect(notifications[0].read).toBe(false)
  })

  it('sends IPC event on new notification', () => {
    visitorTracker.emit('visitor', makeEvent())
    expect(mockSend).toHaveBeenCalledWith(
      'notification-center:new',
      expect.objectContaining({
        visitorIp: '1.2.3.4',
        siteName: 'Test Site',
        read: false
      })
    )
  })

  it('tracks unread count correctly', () => {
    visitorTracker.emit('visitor', makeEvent({ visitorIp: '1.1.1.1' }))
    visitorTracker.emit('visitor', makeEvent({ visitorIp: '2.2.2.2' }))
    visitorTracker.emit('visitor', makeEvent({ visitorIp: '3.3.3.3' }))
    expect(_getUnreadCount()).toBe(3)
  })

  it('registers IPC handlers on init', () => {
    const channels = mockHandle.mock.calls.map((call) => call[0])
    expect(channels).toContain('notification-center:get-all')
    expect(channels).toContain('notification-center:mark-read')
    expect(channels).toContain('notification-center:mark-all-read')
    expect(channels).toContain('notification-center:get-unread-count')
  })

  it('get-all handler returns notifications in reverse order (newest first)', () => {
    visitorTracker.emit('visitor', makeEvent({ visitorIp: '1.1.1.1', timestamp: 1000 }))
    visitorTracker.emit('visitor', makeEvent({ visitorIp: '2.2.2.2', timestamp: 2000 }))

    const getAllHandler = mockHandle.mock.calls.find((c) => c[0] === 'notification-center:get-all')
    expect(getAllHandler).toBeDefined()
    const result: NotificationItem[] = getAllHandler![1]()
    expect(result).toHaveLength(2)
    expect(result[0].visitorIp).toBe('2.2.2.2')
    expect(result[1].visitorIp).toBe('1.1.1.1')
  })

  it('mark-read handler marks a notification as read and broadcasts update', () => {
    visitorTracker.emit('visitor', makeEvent())
    mockSend.mockClear()

    const notifications = _getNotifications()
    const id = notifications[0].id

    const markReadHandler = mockHandle.mock.calls.find((c) => c[0] === 'notification-center:mark-read')
    expect(markReadHandler).toBeDefined()
    markReadHandler![1]({}, id)

    expect(notifications[0].read).toBe(true)
    expect(_getUnreadCount()).toBe(0)
    expect(mockSend).toHaveBeenCalledWith('notification-center:updated', 0)
  })

  it('mark-all-read handler marks all notifications as read', () => {
    visitorTracker.emit('visitor', makeEvent({ visitorIp: '1.1.1.1' }))
    visitorTracker.emit('visitor', makeEvent({ visitorIp: '2.2.2.2' }))
    expect(_getUnreadCount()).toBe(2)

    mockSend.mockClear()

    const markAllHandler = mockHandle.mock.calls.find((c) => c[0] === 'notification-center:mark-all-read')
    expect(markAllHandler).toBeDefined()
    markAllHandler![1]({})

    expect(_getUnreadCount()).toBe(0)
    expect(mockSend).toHaveBeenCalledWith('notification-center:updated', 0)
  })

  it('get-unread-count handler returns correct count', () => {
    visitorTracker.emit('visitor', makeEvent({ visitorIp: '1.1.1.1' }))
    visitorTracker.emit('visitor', makeEvent({ visitorIp: '2.2.2.2' }))

    const countHandler = mockHandle.mock.calls.find((c) => c[0] === 'notification-center:get-unread-count')
    expect(countHandler).toBeDefined()
    expect(countHandler![1]()).toBe(2)
  })

  it('clears notifications on reset (simulating app restart)', () => {
    visitorTracker.emit('visitor', makeEvent())
    expect(_getNotifications()).toHaveLength(1)

    _reset()
    expect(_getNotifications()).toHaveLength(0)
    expect(_getUnreadCount()).toBe(0)
  })

  it('does not duplicate handlers on multiple init calls', () => {
    const handleCountBefore = mockHandle.mock.calls.length
    // Second init should be a no-op
    initNotificationCenter()
    expect(mockHandle.mock.calls.length).toBe(handleCountBefore)
  })

  it('mark-read on already-read notification does not broadcast', () => {
    visitorTracker.emit('visitor', makeEvent())
    const id = _getNotifications()[0].id

    const markReadHandler = mockHandle.mock.calls.find((c) => c[0] === 'notification-center:mark-read')!
    // Mark read once
    markReadHandler[1]({}, id)
    mockSend.mockClear()

    // Mark read again — should not broadcast
    markReadHandler[1]({}, id)
    expect(mockSend).not.toHaveBeenCalledWith('notification-center:updated', expect.anything())
  })
})
