import { useState, useCallback } from 'react'
import type { SiteInfo } from '../../../shared/types'

interface LocalDomainSettingProps {
  site: SiteInfo
  allSites: SiteInfo[]
  onSetDomain: (siteId: string, domain: string) => Promise<void>
  onRemoveDomain: (siteId: string) => Promise<void>
}

// Domain validation
const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/
const RESERVED_NAMES = ['localhost', 'broadcasthost', 'ip6-localhost', 'ip6-loopback']

function validateDomain(
  value: string,
  siteId: string,
  allSites: SiteInfo[]
): string | null {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return null // empty is not an error, just disable confirm

  if (RESERVED_NAMES.includes(trimmed)) {
    return '此域名為系統保留名稱'
  }

  if (!DOMAIN_REGEX.test(trimmed)) {
    return '域名格式不正確（例：my-project.local）'
  }

  const duplicate = allSites.find((s) => s.id !== siteId && s.localDomain === trimmed)
  if (duplicate) {
    return `此域名已被「${duplicate.name}」使用`
  }

  return null
}

function LocalDomainSetting({
  site,
  allSites,
  onSetDomain,
  onRemoveDomain
}: LocalDomainSettingProps): React.ReactElement {
  const [showModal, setShowModal] = useState(false)
  const [domainInput, setDomainInput] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const openModal = useCallback(() => {
    setDomainInput(site.localDomain || '')
    setValidationError(null)
    setSaveError(null)
    setShowModal(true)
  }, [site.localDomain])

  const closeModal = useCallback(() => {
    setShowModal(false)
    setSaveError(null)
    setValidationError(null)
  }, [])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value
      setDomainInput(val)
      setSaveError(null)

      const trimmed = val.trim().toLowerCase()
      if (!trimmed) {
        setValidationError(null)
        return
      }
      setValidationError(validateDomain(val, site.id, allSites))
    },
    [site.id, allSites]
  )

  const handleConfirm = useCallback(async () => {
    const trimmed = domainInput.trim().toLowerCase()
    if (!trimmed) return

    const err = validateDomain(domainInput, site.id, allSites)
    if (err) {
      setValidationError(err)
      return
    }

    setSaving(true)
    setSaveError(null)
    try {
      await onSetDomain(site.id, trimmed)
      setShowModal(false)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '設定失敗')
    } finally {
      setSaving(false)
    }
  }, [domainInput, site.id, allSites, onSetDomain])

  const handleRemove = useCallback(async () => {
    setSaving(true)
    try {
      await onRemoveDomain(site.id)
      setShowModal(false)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '移除失敗')
    } finally {
      setSaving(false)
    }
  }, [site.id, onRemoveDomain])

  const trimmed = domainInput.trim().toLowerCase()
  const isConfirmDisabled = !trimmed || !!validationError || saving

  return (
    <>
      {/* Inline display */}
      {site.localDomain ? (
        <div className="local-domain-row">
          <span className="local-domain-badge">LOCAL</span>
          {site.status === 'running' ? (
            <a
              className="local-domain-name"
              href={`http://${site.localDomain}:8080`}
              target="_blank"
              rel="noopener noreferrer"
              title={`http://${site.localDomain}:8080`}
            >
              {site.localDomain}
            </a>
          ) : (
            <span className="local-domain-name local-domain-name-dimmed" onClick={openModal} title="點擊編輯域名">
              {site.localDomain}
            </span>
          )}
          <button className="btn-copy" onClick={openModal} title="編輯域名">
            &#9998;
          </button>
        </div>
      ) : (
        <button className="btn btn-sm btn-local-domain" onClick={openModal}>
          + 本地域名
        </button>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">本地自訂域名</h2>

            {saveError && <div className="modal-error">{saveError}</div>}

            <div className="form-group">
              <label className="form-label">域名</label>
              <input
                className={`form-input${validationError ? ' form-input-error' : ''}`}
                type="text"
                placeholder="my-project.local"
                value={domainInput}
                onChange={handleInputChange}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isConfirmDisabled) {
                    handleConfirm()
                  }
                }}
              />
              {validationError && (
                <span className="form-validation-error">{validationError}</span>
              )}
            </div>

            <div className="modal-actions">
              {site.localDomain && (
                <button
                  className="btn btn-danger btn-sm"
                  onClick={handleRemove}
                  disabled={saving}
                  style={{ marginRight: 'auto' }}
                >
                  移除域名
                </button>
              )}
              <button className="btn" onClick={closeModal}>
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleConfirm}
                disabled={isConfirmDisabled}
              >
                {saving ? '儲存中...' : '確認'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default LocalDomainSetting
