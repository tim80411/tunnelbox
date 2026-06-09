import type { SiteInfo } from '../../../shared/types'

interface ConcurrentSharesDialogProps {
  targetSite: SiteInfo
  activeSites: SiteInfo[]
  onStopAndStart: (stopSiteId: string) => Promise<void>
  onUpgrade: () => void
  onCancel: () => void
}

function ConcurrentSharesDialog({
  targetSite,
  activeSites,
  onStopAndStart,
  onUpgrade,
  onCancel,
}: ConcurrentSharesDialogProps): React.ReactElement {
  return (
    <div className="modal-overlay" data-dismiss onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">切換 share 對象</h2>
        <p className="confirm-text" style={{ marginBottom: '12px' }}>
          Free 適合 single-demo 工作流，每次同時 share 2 個 site。
          選擇停掉哪個現有 share 來騰出位置給「{targetSite.name}」，或升級 Pro 支援 multi-client 並行。
        </p>

        <div className="modal-actions" style={{ flexDirection: 'column', gap: '8px', alignItems: 'stretch' }}>
          {activeSites.map((site) => (
            <button
              key={site.id}
              className="btn btn-primary"
              onClick={() => onStopAndStart(site.id)}
            >
              停止「{site.name}」並開始分享「{targetSite.name}」
            </button>
          ))}

          <button className="btn btn-primary" onClick={onUpgrade}>
            升級 Pro — 支援 multi-client 並行 demo
          </button>

          <button className="btn" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConcurrentSharesDialog
