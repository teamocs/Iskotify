import { useState, useEffect, useCallback } from 'react'
import { eq } from 'drizzle-orm'
import { useDb } from './useDb'
import { userSettings } from '../db/schema'
import {
  requestNotificationPermissions,
  scheduleIskotifyNotifications,
  cancelAllIskotifyNotifications,
  type NotificationListing,
  type DailyPlanSummary,
} from '../services/notifications'

export function useNotifications() {
  const db = useDb()
  const [enabled, setEnabled] = useState(true)
  const [ready, setReady] = useState(false)
  const [dailyReminderHour, setDailyReminderHour] = useState(9)
  const [weeklySummaryEnabled, setWeeklySummaryEnabled] = useState(true)

  useEffect(() => {
    db.select({
      notificationsEnabled: userSettings.notificationsEnabled,
      dailyReminderHour: userSettings.dailyReminderHour,
      weeklySummaryEnabled: userSettings.weeklySummaryEnabled,
    })
      .from(userSettings)
      .where(eq(userSettings.id, 1))
      .limit(1)
      .then(rows => {
        setEnabled(rows[0]?.notificationsEnabled ?? true)
        setDailyReminderHour(rows[0]?.dailyReminderHour ?? 9)
        setWeeklySummaryEnabled(rows[0]?.weeklySummaryEnabled ?? true)
        setReady(true)
      })
      .catch(() => setReady(true))
  }, [db])

  const schedule = useCallback(async (listings: NotificationListing[], dailyPlanSummary?: DailyPlanSummary | null) => {
    if (!ready || !enabled) return
    const granted = await requestNotificationPermissions()
    if (granted) {
      await scheduleIskotifyNotifications(listings, { dailyReminderHour, weeklySummaryEnabled, dailyPlanSummary }).catch(e =>
        console.warn('[useNotifications] schedule error:', e)
      )
    }
  }, [ready, enabled, dailyReminderHour, weeklySummaryEnabled])

  /** Settings → Notifications: update the daily reminder hour + reschedule. */
  const setReminderHour = useCallback(async (hour: number, listings: NotificationListing[]) => {
    setDailyReminderHour(hour) // optimistic
    try {
      await db.update(userSettings).set({ dailyReminderHour: hour }).where(eq(userSettings.id, 1))
      if (enabled) {
        await scheduleIskotifyNotifications(listings, { dailyReminderHour: hour, weeklySummaryEnabled })
      }
    } catch (e) {
      console.error('[useNotifications] setReminderHour error:', e)
    }
  }, [db, enabled, weeklySummaryEnabled])

  /** Settings → Notifications: toggle the weekly weak-areas summary + reschedule. */
  const toggleWeeklySummary = useCallback(async (listings: NotificationListing[]) => {
    const next = !weeklySummaryEnabled
    setWeeklySummaryEnabled(next) // optimistic
    try {
      await db.update(userSettings).set({ weeklySummaryEnabled: next }).where(eq(userSettings.id, 1))
      if (enabled) {
        await scheduleIskotifyNotifications(listings, { dailyReminderHour, weeklySummaryEnabled: next })
      }
    } catch (e) {
      console.error('[useNotifications] toggleWeeklySummary error:', e)
      setWeeklySummaryEnabled(!next) // revert optimistic
    }
  }, [db, enabled, dailyReminderHour, weeklySummaryEnabled])

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
          await scheduleIskotifyNotifications(listings, { dailyReminderHour, weeklySummaryEnabled })
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
  }, [enabled, db, dailyReminderHour, weeklySummaryEnabled])

  return {
    enabled, ready, schedule, toggle,
    dailyReminderHour, weeklySummaryEnabled, setReminderHour, toggleWeeklySummary,
  }
}
