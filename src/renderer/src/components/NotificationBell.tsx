import { useState, useRef, useEffect, useCallback } from 'react'
import { useNotificationCenter } from '../hooks/useNotificationCenter'

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

function NotificationBell(): React.ReactElement {
  const { notifications, unreadCount, markRead, markAllRead } = useNotificationCenter()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const handleToggle = useCallback(() => {
    setOpen((prev) => !prev)
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return

    function handleClickOutside(e: MouseEvent): void {
      const target = e.target as Node
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  return (
    <div className="notif-bell-wrapper">
      <button
        ref={buttonRef}
        className="btn btn-icon"
        onClick={handleToggle}
        title="Notifications"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 1.5C8.4 1.5 8.7 1.8 8.7 2.2V2.6C10.6 3 12 4.7 12 6.7V10L13 11.5H3L4 10V6.7C4 4.7 5.4 3 7.3 2.6V2.2C7.3 1.8 7.6 1.5 8 1.5ZM6.5 12.5C6.5 13.3 7.2 14 8 14C8.8 14 9.5 13.3 9.5 12.5H6.5Z" fill="currentColor"/>
        </svg>
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div ref={panelRef} className="notif-panel">
          <div className="notif-panel-header">
            <span className="notif-panel-title">
              Notifications
              {unreadCount > 0 && (
                <span className="notif-count">{unreadCount > 99 ? '99+' : unreadCount} new</span>
              )}
            </span>
            {unreadCount > 0 && (
              <button
                className="notif-mark-all-btn"
                onClick={() => {
                  markAllRead()
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="notif-panel-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">
                <div className="notif-empty-ic">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                  </svg>
                </div>
                <p className="notif-empty-title">No notifications</p>
                <p className="notif-empty-desc">Visitor activity on your public URLs will show up here.</p>
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  className={`notif-item${item.read ? '' : ' notif-item--unread'}`}
                  onClick={() => {
                    if (!item.read) {
                      markRead(item.id)
                    }
                  }}
                >
                  <span className="notif-ic">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </span>
                  <div className="notif-item-content">
                    <div className="notif-item-site">New visitor · {item.siteName}</div>
                    <div className="notif-item-ip">Visitor {item.visitorIp}</div>
                    <div className="notif-item-time">{formatRelativeTime(item.timestamp)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell
