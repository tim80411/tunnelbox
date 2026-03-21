import { useState, useCallback } from 'react'
import type { CloudflareAuth } from '../../../shared/types'

interface AuthPanelProps {
  auth: CloudflareAuth
  hasRunningNamedTunnels: boolean
  onLogin: () => Promise<void>
  onLogout: () => Promise<void>
}

function AuthPanel({ auth, hasRunningNamedTunnels, onLogin, onLogout }: AuthPanelProps): React.ReactElement {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const handleLogoutClick = useCallback(() => {
    if (hasRunningNamedTunnels) {
      setShowLogoutConfirm(true)
    } else {
      onLogout()
    }
  }, [hasRunningNamedTunnels, onLogout])

  const handleConfirmLogout = useCallback(async () => {
    setShowLogoutConfirm(false)
    await onLogout()
  }, [onLogout])

  return (
    <>
      <div className="auth-panel">
        {auth.status === 'logged_out' && (
          <button className="btn btn-sm btn-auth-login" onClick={onLogin}>
            登入 Cloudflare
          </button>
        )}

        {auth.status === 'logging_in' && (
          <span className="auth-status auth-logging-in">
            <span className="cloudflared-spinner" />
            登入中...
          </span>
        )}

        {auth.status === 'logged_in' && (
          <div className="auth-status auth-logged-in">
            <span className="auth-email">{auth.accountEmail || 'Cloudflare'}</span>
            <button className="btn btn-sm" onClick={handleLogoutClick}>
              登出
            </button>
          </div>
        )}

        {auth.status === 'expired' && (
          <div className="auth-status auth-expired">
            <span className="auth-expired-text">認證已過期</span>
            <button className="btn btn-sm btn-auth-login" onClick={onLogin}>
              重新登入
            </button>
          </div>
        )}
      </div>

      {showLogoutConfirm && (
        <div className="modal-overlay" data-dismiss onClick={() => setShowLogoutConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">確認登出</h2>
            <p className="confirm-text">
              登出將停止所有 Named Tunnel，是否繼續？
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowLogoutConfirm(false)}>
                取消
              </button>
              <button className="btn btn-danger" onClick={handleConfirmLogout}>
                確認登出
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default AuthPanel
