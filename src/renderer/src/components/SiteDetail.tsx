import type { SiteInfo, ProxySiteInfo, CloudflareAuth, CloudflaredEnv, RequestLogEntry } from '../../../shared/types'
import { siteMode, siteState, localLane, lanLane, SITE_STATE_LABEL } from '../utils/site-view'
import ReachLane from './ReachLane'
import TunnelControls from './TunnelControls'
import RequestLogPanel from './RequestLogPanel'
import TagEditor from './TagEditor'
import QrButton from './QrButton'
import ShareCtaCard from './ShareCtaCard'
import DomainBinding from './DomainBinding'

interface Props {
  site: SiteInfo
  // header actions
  onOpenInBrowser: (site: SiteInfo) => void
  onStartServer: (id: string) => void
  onStopServer: (id: string) => void
  onOpenFolder: (path: string) => void
  onRemove: (site: SiteInfo) => void
  onRefreshLan: () => void
  // inline rename (double-click the detail title)
  renamingId: string | null
  renameValue: string
  onRenameValueChange: (v: string) => void
  onStartRename: (site: SiteInfo) => void
  onConfirmRename: () => void
  onCancelRename: () => void
  // remote console (static sites, gated by settings)
  consoleEnabled: boolean
  onOpenConsole: (id: string) => void
  // tunnel (passed straight through to TunnelControls — types match its signature)
  cloudflaredAvailable: boolean
  authStatus: CloudflareAuth['status']
  onShare: (id: string) => Promise<void>
  onStopSharing: (id: string) => Promise<void>
  onBindFixedDomain: (id: string, domain: string) => Promise<void>
  onUnbindFixedDomain: (id: string) => Promise<void>
  onStartNamedTunnel: (id: string) => Promise<void>
  onStopNamedTunnel: (id: string) => Promise<void>
  onLogin: () => void
  onStartFrpTunnel: (id: string) => Promise<void>
  onStartBoreTunnel: (id: string) => Promise<void>
  frpcEnv: CloudflaredEnv
  boreEnv: CloudflaredEnv
  onSelectProvider: (id: string, provider: 'cloudflare' | 'frp' | 'bore') => Promise<void>
  // request log (proxy sites)
  requestLogEntries: RequestLogEntry[]
  selectedRequestEntry: RequestLogEntry | null
  onSelectRequestEntry: (e: RequestLogEntry | null) => void
  onClearRequestLog: () => void
  // watcher health (static sites) — TIM-224
  watcherUnhealthy?: boolean
  onRestartWatcher?: () => void
}

const CopyMini = (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
)
const FolderMini = (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
)
const LocalIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="14" rx="2" /><path d="M8 21h8M12 18v3" />
  </svg>
)
const LanIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" /><circle cx="12" cy="19" r="1" />
  </svg>
)

