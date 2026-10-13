/**
 * Brandbook voice for every notification services/notifications.ts schedules
 * (docs/brand/90_SYNTHESIS.md §5–6): calm and factual. No emoji, no
 * exclamation marks, no shouting caps, no "N days left" countdown.
 */

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'standalone' },
}))

const mockSchedule = jest.fn().mockResolvedValue('id')

jest.mock('expo-notifications', () => ({
  __esModule: true,
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: (...args: unknown[]) => mockSchedule(...args),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly', DATE: 'date' },
}))

import { scheduleIskotifyNotifications, scheduleNoteReminder } from '../notifications'

const DAY = 86_400_000
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}\u{FE0F}/u
// Shouting words (acronyms like UPCAT are names, not shouting).
const SHOUT = /\b(TOMORROW|TODAY|NOW|FINAL|LAST)\b/
const LEFT = /\bdays? left\b/i

type Content = { title: string; body: string }
const contents = (): { id: string; content: Content }[] =>
  mockSchedule.mock.calls.map(([o]) => ({ id: o.identifier as string, content: o.content as Content }))

function expectCalm({ title, body }: Content) {
  for (const s of [title, body]) {
    expect(s).not.toMatch(EMOJI)
    expect(s).not.toContain('!')
    expect(s).not.toMatch(SHOUT)
    expect(s).not.toMatch(LEFT)
    expect(s).not.toMatch(/\bbehind\b/i)
  }
}

beforeEach(() => mockSchedule.mockClear())

describe('notification copy is calm and factual', () => {
  const now = Date.now()
  const listings = [
    { slug: 'upcat', title: 'UPCAT', type: 'exam', examDate: now + 30 * DAY, deadline: null },
    { slug: 'dost', title: 'DOST-SEI', type: 'scholarship', examDate: null, deadline: now + 30 * DAY },
  ]

  it('every scheduled notification passes the voice rules', async () => {
    await scheduleIskotifyNotifications(listings as any)
    await scheduleNoteReminder('n1', 'Bring ID', new Date(now + DAY))
    const all = contents()
    expect(all.length).toBeGreaterThanOrEqual(8)
    for (const c of all) expectCalm(c.content)
  })

  it('exam countdowns say plainly when the exam is, then encourage', async () => {
    await scheduleIskotifyNotifications(listings as any)
    const by = (id: string) => contents().find(c => c.id === id)!.content
    expect(by('exam-7d-upcat')).toMatchObject({ title: 'UPCAT is in 7 days', body: "You've got this. One drill today keeps you ready." })
    expect(by('exam-3d-upcat').title).toBe('UPCAT is in 3 days')
    expect(by('exam-1d-upcat').title).toBe('UPCAT is tomorrow')
  })

  it('deadline countdowns name the deadline and point at the requirements', async () => {
    await scheduleIskotifyNotifications(listings as any)
    const by = (id: string) => contents().find(c => c.id === id)!.content
    expect(by('exam-7d-dost').title).toBe('DOST-SEI deadline is in 7 days')
    expect(by('exam-7d-dost').body).toMatch(/requirements/i)
  })
})
