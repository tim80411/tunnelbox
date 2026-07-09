import { describe, it, expect } from 'vitest'
import type { SiteInfo } from '../../../src/shared/types'
import {
  siteMode, siteState, railUrl, primaryUrl, summarizeSites, filterSites, localLane, lanLane,
  SITE_STATE_LABEL, RAIL_MODE_LABEL
} from '../../../src/renderer/src/utils/site-view'

const staticRunningShared: SiteInfo = {
  id: 'a', name: 'portfolio-2026', serveMode: 'static', folderPath: '~/Sites/p',
  port: 3014, status: 'running', url: 'http://localhost:3014',
  // lanMode on → backend emits a lanUrl (TIM-225: lanUrl only present when LAN sharing on)
  lanMode: true, lanUrl: 'http://192.168.1.24:3014', lanInterfaceName: 'en0',
  tunnel: { type: 'quick', status: 'running', publicUrl: 'https://calm-river-8821.trycloudflare.com' },
  tags: ['作品集']
}
const proxyPassthroughStopped: SiteInfo = {
  id: 'b', name: 'api-mock', serveMode: 'proxy', proxyTarget: 'http://localhost:8787',
  passthrough: true, passthroughPort: 8787, port: 8787, status: 'stopped', url: '', tags: ['api']
}
const staticRunningLanOnly: SiteInfo = {
  id: 'c', name: 'design-handoff', serveMode: 'static', folderPath: '~/Work/d',
  port: 3022, status: 'running', url: 'http://localhost:3022',
  lanMode: true, lanUrl: 'http://192.168.1.24:3022', lanInterfaceName: 'en0', tags: ['交付']
}

describe('siteMode', () => {
  it('maps passthrough proxy to direct', () => {
    expect(siteMode(proxyPassthroughStopped)).toBe('direct')
  })
  it('keeps static / proxy', () => {
    expect(siteMode(staticRunningShared)).toBe('static')
  })
})

describe('siteState', () => {
  it('share when tunnel running/verifying', () => {
    expect(siteState(staticRunningShared)).toBe('share')
  })
  it('run when server running without tunnel', () => {
    expect(siteState(staticRunningLanOnly)).toBe('run')
  })
  it('stop when server stopped', () => {
    expect(siteState(proxyPassthroughStopped)).toBe('stop')
  })
})

describe('railUrl', () => {
  it('prefers public tunnel url without scheme', () => {
    expect(railUrl(staticRunningShared)).toBe('calm-river-8821.trycloudflare.com')
  })
  it('falls back to lan url when running and not shared', () => {
    expect(railUrl(staticRunningLanOnly)).toBe('192.168.1.24:3022')
  })
  it('shows stopped hint with port for stopped site', () => {
    expect(railUrl(proxyPassthroughStopped)).toBe('已停止 · 連接埠 8787')
  })
})

describe('primaryUrl', () => {
  it('sharing → full public tunnel url (scheme kept)', () => {
    expect(primaryUrl(staticRunningShared)).toBe('https://calm-river-8821.trycloudflare.com')
  })
  it('running, not shared → full LAN url', () => {
    expect(primaryUrl(staticRunningLanOnly)).toBe('http://192.168.1.24:3022')
  })
  it('running, no LAN url → local url', () => {
    const localOnly: SiteInfo = {
      ...staticRunningLanOnly, lanMode: false, lanUrl: undefined, lanInterfaceName: undefined
    }
    expect(primaryUrl(localOnly)).toBe('http://localhost:3022')
  })
  it('stopped → null (no reachable address)', () => {
    expect(primaryUrl(proxyPassthroughStopped)).toBeNull()
  })
})

describe('summarizeSites', () => {
  it('counts total/running/sharing/stopped with overlap', () => {
    const c = summarizeSites([staticRunningShared, proxyPassthroughStopped, staticRunningLanOnly])
    expect(c).toEqual({ total: 3, running: 2, sharing: 1, stopped: 1 })
  })
})

describe('filterSites', () => {
  const all = [staticRunningShared, proxyPassthroughStopped, staticRunningLanOnly]
  it('filter=share keeps only sharing sites', () => {
    expect(filterSites(all, '', 'share').map((s) => s.id)).toEqual(['a'])
  })
  it('filter=stop keeps only non-running sites', () => {
    expect(filterSites(all, '', 'stop').map((s) => s.id)).toEqual(['b'])
  })
  it('query matches name (case-insensitive)', () => {
    expect(filterSites(all, 'API', 'all').map((s) => s.id)).toEqual(['b'])
  })
  it('query matches tag', () => {
    expect(filterSites(all, '交付', 'all').map((s) => s.id)).toEqual(['c'])
  })
})

describe('localLane / lanLane', () => {
  it('local active when running', () => {
    expect(localLane(staticRunningShared)).toEqual({
      state: 'active', url: 'http://localhost:3014', sub: '僅本機可存取 · 連接埠 3014'
    })
  })
  it('local off when stopped', () => {
    expect(localLane(proxyPassthroughStopped).state).toBe('off')
  })
  it('lan active when running with lanMode on and a lanUrl', () => {
    expect(lanLane(staticRunningLanOnly)).toEqual({
      state: 'active', url: 'http://192.168.1.24:3022',
      sub: '介面 en0 · 同網段裝置可掃 QR 開啟'
    })
  })
  it('lan placeholder when running, lanMode on, but no lanUrl', () => {
    const noLan: SiteInfo = { ...staticRunningLanOnly, lanUrl: undefined, lanInterfaceName: undefined }
    expect(lanLane(noLan).state).toBe('placeholder')
  })
  it('lan off (disabled) when running but lanMode not enabled — TIM-225 secure default', () => {
    const lanOff: SiteInfo = { ...staticRunningLanOnly, lanMode: false, lanUrl: undefined }
    const vm = lanLane(lanOff)
    expect(vm.state).toBe('off')
    expect(vm.placeholder).toBe('區網分享已關閉')
  })
  it('lan off (disabled) when lanMode is undefined (legacy site, no field)', () => {
    const legacy: SiteInfo = { ...staticRunningLanOnly, lanMode: undefined, lanUrl: undefined }
    expect(lanLane(legacy).state).toBe('off')
    expect(lanLane(legacy).placeholder).toBe('區網分享已關閉')
  })
  it('lan off when stopped', () => {
    expect(lanLane(proxyPassthroughStopped).state).toBe('off')
  })
})

describe('label maps', () => {
  it('has the three states and modes', () => {
    expect(SITE_STATE_LABEL.share).toBe('分享中')
    expect(RAIL_MODE_LABEL.direct).toBe('Dir')
  })
})
