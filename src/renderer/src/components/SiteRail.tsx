import type { SiteInfo } from '../../../shared/types'
import { siteMode, siteState, railUrl, primaryUrl, RAIL_MODE_LABEL } from '../utils/site-view'
import CopyButton from './CopyButton'

interface Props {
  sites: SiteInfo[]          // already filtered
  totalCount: number
  runningCount: number
  selectedSiteId: string | null
  query: string
  onQueryChange: (q: string) => void
  onSelect: (id: string) => void
  onAddSite: () => void
  onOpenSettings: () => void
}

const SearchIcon = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" />
  </svg>
)
const PlusIcon = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)
const GearIcon = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82M4.6 9a1.65 1.65 0 0 0-.33-1.82M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>
)
// Same glyph as ReachLane's open icon, sized to match the inline copy button.
const OpenIcon = (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6M10 14L21 3" />
  </svg>
)

function SiteRail({
  sites, totalCount, runningCount, selectedSiteId, query,
  onQueryChange, onSelect, onAddSite, onOpenSettings
}: Props): React.ReactElement {
  return (
    <div className="rail">
      <div className="rail-head">
        <div className="rail-search">
          {SearchIcon}
          <input
            placeholder="搜尋網站…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </div>
        <div className="rail-meta">
          <span>{totalCount} Sites</span>
          <span>{runningCount} Running</span>
        </div>
      </div>
      <div className="rail-list">
        {sites.length === 0 ? (
          <div className="rail-empty">沒有符合的網站</div>
        ) : (
          sites.map((s) => {
            const mode = siteMode(s)
            const url = primaryUrl(s)
            return (
              <div
                key={s.id}
                className={`railitem${selectedSiteId === s.id ? ' on' : ''}`}
                data-site-id={s.id}
                onClick={() => onSelect(s.id)}
              >
                <span className={`rdot ${siteState(s)}`} />
                <div className="rinfo">
                  <div className="rname">{s.name}</div>
                  <div className="rurl">{railUrl(s)}</div>
                </div>
                {url && (
                  // stopPropagation so acting on a row's URL doesn't also select it
                  // (the open link's own navigation still fires).
                  <div className="ract" onClick={(e) => e.stopPropagation()}>
                    <a className="btn-inline-copy" href={url} target="_blank" rel="noopener noreferrer" data-tooltip="開啟網站">{OpenIcon}</a>
                    <CopyButton variant="inline" text={url} tooltip="複製網址" />
                  </div>
                )}
                <span className={`rmode ${mode}`}>{RAIL_MODE_LABEL[mode]}</span>
              </div>
            )
          })
        )}
      </div>
      <div className="rail-foot">
        <button className="btn btn-primary btn-sm" onClick={onAddSite}>{PlusIcon}新增網站</button>
        <button className="btn btn-icon" title="系統設定" onClick={onOpenSettings}>{GearIcon}</button>
      </div>
    </div>
  )
}

export default SiteRail
