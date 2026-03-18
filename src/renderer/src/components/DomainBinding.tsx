import { useState, useCallback } from 'react'
import type { SiteInfo } from '../../../shared/types'

interface DomainBindingProps {
  site: SiteInfo
  onBind: (siteId: string, domain: string) => Promise<void>
  onUnbind: (siteId: string) => Promise<void>
}

function DomainBinding({ site, onBind, onUnbind }: DomainBindingProps): React.ReactElement | null {
  const [domainInput, setDomainInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [binding, setBinding] = useState(false)
  const [showUnbindConfirm, setShowUnbindConfirm] = useState(false)

  // Only show for named tunnels
  if (site.tunnel?.type !== 'named') {
    return null
  }

  const domain = site.domain

  const handleBind = useCallback(async () => {
    const trimmed = domainInput.trim()
    if (!trimmed) {
      setInputError('請輸入網域名稱')
      return
    }
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}$/.test(trimmed)) {
      setInputError('請輸入有效的網域名稱，例如 dev.example.com')
      return
    }
    setInputError(null)
    setBinding(true)
    try {
      await onBind(site.id, trimmed)
      setDomainInput('')
    } catch {
      // Error is handled by parent via setError
    } finally {
      setBinding(false)
    }
  }, [domainInput, site.id, onBind])

  const handleConfirmUnbind = useCallback(async () => {
    setShowUnbindConfirm(false)
    await onUnbind(site.id)
  }, [site.id, onUnbind])

  // Domain is bound — show status
  if (domain) {
    return (
      <div className="domain-binding">
        <div className="domain-info">
          <span className="domain-name">{domain.domain}</span>
          <span className={`domain-status domain-status-${domain.status}`}>
            {domain.status === 'pending' && 'DNS 傳播中'}
            {domain.status === 'active' && '已綁定'}
            {domain.status === 'error' && (domain.errorMessage || '錯誤')}
          </span>
        </div>
        {domain.status === 'pending' && (
          <span className="domain-hint">DNS 傳播中，可能需要數分鐘才能完全生效</span>
        )}
        <button
          className="btn btn-sm"
          onClick={() => setShowUnbindConfirm(true)}
        >
          解除綁定
        </button>

        {showUnbindConfirm && (
          <div className="modal-overlay" onClick={() => setShowUnbindConfirm(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2 className="modal-title">確認解除綁定</h2>
              <p className="confirm-text">
                確定要解除「{domain.domain}」的網域綁定嗎？DNS 記錄將被刪除。
              </p>
              <div className="modal-actions">
                <button className="btn" onClick={() => setShowUnbindConfirm(false)}>
                  取消
                </button>
                <button className="btn btn-danger" onClick={handleConfirmUnbind}>
                  確認解除
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // No domain bound — show bind form
  return (
    <div className="domain-binding">
      <div className="domain-form">
        <input
          className="form-input domain-input"
          type="text"
          placeholder="dev.example.com"
          value={domainInput}
          onChange={(e) => {
            setDomainInput(e.target.value)
            setInputError(null)
          }}
        />
        <button
          className="btn btn-sm btn-primary"
          onClick={handleBind}
          disabled={binding}
        >
          {binding ? '綁定中...' : '綁定'}
        </button>
      </div>
      {inputError && <span className="domain-error">{inputError}</span>}
    </div>
  )
}

export default DomainBinding
