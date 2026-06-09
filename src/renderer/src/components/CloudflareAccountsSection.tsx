import { useState, useCallback, useRef } from 'react'
import type { CloudflareAccountsState, CloudflareAccount } from '../../../shared/types'

interface Props {
  state: CloudflareAccountsState
  isPro: boolean
  onAdd: () => Promise<CloudflareAccountsState>
  onRemove: (accountId: string) => Promise<CloudflareAccountsState>
  onSetActive: (accountId: string) => Promise<CloudflareAccountsState>
  onSetLabel: (accountId: string, label: string | null) => Promise<CloudflareAccountsState>
}

function accountDisplayLabel(account: CloudflareAccount): string {
  return account.customLabel
    || account.email
    || (account.cfAccountId ? account.cfAccountId.slice(0, 8) : null)
    || account.id.slice(0, 16)
}

function CloudflareAccountsSection({ state, isPro, onAdd, onRemove, onSetActive, onSetLabel }: Props): React.ReactElement {
  const [showFreeBlockDialog, setShowFreeBlockDialog] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<CloudflareAccount | null>(null)
  const [adding, setAdding] = useState(false)
  const [dupLabel, setDupLabel] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const { accounts, activeAccountId } = state

  const runAdd = useCallback(async () => {
    try {
      await onAdd()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const dupMatch = msg.match(/DUPLICATE_CF_ACCOUNT:(.+)$/)
      if (dupMatch) {
        setDupLabel(dupMatch[1])
      } else {
        throw err
      }
    }
  }, [onAdd])

  const handleAddClick = useCallback(async () => {
    if (!isPro && accounts.length >= 1) {
      setShowFreeBlockDialog(true)
      return
    }
    setAdding(true)
    try {
      await runAdd()
    } finally {
      setAdding(false)
    }
  }, [isPro, accounts.length, runAdd])

  const handleFreeSignOutAndAdd = useCallback(async () => {
    setShowFreeBlockDialog(false)
    if (accounts.length > 0) {
      await onRemove(accounts[0].id)
    }
    setAdding(true)
    try {
      await runAdd()
    } finally {
      setAdding(false)
    }
  }, [accounts, onRemove, runAdd])

  const handleRemoveClick = useCallback((account: CloudflareAccount) => {
    setRemoveTarget(account)
  }, [])

  const handleConfirmRemove = useCallback(async () => {
    if (!removeTarget) return
    await onRemove(removeTarget.id)
    setRemoveTarget(null)
  }, [removeTarget, onRemove])

  const handleSetActive = useCallback(async (accountId: string) => {
    if (!isPro) return
    await onSetActive(accountId)
  }, [isPro, onSetActive])

  const startEdit = useCallback((account: CloudflareAccount) => {
    setEditingId(account.id)
    setEditValue(account.customLabel || '')
    setTimeout(() => editInputRef.current?.focus(), 0)
  }, [])

  const commitEdit = useCallback(async (accountId: string) => {
    setEditingId(null)
    const trimmed = editValue.trim()
    await onSetLabel(accountId, trimmed || null)
  }, [editValue, onSetLabel])

  return (
    <>
      <div className="cf-accounts-section">
        {accounts.length === 0 ? (
          <div className="cf-accounts-empty">
            <span className="auth-status auth-logged-out-text">尚未登入任何帳號</span>
          </div>
        ) : (
          <div className="cf-accounts-list">
            {accounts.map((account) => {
              const isActive = account.id === activeAccountId
              const isInactive = !isPro && !isActive
              const isEditing = editingId === account.id
              return (
                <div
                  key={account.id}
                  className={`cf-account-row${isActive ? ' cf-account-active' : ''}${isInactive ? ' cf-account-inactive' : ''}`}
                >
                  <div className="cf-account-info">
                    {isEditing ? (
                      <input
                        ref={editInputRef}
                        className="cf-account-label-input"
                        value={editValue}
                        placeholder={account.email || account.id.slice(0, 16)}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => commitEdit(account.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit(account.id)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                      />
                    ) : (
                      <span className="cf-account-email">
                        {accountDisplayLabel(account)}
                        <button
                          className="btn-icon cf-account-edit-btn"
                          title="重新命名帳號"
                          onClick={() => startEdit(account)}
                          style={{ marginLeft: 4, opacity: 0.6, fontSize: 11 }}
                        >
                          ✎
                        </button>
                      </span>
                    )}
                    {isActive && <span className="cf-account-badge">使用中</span>}
                    {isInactive && (
                      <span className="cf-account-badge cf-account-badge-inactive" title="Pro 用於 agency / multi-client 工作流">
                        不可切換
                      </span>
                    )}
                  </div>
                  <div className="cf-account-actions">
                    {isPro && !isActive && (
                      <button
                        className="btn btn-sm"
                        onClick={() => handleSetActive(account.id)}
                      >
                        切換
                      </button>
                    )}
                    <button
                      className="btn btn-sm btn-danger-outline"
                      onClick={() => handleRemoveClick(account)}
                    >
                      移除
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <button
          className="btn btn-sm btn-auth-login"
          onClick={handleAddClick}
          disabled={adding}
        >
          {adding ? '登入中...' : '新增 Cloudflare 帳號'}
        </button>

        {!isPro && accounts.length >= 1 && (
          <p className="cf-accounts-hint">Free 適合個人專案；Pro 用於 agency / multi-client 工作流</p>
        )}
      </div>

      {showFreeBlockDialog && (
        <div className="modal-overlay" data-dismiss onClick={() => setShowFreeBlockDialog(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">新增 Cloudflare 帳號</h2>
            <p className="confirm-text">
              Free 一次只能登入 1 個 Cloudflare 帳號。
            </p>
            <p className="confirm-text" style={{ marginTop: '4px', color: 'var(--color-text-muted)' }}>
              Free 適合個人專案；Pro 用於 agency / multi-client 工作流。
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowFreeBlockDialog(false)}>
                Cancel
              </button>
              <button
                className="btn"
                onClick={handleFreeSignOutAndAdd}
              >
                Sign out current &amp; add new
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setShowFreeBlockDialog(false)}
              >
                Upgrade to Pro
              </button>
            </div>
          </div>
        </div>
      )}

      {dupLabel && (
        <div className="modal-overlay" data-dismiss onClick={() => setDupLabel(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">已授權過相同的 Cloudflare 帳號</h2>
            <p className="confirm-text">
              這個 Cloudflare 帳號（{dupLabel}）已經存在於清單中。
            </p>
            <p className="confirm-text" style={{ marginTop: '8px', color: 'var(--color-text-muted)' }}>
              若要加入不同的 Cloudflare 帳號，請先在瀏覽器登出 Cloudflare（或切換到另一個 Cloudflare 帳號），再回來重試。
            </p>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setDupLabel(null)}>
                了解
              </button>
            </div>
          </div>
        </div>
      )}

      {removeTarget && (
        <div className="modal-overlay" data-dismiss onClick={() => setRemoveTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">移除帳號</h2>
            <p className="confirm-text">
              移除帳號 {accountDisplayLabel(removeTarget)} 將影響所有綁定此帳號的站點，這些站點需重新選擇帳號才能使用 Named Tunnel。要繼續嗎？
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setRemoveTarget(null)}>
                取消
              </button>
              <button className="btn btn-danger" onClick={handleConfirmRemove}>
                確認移除
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default CloudflareAccountsSection
