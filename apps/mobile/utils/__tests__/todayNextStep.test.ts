import { pickNextStep, pickCountdown, planItemCopy, type PlanItemLike } from '../todayNextStep'

const DAY = 86_400_000
const topics = new Map([['t-alg', 'Algebra']])

function item(overrides: Partial<PlanItemLike> = {}): PlanItemLike {
  return { id: 1, kind: 'topic_practice', refId: 't-alg', targetCount: 10, completedAt: null, ...overrides }
}

describe('planItemCopy', () => {
  it('names the topic for topic practice and routes to it', () => {
    expect(planItemCopy(item(), topics)).toEqual({
      title: 'Practice Algebra',
      detail: '10 questions · your weakest area',
      route: '/practice/t-alg',
      actionLabel: 'Start practice',
    })
  })

  it('falls back to "this topic" when the topic name is unknown', () => {
    expect(planItemCopy(item({ refId: 'nope' }), topics).title).toBe('Practice this topic')
  })

  it('pluralises due flashcards and routes to the due queue', () => {
    expect(planItemCopy(item({ kind: 'srs_review', targetCount: 1 }), topics).title).toBe('Review 1 due flashcard')
    const many = planItemCopy(item({ kind: 'srs_review', targetCount: 12 }), topics)
    expect(many.title).toBe('Review 12 due flashcards')
    expect(many.route).toBe('/practice/due')
    expect(many.actionLabel).toBe('Review cards')
  })

  it('routes a mock section to its exam and the diagnostic to the diagnostic', () => {
    expect(planItemCopy(item({ kind: 'mock_section', refId: 'upcat' }), topics).route).toBe('/practice/exam/upcat')
    expect(planItemCopy(item({ kind: 'diagnostic', refId: '' }), topics).route).toBe('/practice/diagnostic')
  })

  it('names the mock item for what it opens: the full timed mock, not a section', () => {
    const c = planItemCopy(item({ kind: 'mock_section', refId: 'upcat' }), topics)
    expect(c).toMatchObject({ title: 'Timed mock', detail: 'A full, timed dress rehearsal for the real exam', actionLabel: 'Start mock' })
    expect(planItemCopy(item({ kind: 'diagnostic', refId: '' }), topics).route).toBe('/practice/diagnostic')
  })
})

describe('pickNextStep', () => {
  const base = { items: [] as PlanItemLike[], loading: false, error: false, tomorrowItemCount: 0, topicNameById: topics }

  it('is loading while the plan loads, even if stale items exist', () => {
    expect(pickNextStep({ ...base, loading: true, items: [item()] }).kind).toBe('loading')
  })

  it('reports an error only when there is nothing to show', () => {
    expect(pickNextStep({ ...base, error: true }).kind).toBe('error')
    // Stale-but-usable items beat an error: the student can still act.
    expect(pickNextStep({ ...base, error: true, items: [item()] }).kind).toBe('task')
  })

  it('picks the first item that is not done, with progress counts', () => {
    const step = pickNextStep({
      ...base,
      items: [
        item({ id: 1, completedAt: 123 }),
        item({ id: 2, kind: 'srs_review', targetCount: 5 }),
        item({ id: 3 }),
      ],
    })
    expect(step).toMatchObject({
      kind: 'task', itemId: 2, title: 'Review 5 due flashcards', route: '/practice/due', done: 1, total: 3,
    })
  })

  it('is "done" when every item is complete, carrying tomorrow\'s count', () => {
    const step = pickNextStep({ ...base, tomorrowItemCount: 4, items: [item({ completedAt: 1 })] })
    expect(step).toEqual({ kind: 'done', reason: 'complete', tomorrowCount: 4 })
  })

  it('is "done" with reason "empty" when nothing was planned today', () => {
    expect(pickNextStep(base)).toEqual({ kind: 'done', reason: 'empty', tomorrowCount: 0 })
  })
})

describe('pickCountdown on the local calendar (Asia/Manila, +8h)', () => {
  const PH = 8 * 3_600_000
  const exam = Date.UTC(2026, 9, 1) // 'YYYY-MM-DD' exam date, stored at UTC midnight
  const listing = [{ slug: 'upcat', title: 'UPCAT', type: 'exam', examDate: exam }]
  const at = (d: number, h: number, m = 0) => Date.UTC(2026, 8, d, h - 8, m) // local wall clock on Sep d (d=31 -> Oct 1)

  it('stays at 0 days all through exam day, including after 08:00 local', () => {
    for (const [h, m] of [[0, 0], [7, 59], [8, 1], [23, 59]] as const) {
      expect(pickCountdown(listing, at(31, h, m), PH)?.days).toBe(0)
    }
  })

  it('counts whole calendar days before the exam', () => {
    expect(pickCountdown(listing, at(30, 23, 59), PH)?.days).toBe(1)
    expect(pickCountdown(listing, at(30, 8, 1), PH)?.days).toBe(1)
    expect(pickCountdown(listing, at(30, 7, 59), PH)?.days).toBe(1)
    expect(pickCountdown(listing, at(29, 23, 59), PH)?.days).toBe(2)
  })

  it('drops the countdown the day after the exam', () => {
    expect(pickCountdown(listing, at(32, 0, 1), PH)).toBeNull()
  })
})

describe('pickCountdown', () => {
  const now = Date.UTC(2026, 8, 26, 2) // 26 Sep 2026, 10:00 PHT

  it('returns null when no focused exam has a future date', () => {
    expect(pickCountdown([], now)).toBeNull()
    expect(pickCountdown([{ slug: 'upcat', title: 'UPCAT', type: 'exam', examDate: now - DAY }], now)).toBeNull()
    expect(pickCountdown([{ slug: 'upcat', title: 'UPCAT', type: 'exam', examDate: null }], now)).toBeNull()
  })

  it('picks the soonest upcoming exam, ignoring schools and scholarships', () => {
    const c = pickCountdown([
      { slug: 'acet', title: 'ACET 2027', type: 'exam', examDate: now + 40 * DAY },
      { slug: 'upcat', title: 'UPCAT 2027', type: 'exam', examDate: now + 12 * DAY },
      { slug: 'school:x', title: 'Some School', type: 'school', examDate: now + 2 * DAY },
      { slug: 'dost', title: 'DOST', type: 'scholarship', examDate: now + 3 * DAY },
    ], now)
    expect(c).toEqual({ slug: 'upcat', title: 'UPCAT 2027', days: 12, dateMs: now + 12 * DAY })
  })

  it('counts calendar days: an exam later the same day is 0, the next calendar day is 1', () => {
    expect(pickCountdown([{ slug: 'u', title: 'U', type: 'exam', examDate: now + 3_600_000 }], now, 0)?.days).toBe(0)
    expect(pickCountdown([{ slug: 'u', title: 'U', type: 'exam', examDate: now + DAY }], now, 0)?.days).toBe(1)
    expect(pickCountdown([{ slug: 'u', title: 'U', type: 'exam', examDate: now }], now)?.days).toBe(0)
  })
})
