import type { SiteInfo, ProxySiteInfo } from '../../../shared/types'

export type SiteMode = 'static' | 'proxy' | 'direct'
export type SiteState = 'run' | 'share' | 'stop'
export type SiteFilter = 'all' | 'share' | 'stop'
export type LaneState = 'active' | 'placeholder' | 'off'

export interface LaneVM {
  state: LaneState
  url?: string
  placeholder?: string
  sub?: string
}

export interface SiteCounts {
  total: number
  running: number
  sharing: number
  stopped: number
}

export const SITE_STATE_LABEL: Record<SiteState, string> = {
  run: '運行中',
  share: '分享中',
  stop: '已停止'
}

export const RAIL_MODE_LABEL: Record<SiteMode, string> = {
  static: 'Sta',
  proxy: 'Pxy',
  direct: 'Dir'
}

function isPassthrough(site: SiteInfo): boolean {
  return site.serveMode === 'proxy' && !!(site as ProxySiteInfo).passthrough
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, '')
}

export function siteMode(site: SiteInfo): SiteMode {
  return isPassthrough(site) ? 'direct' : site.serveMode
}

export function siteState(site: SiteInfo): SiteState {
  const sharing = site.tunnel?.status === 'running' || site.tunnel?.status === 'verifying'
  if (sharing) return 'share'
  if (site.status === 'running') return 'run'
  return 'stop'
}

export function railUrl(site: SiteInfo): string {
  const wan = site.tunnel?.publicUrl
  if (wan) return stripScheme(wan)
  if (site.status === 'running' && site.lanUrl) return stripScheme(site.lanUrl)
  if (site.status !== 'running') {
    return isPassthrough(site) ? `已停止 · Port ${site.port}` : '已停止'
  }
  return stripScheme(site.url)
}

export function summarizeSites(sites: SiteInfo[]): SiteCounts {
  let running = 0
  let sharing = 0
  for (const s of sites) {
    if (s.status === 'running') running++
    if (siteState(s) === 'share') sharing++
  }
  return { total: sites.length, running, sharing, stopped: sites.length - running }
}

function matchesQuery(site: SiteInfo, q: string): boolean {
  if (site.name.toLowerCase().includes(q)) return true
  if ((site.tags ?? []).some((t) => t.toLowerCase().includes(q))) return true
  const path = site.serveMode === 'proxy' ? site.proxyTarget : site.folderPath
  return path.toLowerCase().includes(q)
}

export function filterSites(sites: SiteInfo[], query: string, filter: SiteFilter): SiteInfo[] {
  const q = query.trim().toLowerCase()
  return sites.filter((s) => {
    if (filter === 'share' && siteState(s) !== 'share') return false
    if (filter === 'stop' && s.status === 'running') return false
    if (q && !matchesQuery(s, q)) return false
    return true
  })
}

export function localLane(site: SiteInfo): LaneVM {
  if (site.status !== 'running' || !site.url) {
    return { state: 'off', placeholder: '啟動站點後可使用' }
  }
  return { state: 'active', url: site.url, sub: `僅本機可存取 · Port ${site.port}` }
}

export function lanLane(site: SiteInfo): LaneVM {
  if (site.status !== 'running') {
    return { state: 'off', placeholder: '啟動站點後可使用' }
  }
  // TIM-225: LAN sharing is off by default (server bound to localhost only).
  // Checked before lanUrl — with LAN off there is no reachable區網 address,
  // so "未偵測到區網介面" would be misleading. Toggle on to bind 0.0.0.0.
  if (site.lanMode !== true) {
    return {
      state: 'off',
      placeholder: '區網分享已關閉',
      sub: '預設關閉以保護安全 · 開啟後同網段裝置可存取'
    }
  }
  if (!site.lanUrl) {
    return {
      state: 'placeholder',
      placeholder: '未偵測到區網介面',
      sub: '點重新偵測，或檢查 VPN 是否佔用網段'
    }
  }
  return {
    state: 'active',
    url: site.lanUrl,
    sub: `介面 ${site.lanInterfaceName ?? '—'} · 同網段裝置可掃 QR 開啟`
  }
}
