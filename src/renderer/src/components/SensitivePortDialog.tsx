import { useState } from 'react'

interface SensitivePortDialogProps {
  siteName: string
  port: number
  serviceName: string
  onConfirm: (remember: boolean) => void
  onCancel: () => void
}

/**
 * TIM-226 — shown before opening a public tunnel to a well-known sensitive port
 * (SSH / DB / cache / …). Lets the user confirm or remember the choice. The
 * tunnel is only started after an explicit confirm, so cancelling never leaves
 * an orphaned cloudflared process.
 */
function SensitivePortDialog({
  siteName,
  port,
  serviceName,
  onConfirm,
  onCancel,
}: SensitivePortDialogProps): React.ReactElement {
  const [remember, setRemember] = useState(false)
  return (
    <div className="modal-overlay" data-dismiss onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">確認分享敏感連接埠</h2>
        <p className="confirm-text" style={{ marginBottom: '12px' }}>
          「{siteName}」即將把 <strong>連接埠 {port}（{serviceName}）</strong> 公開到網際網路。
          這類服務通常不應對外公開，暴露後任何人都可能嘗試連線。確定要繼續分享嗎？
        </p>

        <label
          style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', marginBottom: '14px', cursor: 'pointer' }}
        >
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          不再為連接埠 {port} 詢問
        </label>

        <div className="modal-actions" style={{ flexDirection: 'column', gap: '8px', alignItems: 'stretch' }}>
          <button className="btn btn-danger" onClick={() => onConfirm(remember)}>
            仍要分享連接埠 {port}
          </button>
          <button className="btn" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

export default SensitivePortDialog
