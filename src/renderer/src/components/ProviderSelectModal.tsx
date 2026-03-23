import { useState } from 'react'
import { providerList } from '../providers/registry'
import type { ProviderType } from '../providers/registry'

interface ProviderSelectModalProps {
  siteName: string
  currentProvider?: string
  cloudflaredAvailable: boolean
  frpcAvailable: boolean
  boreAvailable: boolean
  onConfirm: (provider: ProviderType) => Promise<void>
  onCancel: () => void
}

function ProviderSelectModal({
  siteName,
  currentProvider,
  cloudflaredAvailable,
  frpcAvailable,
  boreAvailable,
  onConfirm,
  onCancel
}: ProviderSelectModalProps): React.ReactElement {
  const validProviders = providerList.map((d) => d.type)
  const initial = validProviders.includes(currentProvider as ProviderType)
    ? (currentProvider as ProviderType)
    : 'cloudflare'
  const [selected, setSelected] = useState<ProviderType>(initial)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const availabilityMap: Record<ProviderType, boolean> = {
    cloudflare: cloudflaredAvailable,
    frp: frpcAvailable,
    bore: boreAvailable
  }

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

  const options = providerList.map((def) => ({
    value: def.type,
    label: def.label,
    hint: def.installHint,
    desc: def.description,
    available: availabilityMap[def.type]
  }))

  const selectedDisabled = !options.find((o) => o.value === selected)?.available

  return (
    <div className="modal-overlay" data-dismiss onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">選擇 Tunnel 服務</h2>
        <p className="confirm-text" style={{ marginBottom: '12px' }}>
          為「{siteName}」選擇公開分享的 Tunnel 服務
        </p>

        {error && <div className="modal-error">{error}</div>}

        <div className="provider-radio-group">
          {options.map((opt) => (
            <label
              key={opt.value}
              className={`provider-radio-option${selected === opt.value ? ' provider-radio-option--selected' : ''}${!opt.available ? ' provider-radio-option--disabled' : ''}`}
              onClick={() => opt.available && setSelected(opt.value)}
            >
              <input
                type="radio"
                name="provider"
                checked={selected === opt.value}
                onChange={() => setSelected(opt.value)}
                disabled={!opt.available}
              />
              <div>
                <div className="provider-radio-label">
                  {opt.label}
                  {!opt.available && <span className="provider-radio-hint">（{opt.hint}）</span>}
                </div>
                <div className="provider-radio-desc">{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onCancel} disabled={confirming}>
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={confirming || selectedDisabled}
          >
            {confirming ? '切換中...' : '確認'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProviderSelectModal
