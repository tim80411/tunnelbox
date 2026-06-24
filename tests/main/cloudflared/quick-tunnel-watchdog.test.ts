import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

// Electron BrowserWindow is touched by broadcastTunnelStatus; stub it out.
vi.mock('electron', () => ({
  app: { isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
}))

import { initQuickTunnel, getStderrSnapshot } from '../../../src/main/cloudflared/quick-tunnel'

/**
 * Minimal ProcessManager stand-in: only needs to be an EventEmitter with a
 * no-op kill(), which is all the quick-tunnel stderr/exit handlers use here.
 */
function makeFakePm() {
  const pm = new EventEmitter() as EventEmitter & { kill: (id: string) => void }
  pm.kill = vi.fn()
  return pm
}

describe('quick-tunnel watchdog wiring (TIM-222)', () => {
  let pm: ReturnType<typeof makeFakePm>

  beforeEach(() => {
    pm = makeFakePm()
    initQuickTunnel(pm as never)
  })

  it('captures the most recent stderr lines into a per-site ring buffer', () => {
    const siteId = 'site-buf-1'
    pm.emit('stderr', `quick-tunnel-${siteId}`, 'first line\nsecond line\n')
    pm.emit('stderr', `quick-tunnel-${siteId}`, 'third line\n')

    const snapshot = getStderrSnapshot(siteId)
    expect(snapshot).toContain('first line')
    expect(snapshot).toContain('second line')
    expect(snapshot).toContain('third line')
  })

  it('keeps stderr buffers isolated per site', () => {
    pm.emit('stderr', 'quick-tunnel-siteA', 'alpha\n')
    pm.emit('stderr', 'quick-tunnel-siteB', 'bravo\n')

    expect(getStderrSnapshot('siteA')).toContain('alpha')
    expect(getStderrSnapshot('siteA')).not.toContain('bravo')
    expect(getStderrSnapshot('siteB')).toContain('bravo')
  })

  it('ignores stderr from unrelated process ids', () => {
    pm.emit('stderr', 'named-tunnel-other', 'not mine\n')
    expect(getStderrSnapshot('other')).toBe('')
  })
})
