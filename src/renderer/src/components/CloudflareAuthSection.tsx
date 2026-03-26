import { useState, useCallback } from 'react'
import type { CloudflareAuth } from '../../../shared/types'

interface CloudflareAuthSectionProps {
  auth: CloudflareAuth
  hasRunningNamedTunnels: boolean
  onLogin: () => Promise<void>
  onLogout: () => Promise<void>
}

function CloudflareAuthSection({ auth, hasRunningNamedTunnels, onLogin, onLogout }: CloudflareAuthSectionProps): React.ReactElement {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showLoginGuide, setShowLoginGuide] = useState(false)

  const handleLoginClick = useCallback(() => {
    setShowLoginGuide(true)
  }, [])

  const handleConfirmLogin = useCallback(async () => {
    setShowLoginGuide(false)
    await onLogin()
  }, [onLogin])

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
      {auth.status === 'logged_out' && (
        <button className="btn btn-sm btn-auth-login" onClick={handleLoginClick}>
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
          <button className="btn btn-sm btn-auth-login" onClick={handleLoginClick}>
            重新登入
          </button>
        </div>
      )}

      {showLoginGuide && (
        <div className="modal-overlay" data-dismiss onClick={() => setShowLoginGuide(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">登入 Cloudflare</h2>
            <div className="login-guide-callout">
              請先在瀏覽器中登入你的 Cloudflare 帳號
            </div>
            <p className="confirm-text" style={{ marginTop: '8px' }}>
              點擊「繼續」後將開啟瀏覽器進行網域授權，若尚未登入 Cloudflare，授權流程將無法正常完成。
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowLoginGuide(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleConfirmLogin}>
                繼續
              </button>
            </div>
          </div>
        </div>
      )}

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

export default CloudflareAuthSection
