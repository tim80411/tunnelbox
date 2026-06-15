import type { ReactNode } from 'react'
import type { LaneVM } from '../utils/site-view'
import CopyButton from './CopyButton'
import QrButton from './QrButton'

interface Props {
  kind: 'local' | 'lan'
  title: string
  subtitle: string
  icon: ReactNode
  vm: LaneVM
  onRefresh?: () => void   // lan only
}

const RefreshIcon = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" />
  </svg>
)
const OpenIcon = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6M10 14L21 3" />
  </svg>
)

function ReachLane({ kind, title, subtitle, icon, vm, onRefresh }: Props): React.ReactElement {
  const off = vm.state !== 'active'
  return (
    <div className={`dlane${off ? ' off' : ''}`}>
      <div className="dlane-key">
        <span className={`ic ${vm.state === 'active' ? kind : 'dim'}`}>{icon}</span>
        <div className="kt"><b>{title}</b><span>{subtitle}</span></div>
      </div>
      <div className="dlane-body">
        {vm.state === 'active' ? (
          <div className="u">{vm.url}</div>
        ) : (
          <div className="u ph">{vm.placeholder}</div>
        )}
        {vm.sub && <div className="sub">{vm.sub}</div>}
      </div>
      <div className="dlane-act">
        {vm.state === 'active' && vm.url && (
          <>
            <CopyButton text={vm.url} tooltip="複製網址" variant="icon" />
            <QrButton url={vm.url} title={`${title} QR Code`} />
            {kind === 'local' && (
              <a className="btn btn-icon" href={vm.url} target="_blank" rel="noopener noreferrer" title="在瀏覽器開啟">{OpenIcon}</a>
            )}
          </>
        )}
        {kind === 'lan' && onRefresh && (
          <button className="btn btn-icon" title="重新偵測區網 IP" onClick={onRefresh}>{RefreshIcon}</button>
        )}
      </div>
    </div>
  )
}

export default ReachLane
