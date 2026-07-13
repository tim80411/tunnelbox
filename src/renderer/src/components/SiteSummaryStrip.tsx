import type { SiteCounts, SiteFilter } from '../utils/site-view'

interface Props {
  counts: SiteCounts
  filter: SiteFilter
  onFilterChange: (filter: SiteFilter) => void
}

function SiteSummaryStrip({ counts, filter, onFilterChange }: Props): React.ReactElement {
  return (
    <div className="md-summary">
      <div className="stat">
        <div className="num">{counts.total}</div>
        <div className="lbl">網站</div>
      </div>
      <div className="stat">
        <div className="num"><span className="d" style={{ background: '#3fb069' }} />{counts.running}</div>
        <div className="lbl">運行中</div>
      </div>
      <div className="stat">
        <div className="num"><span className="d" style={{ background: 'var(--accent)' }} />{counts.sharing}</div>
        <div className="lbl">分享中</div>
      </div>
      <div className="stat">
        <div className="num"><span className="d" style={{ background: 'var(--border-hard)' }} />{counts.stopped}</div>
        <div className="lbl">已停止</div>
      </div>
      <div className="spacer" />
      <div className="md-filter">
        <button className={filter === 'all' ? 'on' : ''} aria-pressed={filter === 'all'} onClick={() => onFilterChange('all')}>全部</button>
        <button className={filter === 'share' ? 'on' : ''} aria-pressed={filter === 'share'} onClick={() => onFilterChange('share')}>分享中</button>
        <button className={filter === 'stop' ? 'on' : ''} aria-pressed={filter === 'stop'} onClick={() => onFilterChange('stop')}>停止</button>
      </div>
    </div>
  )
}

export default SiteSummaryStrip
