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
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
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

const OUR_PREFIXES = ['exam-7d-', 'exam-3d-', 'exam-1d-']
const OUR_IDS     = ['daily-practice', 'weekly-weak-areas']

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

export async function scheduleIskotifyNotifications(
  listings: NotificationListing[]
): Promise<void> {
  const N = getN()
  if (!N) return

  await cancelAllIskotifyNotifications()

  // 1. Daily practice reminder — every day at 9 AM
  await N.scheduleNotificationAsync({
    identifier: 'daily-practice',
    content: {
      title: 'Iskotify — Time to Study! 📚',
      body: 'Keep your streak going and tackle those weak areas today!',
      sound: true,
    },
    trigger: {
      type: N.SchedulableTriggerInputTypes.DAILY,
      hour: 9,
      minute: 0,
    },
  })

  // 2. Weekly weak-areas nudge — every Sunday at 10 AM
  //    weekday: 1 = Sunday in expo-notifications (1-7 Sun-Sat)
  await N.scheduleNotificationAsync({
    identifier: 'weekly-weak-areas',
    content: {
      title: 'Iskotify — Review Weak Areas 🎯',
      body: 'Focus on your weak topics this week to boost your exam score!',
      sound: true,
    },
    trigger: {
      type: N.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 1,
      hour: 10,
      minute: 0,
    },
  })

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
