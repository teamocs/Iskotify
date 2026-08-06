import { buildNewsAndDatesFeed } from '../newsAndDatesFeed'
import type { FeedItem } from '../admissionsFeed'

const NOW = new Date('2026-07-24T00:00:00Z').getTime()
const DAY = 86_400_000

function admission(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: overrides.id ?? 'a1',
    reportDate: '2026-06-01',
    severity: 'info',
    title: 'Some admission item',
    body: 'Body text',
    eventDate: null,
    eventType: null,
    ...overrides,
  }
}

describe('buildNewsAndDatesFeed', () => {
  it('returns an empty feed when there is nothing to show', () => {
    const feed = buildNewsAndDatesFeed({ focusedListings: [], noteReminders: [], admissionItems: [], now: NOW })
    expect(feed).toEqual([])
  })

  it('includes a future focused-listing exam date', () => {
    const feed = buildNewsAndDatesFeed({
      focusedListings: [{ slug: 'upcat', title: 'UPCAT 2026', type: 'exam', examDate: NOW + 10 * DAY, deadline: null }],
      noteReminders: [],
      admissionItems: [],
      now: NOW,
    })
    expect(feed).toHaveLength(1)
    expect(feed[0]).toMatchObject({ kind: 'listing', title: 'UPCAT 2026', label: 'Exam', slug: 'upcat' })
  })

  it('excludes past focused-listing dates', () => {
    const feed = buildNewsAndDatesFeed({
      focusedListings: [{ slug: 'upcat', title: 'UPCAT 2025', type: 'exam', examDate: NOW - 10 * DAY, deadline: null }],
      noteReminders: [],
      admissionItems: [],
      now: NOW,
    })
    expect(feed).toHaveLength(0)
  })

  it('sorts dated entries (listing, reminder, admission) ascending by date', () => {
    const feed = buildNewsAndDatesFeed({
      focusedListings: [{ slug: 'later-exam', title: 'Later Exam', type: 'exam', examDate: NOW + 20 * DAY, deadline: null }],
      noteReminders: [{ noteId: 'n1', noteTitle: 'Soonest reminder', reminderAt: NOW + 2 * DAY }],
      admissionItems: [admission({ id: 'ev1', severity: 'urgent', title: 'Mid event', eventDate: '2026-08-03', eventType: 'deadline' })],
      now: NOW,
    })
    expect(feed.map(f => f.title)).toEqual(['Soonest reminder', 'Mid event', 'Later Exam'])
  })

  it('fills remaining slots with severity-ranked news once dated entries run out', () => {
    const feed = buildNewsAndDatesFeed({
      focusedListings: [{ slug: 'upcat', title: 'UPCAT', type: 'exam', examDate: NOW + DAY, deadline: null }],
      noteReminders: [],
      admissionItems: [
        admission({ id: 'urgent-news', severity: 'urgent', title: 'Urgent news', reportDate: '2026-07-20' }),
        admission({ id: 'info-news', severity: 'info', title: 'Info news', reportDate: '2026-07-01' }),
      ],
      now: NOW,
      limit: 5,
    })
    expect(feed.map(f => f.kind)).toEqual(['listing', 'news', 'news'])
    // Urgent ranks above info among the news rows.
    expect(feed[1]!.title).toBe('Urgent news')
    expect(feed[2]!.title).toBe('Info news')
  })

  it('does not surface an admission event twice (as a dated entry AND as news)', () => {
    const feed = buildNewsAndDatesFeed({
      focusedListings: [],
      noteReminders: [],
      admissionItems: [admission({ id: 'dup', severity: 'urgent', title: 'Dup event', eventDate: '2026-08-03', eventType: 'exam' })],
      now: NOW,
    })
    expect(feed).toHaveLength(1)
    expect(feed[0]!.kind).toBe('admission')
  })

  it('caps the merged feed to `limit` (default 5)', () => {
    const reminders = Array.from({ length: 10 }, (_, i) => ({
      noteId: `n${i}`, noteTitle: `Reminder ${i}`, reminderAt: NOW + (i + 1) * DAY,
    }))
    const feed = buildNewsAndDatesFeed({ focusedListings: [], noteReminders: reminders, admissionItems: [], now: NOW })
    expect(feed).toHaveLength(5)
  })

  it('drops a "no_change" severity admissions event from the dated pool (not urgent/important/info)', () => {
    const feed = buildNewsAndDatesFeed({
      focusedListings: [],
      noteReminders: [],
      admissionItems: [admission({ id: 'nc', severity: 'no_change', title: 'No change event', eventDate: '2026-08-03', eventType: 'exam' })],
      now: NOW,
    })
    // Still surfaces as a news row (severity-ranked), just not as a dated entry.
    expect(feed).toHaveLength(1)
    expect(feed[0]!.kind).toBe('news')
  })
})
