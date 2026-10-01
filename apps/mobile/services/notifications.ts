import type * as NotificationsType from 'expo-notifications'
import { Platform } from 'react-native'
import Constants from 'expo-constants'

type N = typeof NotificationsType
let _N: N | null = null
let _init = false

function getN(): N | null {
  if (_init) return _N
  _init = true
  // Metro's guardedLoadModule swallows the throw from DevicePushTokenAutoRegistration.fx.js
  // and calls ErrorUtils.reportFatalError before our try-catch can see it. The only safe fix
  // is to never require expo-notifications in Expo Go at all.
  if (Constants.executionEnvironment === 'storeClient') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _N = require('expo-notifications') as N
    _N.setNotificationHandler({
      handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false } as any),
    })
  } catch {
    _N = null
  }
  return _N
}

export interface NotificationListing {
  slug: string
  title: string
  examDate: number | null
  deadline: number | null
}

const OUR_PREFIXES = ['exam-7d-', 'exam-3d-', 'exam-1d-', 'note-reminder-']
const OUR_IDS     = ['daily-practice', 'weekly-weak-areas']

// ── Note reminder helpers ─────────────────────────────────────────────────────

/**
 * Schedule a push notification for a note reminder.
 * Safe to call multiple times — cancels any existing reminder for the same
 * note first, so rescheduling is idempotent.
 */
export async function scheduleNoteReminder(
  noteId: string,
  noteTitle: string,
  at: Date,
): Promise<void> {
  const N = getN()
  if (!N) return
  // Cancel any existing reminder for this note first
  await N.cancelScheduledNotificationAsync(`note-reminder-${noteId}`).catch(() => {})
  // Only schedule if the date is in the future
  if (at.getTime() <= Date.now()) return
  await N.scheduleNotificationAsync({
    identifier: `note-reminder-${noteId}`,
    content: {
      title: '🔔 Note Reminder',
      body: noteTitle.trim() || 'You have a note reminder.',
      sound: true,
      data: { noteId },
    },
    trigger: {
      type: N.SchedulableTriggerInputTypes.DATE,
      date: at,
    },
  })
}

/**
 * Cancel a previously scheduled note reminder.
 */
export async function cancelNoteReminder(noteId: string): Promise<void> {
  const N = getN()
  if (!N) return
  await N.cancelScheduledNotificationAsync(`note-reminder-${noteId}`).catch(() => {})
}


export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false
  const N = getN()
  if (!N) return false
  const { status: existing } = await N.getPermissionsAsync()
  if (existing === 'granted') return true
  const { status } = await N.requestPermissionsAsync()
  return status === 'granted'
}

export async function cancelAllIskotifyNotifications(): Promise<void> {
  const N = getN()
  if (!N) return
  const scheduled = await N.getAllScheduledNotificationsAsync()
  await Promise.all(
    scheduled
      .filter(n =>
        OUR_IDS.includes(n.identifier) ||
        OUR_PREFIXES.some(p => n.identifier.startsWith(p))
      )
      .map(n => N.cancelScheduledNotificationAsync(n.identifier))
  )
}

export interface ScheduleOptions {
  /** 0-23 local hour for the daily practice nudge. Defaults to 9 (the original hardcoded time). */
  dailyReminderHour?: number
  /** Settings → Notifications "weekly summary" toggle. Defaults to true. */
  weeklySummaryEnabled?: boolean
}

// Repeating notifications are scheduled once and fire for weeks, so their copy
// is fixed text that stays true on any day: no streak count, no plan item, no
// numbers the app cannot know at fire time. Every scheduling path (home
// screen, settings) goes through scheduleIskotifyNotifications, so they all
// produce exactly this content.
export const DAILY_REMINDER_BODY = 'A few minutes of practice today keeps you on track for exam day.'
export const WEEKLY_SUMMARY_BODY = 'Take a few minutes to review the topics you find hardest and check your progress.'

export async function scheduleIskotifyNotifications(
  listings: NotificationListing[],
  options: ScheduleOptions = {},
): Promise<void> {
  const N = getN()
  if (!N) return

  await cancelAllIskotifyNotifications()

  // 1. Daily practice reminder — every day at the user's chosen hour (default 9 AM).
  //    Fixed, always-true copy (see DAILY_REMINDER_BODY): a repeating trigger
  //    must not bake in a streak or plan item that goes stale the next day.
  const hour = options.dailyReminderHour ?? 9

  await N.scheduleNotificationAsync({
    identifier: 'daily-practice',
    content: {
      title: 'Iskotify — Time to Study! 📚',
      body: DAILY_REMINDER_BODY,
      sound: true,
    },
    trigger: {
      type: N.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute: 0,
    },
  })

  // 2. Weekly weak-areas nudge — every Sunday at 10 AM. Gated independently
  //    by the Settings → Notifications "weekly summary" toggle.
  //    weekday: 1 = Sunday in expo-notifications (1-7 Sun-Sat)
  if (options.weeklySummaryEnabled !== false) {
    await N.scheduleNotificationAsync({
      identifier: 'weekly-weak-areas',
      content: {
        title: 'Iskotify — Review Weak Areas 🎯',
        body: WEEKLY_SUMMARY_BODY,
        sound: true,
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 1,
        hour: 10,
        minute: 0,
      },
    })
  }

  // 3. Exam/deadline countdowns
  const now = Date.now()
  for (const listing of listings) {
    const targets: Array<{ ms: number; label: string }> = []
    if (listing.examDate != null) targets.push({ ms: listing.examDate, label: listing.title })
    if (listing.deadline != null) targets.push({ ms: listing.deadline, label: `${listing.title} deadline` })

    for (const { ms, label } of targets) {
      const at7d = ms - 7 * 86_400_000
      const at3d = ms - 3 * 86_400_000
      const at1d = ms - 1 * 86_400_000

      if (at7d > now) {
        await N.scheduleNotificationAsync({
          identifier: `exam-7d-${listing.slug}`,
          content: {
            title: 'Iskotify — 7 Days Left! 🎯',
            body: `${label} is in 7 days! Start your final review!`,
            sound: true,
          },
          trigger: {
            type: N.SchedulableTriggerInputTypes.DATE,
            date: new Date(at7d),
          },
        })
      }
      if (at3d > now) {
        await N.scheduleNotificationAsync({
          identifier: `exam-3d-${listing.slug}`,
          content: {
            title: 'Iskotify — 3 Days Left! 💪',
            body: `${label} is in 3 days! Final push — you can do this!`,
            sound: true,
          },
          trigger: {
            type: N.SchedulableTriggerInputTypes.DATE,
            date: new Date(at3d),
          },
        })
      }
      if (at1d > now) {
        await N.scheduleNotificationAsync({
          identifier: `exam-1d-${listing.slug}`,
          content: {
            title: 'Iskotify — TOMORROW! 🙌',
            body: `${label} is TOMORROW! You've got this!`,
            sound: true,
          },
          trigger: {
            type: N.SchedulableTriggerInputTypes.DATE,
            date: new Date(at1d),
          },
        })
      }
    }
  }
}
