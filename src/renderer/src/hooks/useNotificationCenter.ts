import { useEffect, useState, useCallback } from 'react'
import type { NotificationItem } from '../../../shared/types'

export function useNotificationCenter() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const [items, count] = await Promise.all([
        window.electron.getNotifications(),
        window.electron.getUnreadNotificationCount()
      ])
      setNotifications(items)
      setUnreadCount(count)
    } catch {
      // silently ignore — notification center is non-critical
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()

    const unsubNew = window.electron.onNewNotification((item) => {
      setNotifications((prev) => [item, ...prev])
      setUnreadCount((prev) => prev + 1)
    })

    const unsubUpdated = window.electron.onNotificationsUpdated((count) => {
      setUnreadCount(count)
      // Also refresh the full list to get updated read states
      window.electron.getNotifications().then(setNotifications).catch(() => {})
    })

    return () => {
      unsubNew()
      unsubUpdated()
    }
  }, [refresh])

  const markRead = useCallback(async (id: string) => {
    try {
      await window.electron.markNotificationRead(id)
    } catch {
      // silently ignore
    }
  }, [])

  const markAllRead = useCallback(async () => {
    try {
      await window.electron.markAllNotificationsRead()
    } catch {
      // silently ignore
    }
  }, [])

  return { notifications, unreadCount, loading, markRead, markAllRead }
}
