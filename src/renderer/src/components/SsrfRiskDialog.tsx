import { useState } from 'react'
import { useDialogFocus } from '../hooks/useDialogFocus'

interface SsrfRiskDialogProps {
  siteName: string
  hostname: string
  risk: 'link-local' | 'private'
  onConfirm: (remember: boolean) => void
  onCancel: () => void
}

const RISK_TEXT: Record<'link-local' | 'private', string> = {
  'link-local':
    '這是雲端主機的內部管理位址（例如 169.254.169.254）。一旦公開，任何人都可能透過這條通道讀取主機的憑證與敏感設定，造成金鑰外洩。',
  private:
    '這是內部網路位址。一旦公開，等於把這個內網服務直接暴露到整個網際網路，任何人都能存取。'
}

/**
 * TIM-312 (F06) — shown before opening a public tunnel to a proxy target whose
 * host is a cloud-metadata / link-local or internal (RFC1918) address. Mirrors
 * SensitivePortDialog: the tunnel only starts after an explicit confirm, so
 * cancelling never leaves an orphaned process.
 */
function SsrfRiskDialog({
  siteName,
  hostname,
  risk,
  onConfirm,
  onCancel
}: SsrfRiskDialogProps): React.ReactElement {
  const [remember, setRemember] = useState(false)
  const dialogRef = useDialogFocus<HTMLDivElement>(true)
  return (
    <div className="modal-overlay" data-dismiss onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="確認分享敏感網路位址" ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">確認分享敏感網路位址</h2>
        <p className="confirm-text" style={{ marginBottom: '12px' }}>
          「{siteName}」的代理目標 <strong>{hostname}</strong> {RISK_TEXT[risk]} 確定要繼續分享嗎？
        </p>

        <label
          style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', marginBottom: '14px', cursor: 'pointer' }}
        >
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          不再為 {hostname} 詢問
        </label>

        <div className="modal-actions" style={{ flexDirection: 'column', gap: '8px', alignItems: 'stretch' }}>
          <button className="btn btn-danger" onClick={() => onConfirm(remember)}>
            仍要分享 {hostname}
          </button>
          <button className="btn" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

export default SsrfRiskDialog
