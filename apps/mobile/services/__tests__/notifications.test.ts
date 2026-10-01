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

describe('scheduleIskotifyNotifications — repeating copy stays true', () => {
  const STREAK_NUMBER = /\d+\s*-?\s*day|\bstreak of \d|🔥/i

  it('the repeating DAILY body bakes in no streak number or flame', async () => {
    await scheduleIskotifyNotifications([])
    const [opts] = dailyCall()!
    expect(opts.trigger).toMatchObject({ type: 'daily' })
    expect(opts.content.body).not.toMatch(STREAK_NUMBER)
    expect(opts.content.body.length).toBeGreaterThan(10)
  })

  it('a plan summary (the old streak-baking input) no longer changes the repeating body', async () => {
    await scheduleIskotifyNotifications([])
    const plain = dailyCall()![0].content.body
    mockScheduleNotificationAsync.mockClear()
    await scheduleIskotifyNotifications([], {
      dailyPlanSummary: { topItemLabel: 'Practice Algebra — 8 questions queued', streakDays: 5 },
    } as any)
    const [opts] = dailyCall()!
    expect(opts.content.body).toBe(plain)
    expect(opts.content.body).not.toContain('5-day streak')
    expect(opts.content.body).not.toContain('Algebra')
  })

  it('both scheduling paths (with and without extra options) produce identical content', async () => {
    await scheduleIskotifyNotifications([], { dailyReminderHour: 9, weeklySummaryEnabled: true })
    const first = [dailyCall()![0].content, weeklyCall()![0].content]
    mockScheduleNotificationAsync.mockClear()
    await scheduleIskotifyNotifications([])
    expect([dailyCall()![0].content, weeklyCall()![0].content]).toEqual(first)
  })

  it('the weekly summary claims no numbers it cannot know', async () => {
    await scheduleIskotifyNotifications([])
    const [opts] = weeklyCall()!
    expect(opts.content.body).not.toMatch(/\d/)
    expect(opts.content.body).not.toMatch(/boost your exam score/i)
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
