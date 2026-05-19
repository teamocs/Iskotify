import { useState, useEffect, useCallback } from 'react'
import { eq } from 'drizzle-orm'
import { useDb } from './useDb'
import { userSettings } from '../db/schema'
import {
  requestNotificationPermissions,
  scheduleIskotifyNotifications,
  cancelAllIskotifyNotifications,
  type NotificationListing,
} from '../services/notifications'

export function useNotifications() {
  const db = useDb()
  const [enabled, setEnabled] = useState(true)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    db.select({ notificationsEnabled: userSettings.notificationsEnabled })
      .from(userSettings)
      .where(eq(userSettings.id, 1))
      .limit(1)
      .then(rows => {
        setEnabled(rows[0]?.notificationsEnabled ?? true)
        setReady(true)
      })
      .catch(() => setReady(true))
  }, [db])

  const schedule = useCallback(async (listings: NotificationListing[]) => {
    if (!ready || !enabled) return
    const granted = await requestNotificationPermissions()
    if (granted) {
      await scheduleIskotifyNotifications(listings).catch(e =>
        console.warn('[useNotifications] schedule error:', e)
      )
    }
  }, [ready, enabled])

  const toggle = useCallback(async (listings: NotificationListing[]) => {
    const next = !enabled
    setEnabled(next) // optimistic

    try {
      await db.update(userSettings)
        .set({ notificationsEnabled: next })
        .where(eq(userSettings.id, 1))

      if (next) {
        const granted = await requestNotificationPermissions()
        if (granted) {
          await scheduleIskotifyNotifications(listings)
        } else {
          // Permission denied — revert
          setEnabled(false)
          await db.update(userSettings)
            .set({ notificationsEnabled: false })
            .where(eq(userSettings.id, 1))
        }
      } else {
        await cancelAllIskotifyNotifications()
      }
    } catch (e) {
      console.error('[useNotifications] toggle error:', e)
      setEnabled(!next) // revert optimistic
    }
  }, [enabled, db])

  return { enabled, ready, schedule, toggle }
}
