import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReachLane from '../../../src/renderer/src/components/ReachLane'
import { lanLane } from '../../../src/renderer/src/utils/site-view'
import type { SiteInfo } from '../../../src/shared/types'

// TIM-225: render the LAN reach lane to static markup (no DOM needed) and
// assert the secure-default OFF state vs the opted-in ON state surface the
// right text, toggle, and exposure warning. renderToStaticMarkup skips
// effects, so QrButton's async QR generation never runs here.
const base: Omit<SiteInfo, 'lanMode' | 'lanUrl' | 'lanInterfaceName'> & {
  lanMode?: boolean
  lanUrl?: string
  lanInterfaceName?: string
} = {
  id: 's', name: 'site', serveMode: 'static', folderPath: '~/x',
  port: 3014, status: 'running', url: 'http://localhost:3014', tags: []
}

function renderLan(site: SiteInfo): string {
  return renderToStaticMarkup(
    createElement(ReachLane, {
      kind: 'lan',
      title: 'LAN',
      subtitle: '區域網路',
      icon: null,
      vm: lanLane(site),
      onRefresh: () => {},
      lanMode: site.lanMode === true,
      running: site.status === 'running',
      onToggleLanMode: () => {}
    })
  )
}

describe('ReachLane — LAN sharing toggle (TIM-225)', () => {
  it('OFF (secure default): shows "區網分享已關閉" + an enable button, no exposure warning', () => {
    const html = renderLan({ ...base, lanMode: false } as SiteInfo)
    expect(html).toContain('區網分享已關閉')
    expect(html).toContain('開啟分享')
    expect(html).not.toContain('關閉分享')
    expect(html).not.toContain('lan-expose-warn')
  })

  it('ON: shows the LAN url, the exposure warning, and a disable button', () => {
    const html = renderLan({
      ...base, lanMode: true, lanUrl: 'http://192.168.1.24:3014', lanInterfaceName: 'en0'
    } as SiteInfo)
    expect(html).toContain('http://192.168.1.24:3014')
    expect(html).toContain('lan-expose-warn')
    expect(html).toContain('區網內任何人都能存取此站點')
    expect(html).toContain('關閉分享')
    expect(html).not.toContain('開啟分享')
  })

  it('stopped: no toggle controls (cannot bind an interface when not running)', () => {
    const html = renderLan({ ...base, status: 'stopped', url: '', lanMode: false } as SiteInfo)
    expect(html).not.toContain('開啟分享')
    expect(html).not.toContain('關閉分享')
    expect(html).not.toContain('lan-expose-warn')
  })
})
