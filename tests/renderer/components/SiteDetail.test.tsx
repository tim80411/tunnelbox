import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import SiteDetail from '../../../src/renderer/src/components/SiteDetail'
import type { SiteInfo } from '../../../src/shared/types'

// Render the detail header to static markup and assert the title-row open/copy
// icons and the new URL row appear only when the site has a reachable address.
// renderToStaticMarkup skips effects/handlers, so child components that call
// window.electron (TagEditor, DomainBinding, …) never touch it here.
const noop = (): void => {}
const asyncNoop = async (): Promise<void> => {}

function renderDetail(site: SiteInfo): string {
  return renderToStaticMarkup(
    createElement(SiteDetail, {
      site,
      onOpenInBrowser: noop,
      onStartServer: noop,
      onStopServer: noop,
      onOpenFolder: noop,
      onRemove: noop,
      onRefreshLan: noop,
      onSetLanMode: noop,
      renamingId: null,
      renameValue: '',
      onRenameValueChange: noop,
      onStartRename: noop,
      onConfirmRename: noop,
      onCancelRename: noop,
      consoleEnabled: false,
      onOpenConsole: noop,
      cloudflaredAvailable: false,
      authStatus: 'logged_out',
      onShare: asyncNoop,
      onStopSharing: asyncNoop,
      onBindFixedDomain: asyncNoop,
      onUnbindFixedDomain: asyncNoop,
      onStartNamedTunnel: asyncNoop,
      onStopNamedTunnel: asyncNoop,
      onLogin: noop,
      onStartFrpTunnel: asyncNoop,
      onStartBoreTunnel: asyncNoop,
      frpcEnv: { status: 'not_installed' },
      boreEnv: { status: 'not_installed' },
      onSelectProvider: asyncNoop,
      requestLogEntries: [],
      selectedRequestEntry: null,
      onSelectRequestEntry: noop,
      onClearRequestLog: noop
    })
  )
}

const runningLocal: SiteInfo = {
  id: 'r', name: 'docs', serveMode: 'static', folderPath: '~/docs',
  port: 3014, status: 'running', url: 'http://localhost:3014', tags: []
}
const stopped: SiteInfo = {
  id: 's', name: 'api-mock', serveMode: 'proxy', proxyTarget: 'http://localhost:8787',
  passthrough: true, passthroughPort: 8787, port: 8787, status: 'stopped', url: '', tags: []
}

describe('SiteDetail — header open/copy + URL row', () => {
  it('running site: title row gets ↗ open link to the primary URL, a copy button, and a URL row', () => {
    const html = renderDetail(runningLocal)
    expect(html).toContain('class="dh-url"')
    expect(html).toContain('href="http://localhost:3014"')
    expect(html).toContain('開啟網站')
    expect(html).toContain('複製網址')
  })

  it('stopped site: no header open/copy and no URL row', () => {
    const html = renderDetail(stopped)
    expect(html).not.toContain('class="dh-url"')
    expect(html).not.toContain('開啟網站')
    expect(html).not.toContain('複製網址')
    // the folder-path row's own copy control is unaffected
    expect(html).toContain('Direct → Port 8787')
  })
})
