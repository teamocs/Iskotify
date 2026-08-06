/**
 * Unit tests for services/notifications.ts's Task I additions: the dynamic
 * daily body, the configurable reminder hour, and the weekly-summary gate.
 * Existing note-reminder / countdown behavior is left untouched by Task I and
 * isn't re-tested here.
 */

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'standalone' },
}))

const mockScheduleNotificationAsync = jest.fn().mockResolvedValue('id')
const mockCancelScheduledNotificationAsync = jest.fn().mockResolvedValue(undefined)
const mockGetAllScheduledNotificationsAsync = jest.fn().mockResolvedValue([])

jest.mock('expo-notifications', () => ({
  __esModule: true,
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: (...args: unknown[]) => mockScheduleNotificationAsync(...args),
  cancelScheduledNotificationAsync: (...args: unknown[]) => mockCancelScheduledNotificationAsync(...args),
  getAllScheduledNotificationsAsync: (...args: unknown[]) => mockGetAllScheduledNotificationsAsync(...args),
  SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly', DATE: 'date' },
}))

import { scheduleIskotifyNotifications } from '../notifications'

function dailyCall() {
  return mockScheduleNotificationAsync.mock.calls.find(([opts]) => opts.identifier === 'daily-practice')
}
function weeklyCall() {
  return mockScheduleNotificationAsync.mock.calls.find(([opts]) => opts.identifier === 'weekly-weak-areas')
}

beforeEach(() => {
  mockScheduleNotificationAsync.mockClear()
  mockGetAllScheduledNotificationsAsync.mockResolvedValue([])
})

describe('scheduleIskotifyNotifications — daily body', () => {
  it('uses the static fallback body when no plan summary is given', async () => {
    await scheduleIskotifyNotifications([])
    const [opts] = dailyCall()!
    expect(opts.content.body).toBe('Keep your streak going and tackle those weak areas today!')
  })

  it('names the top plan item + streak when a summary is given', async () => {
    await scheduleIskotifyNotifications([], {
      dailyPlanSummary: { topItemLabel: 'Practice Algebra — 8 questions queued', streakDays: 5 },
    })
    const [opts] = dailyCall()!
    expect(opts.content.body).toContain('Practice Algebra — 8 questions queued')
    expect(opts.content.body).toContain('5-day streak')
  })

  it('omits the streak clause when streakDays is 0', async () => {
    await scheduleIskotifyNotifications([], {
      dailyPlanSummary: { topItemLabel: 'Take a quick diagnostic', streakDays: 0 },
    })
    const [opts] = dailyCall()!
    expect(opts.content.body).toBe('Take a quick diagnostic')
  })
})

describe('scheduleIskotifyNotifications — dailyReminderHour', () => {
  it('defaults to 9am when no hour is given', async () => {
    await scheduleIskotifyNotifications([])
    const [opts] = dailyCall()!
    expect(opts.trigger).toMatchObject({ hour: 9, minute: 0 })
  })

  it('uses the configured hour', async () => {
    await scheduleIskotifyNotifications([], { dailyReminderHour: 19 })
    const [opts] = dailyCall()!
    expect(opts.trigger).toMatchObject({ hour: 19, minute: 0 })
  })
})

describe('scheduleIskotifyNotifications — weeklySummaryEnabled', () => {
  it('schedules the weekly weak-areas nudge by default', async () => {
    await scheduleIskotifyNotifications([])
    expect(weeklyCall()).toBeDefined()
  })

  it('skips the weekly nudge when weeklySummaryEnabled is false', async () => {
    await scheduleIskotifyNotifications([], { weeklySummaryEnabled: false })
    expect(weeklyCall()).toBeUndefined()
    expect(dailyCall()).toBeDefined() // daily nudge is unaffected
  })
})