function pathText(site: SiteInfo): string {
  if (site.serveMode === 'proxy') {
    const p = site as ProxySiteInfo
    return p.passthrough ? `Direct → Port ${p.passthroughPort}` : `Proxy → ${p.proxyTarget}`
  }
  return site.folderPath
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

function SiteDetail(props: Props): React.ReactElement {
  const { site } = props
  const mode = siteMode(site)
  const state = siteState(site)
  const wanUrl = site.tunnel?.publicUrl
  const isProxy = site.serveMode === 'proxy'
  // TIM-227: show the custom-domain CNAME card when a named tunnel is bound.
  const namedDomain =
    site.tunnel?.type === 'named' && site.tunnel.publicUrl ? safeHost(site.tunnel.publicUrl) : null
  // CTA gate: mirror the WAN lane's Quick Tunnel share availability so the button is never a dead control.
  // onShare → startQuickTunnel (Cloudflare-only), so restrict to the Cloudflare provider; frp/bore share via the WAN lane.
  const isCloudflareProvider = (site.providerType ?? 'cloudflare') === 'cloudflare'
  const tunnelInactive = !site.tunnel || site.tunnel.status === 'stopped' || site.tunnel.status === 'error'
  const canShareToWan = site.status === 'running' && isCloudflareProvider && props.cloudflaredAvailable && tunnelInactive

  return (
    <div className="detail">
      <div className="detail-head">
        <div className="dh-top">
          <div>
            <div className="dh-name">
              <span className={`md-modebadge ${mode}`}>{mode}</span>
              {props.renamingId === site.id ? (
                <form className="dh-rename-form" onSubmit={(e) => { e.preventDefault(); props.onConfirmRename() }}>
                  <input
                    className="dh-rename-input"
                    value={props.renameValue}
                    onChange={(e) => props.onRenameValueChange(e.target.value)}
                    onBlur={props.onConfirmRename}
                    onKeyDown={(e) => { if (e.key === 'Escape') props.onCancelRename() }}
                    autoFocus
                  />
                </form>
              ) : (
                <h3 onDoubleClick={() => props.onStartRename(site)} title="雙擊以重新命名">{site.name}</h3>
              )}
              <span className={`md-statepill ${state}`}><span className="d" />{SITE_STATE_LABEL[state]}</span>
            </div>
            <div className="dh-path">
              <span className="p">{pathText(site)}</span>
              <button className="btn-inline-copy" data-tooltip="複製" onClick={() => navigator.clipboard.writeText(site.serveMode === 'proxy' ? site.proxyTarget : site.folderPath)}>{CopyMini}</button>
              {site.serveMode === 'static' && (
                <button className="btn-inline-copy" data-tooltip="開啟資料夾" onClick={() => props.onOpenFolder(site.folderPath)}>{FolderMini}</button>
              )}
            </div>
          </div>
          <div className="dh-actions">
            <button className="btn btn-sm" disabled={site.status !== 'running'} onClick={() => props.onOpenInBrowser(site)}>開啟</button>
            {site.status === 'running' ? (
              <button className="btn btn-sm" onClick={() => props.onStopServer(site.id)}>停止</button>
            ) : (
              <button className="btn btn-sm btn-primary" onClick={() => props.onStartServer(site.id)}>啟動</button>
            )}
            {props.consoleEnabled && site.serveMode === 'static' && (
              <button className="btn btn-sm" disabled={site.status !== 'running'} onClick={() => props.onOpenConsole(site.id)} title="開啟遠端 Console">Console</button>
            )}
            <button className="btn btn-sm btn-danger" onClick={() => props.onRemove(site)}>移除</button>
          </div>
        </div>
      </div>

      <div className="detail-body">
        {site.serveMode === 'static' && props.watcherUnhealthy && (
          <div className="watcher-warn" role="status">
            <span>即時重新載入已停止（檔案監看中斷，已嘗試自動恢復）。</span>
            {props.onRestartWatcher && (
              <button className="btn btn-sm" onClick={props.onRestartWatcher}>重新啟動監看</button>
            )}
          </div>
        )}
        <div>
          <div className="section-label">觸達通道 · Reach</div>
          <div className="dreach">
            <ReachLane kind="local" title="Local" subtitle="本機" icon={LocalIcon} vm={localLane(site)} />
            <ReachLane kind="lan" title="LAN" subtitle="區域網路" icon={LanIcon} vm={lanLane(site)} onRefresh={props.onRefreshLan} />
            {/* WAN — reuse the full tunnel state machine */}
            <TunnelControls
              site={site}
              cloudflaredAvailable={props.cloudflaredAvailable}
              authStatus={props.authStatus}
              onShare={props.onShare}
              onStopSharing={props.onStopSharing}
              onBindFixedDomain={props.onBindFixedDomain}
              onUnbindFixedDomain={props.onUnbindFixedDomain}
              onStartNamedTunnel={props.onStartNamedTunnel}
              onStopNamedTunnel={props.onStopNamedTunnel}
              onLogin={props.onLogin}
              onStartFrpTunnel={props.onStartFrpTunnel}
              onStartBoreTunnel={props.onStartBoreTunnel}
              frpcEnv={props.frpcEnv}
              boreEnv={props.boreEnv}
              onSelectProvider={props.onSelectProvider}
            />
          </div>
        </div>

        <div className="md-lower">
          <div className="col-main">
            <div className="section-label">站點資訊</div>
            <div className="kv">
              <div className="kvi"><div className="k">Mode</div><div className="v">{mode === 'static' ? '靜態檔案' : mode === 'proxy' ? '反向代理' : 'Direct'}</div></div>
              <div className="kvi"><div className="k">Port</div><div className="v">{site.port}</div></div>
              <div className="kvi"><div className="k">Provider</div><div className="v">{site.providerType ?? 'cloudflare'}</div></div>
              <div className="kvi"><div className="k">狀態</div><div className="v">{SITE_STATE_LABEL[state]}</div></div>
            </div>
            <TagEditor siteId={site.id} tags={site.tags ?? []} />
          </div>

          {wanUrl ? (
            <div className="col-side">
              <div className="section-label">公開網址 QR</div>
              <div className="qr-inline">
                <QrButton url={wanUrl} title="公開網址 QR" subtitle="掃描即可在手機開啟" />
                <span className="qr-inline-hint">掃描 QR 直接造訪公開網址</span>
              </div>
            </div>
          ) : canShareToWan ? (
            <div className="col-side">
              <div className="section-label">分享到公開網路</div>
              <ShareCtaCard onShare={() => { void props.onShare(site.id) }} />
            </div>
          ) : null}
        </div>

        {namedDomain && site.tunnel?.tunnelId && (
          <DomainBinding
            domain={namedDomain}
            tunnelId={site.tunnel.tunnelId}
            tunnelError={site.tunnel.errorMessage}
          />
        )}

        {isProxy && (
          <div>
            <div className="section-label">請求日誌 · Request Log</div>
            <RequestLogPanel
              entries={props.requestLogEntries}
              selectedEntry={props.selectedRequestEntry}
              onSelectEntry={props.onSelectRequestEntry}
              onClear={props.onClearRequestLog}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default SiteDetail
