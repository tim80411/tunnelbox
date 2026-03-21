import { useState } from 'react'

interface ProviderSelectModalProps {
  siteName: string
  currentProvider?: string
  cloudflaredAvailable: boolean
  frpcAvailable: boolean
  onConfirm: (provider: 'cloudflare' | 'frp') => Promise<void>
  onCancel: () => void
}

function ProviderSelectModal({
  siteName,
  currentProvider,
  cloudflaredAvailable,
  frpcAvailable,
  onConfirm,
  onCancel
}: ProviderSelectModalProps): React.ReactElement {
  const [selected, setSelected] = useState<'cloudflare' | 'frp'>(
    (currentProvider as 'cloudflare' | 'frp') || 'cloudflare'
  )
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    setError(null)
    setConfirming(true)
    try {
      await onConfirm(selected)
    } catch (err) {
      setError(err instanceof Error ? err.message : '切換失敗')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="modal-overlay" data-dismiss onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">選擇 Tunnel 服務</h2>
        <p className="confirm-text" style={{ marginBottom: '12px' }}>
          為「{siteName}」選擇公開分享的 Tunnel 服務
        </p>

        {error && <div className="modal-error">{error}</div>}

        <div className="provider-radio-group">
          <label
            className={`provider-radio-option${selected === 'cloudflare' ? ' provider-radio-option--selected' : ''}${!cloudflaredAvailable ? ' provider-radio-option--disabled' : ''}`}
            onClick={() => cloudflaredAvailable && setSelected('cloudflare')}
          >
            <input
              type="radio"
              name="provider"
              checked={selected === 'cloudflare'}
              onChange={() => setSelected('cloudflare')}
              disabled={!cloudflaredAvailable}
            />
            <div>
              <div className="provider-radio-label">
                Cloudflare Tunnel
                {!cloudflaredAvailable && <span className="provider-radio-hint">（需先安裝 cloudflared）</span>}
              </div>
              <div className="provider-radio-desc">免費、零設定、隨機或固定網域</div>
            </div>
          </label>

          <label
            className={`provider-radio-option${selected === 'frp' ? ' provider-radio-option--selected' : ''}${!frpcAvailable ? ' provider-radio-option--disabled' : ''}`}
            onClick={() => frpcAvailable && setSelected('frp')}
          >
            <input
              type="radio"
              name="provider"
              checked={selected === 'frp'}
              onChange={() => setSelected('frp')}
              disabled={!frpcAvailable}
            />
            <div>
              <div className="provider-radio-label">
                frp（自架伺服器）
                {!frpcAvailable && <span className="provider-radio-hint">（需先安裝 frpc）</span>}
              </div>
              <div className="provider-radio-desc">需自備 VPS，TCP 轉發</div>
            </div>
          </label>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onCancel} disabled={confirming}>
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={confirming || (selected === 'cloudflare' && !cloudflaredAvailable) || (selected === 'frp' && !frpcAvailable)}
          >
            {confirming ? '切換中...' : '確認'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProviderSelectModal
