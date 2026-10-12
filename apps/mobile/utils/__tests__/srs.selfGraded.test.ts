import {
  scheduleNext, scheduleReview, previewIntervals, formatIntervalDays, newSrsState, GRADES,
  DEFAULT_EASE_FACTOR, MIN_EASE_FACTOR, MAX_INTERVAL_DAYS, EASE_DELTA_HARD,
  type SrsCardState,
} from '../srs'

// Self-graded flashcard review (iOS redesign P4): the card stack asks the
// student Again / Hard / Good / Easy, so 'hard' joins the derived grades and
// the stack schedules with the grade it was given.

const DAY_MS = 86_400_000
const NOW = 1_700_000_000_000

function state(over: Partial<SrsCardState>): SrsCardState {
  return { ...newSrsState(), ...over }
}

describe("scheduleNext — 'hard'", () => {
  it('first rep: 1 day, ease down by 0.15', () => {
    const s = scheduleNext(newSrsState(), 'hard', NOW)
    expect(s.intervalDays).toBe(1)
    expect(s.repetitions).toBe(1)
    expect(s.lapses).toBe(0)
    expect(s.easeFactor).toBeCloseTo(DEFAULT_EASE_FACTOR + EASE_DELTA_HARD)
    expect(EASE_DELTA_HARD).toBeCloseTo(-0.15)
    expect(s.dueAt).toBe(NOW + DAY_MS)
    expect(s.lastGrade).toBe('hard')
    expect(s.lastReviewedAt).toBe(NOW)
  })

  it('second rep: 2 days', () => {
    const s = scheduleNext(state({ repetitions: 1, intervalDays: 1 }), 'hard', NOW)
    expect(s.intervalDays).toBe(2)
    expect(s.repetitions).toBe(2)
  })

  it('later reps: round(interval × 1.2), not × ease', () => {
    expect(scheduleNext(state({ repetitions: 2, intervalDays: 10 }), 'hard', NOW).intervalDays).toBe(12)
    expect(scheduleNext(state({ repetitions: 3, intervalDays: 3 }), 'hard', NOW).intervalDays).toBe(4)
  })

  it('never drops below 1 day and is capped at the maximum', () => {
    expect(scheduleNext(state({ repetitions: 2, intervalDays: 0 }), 'hard', NOW).intervalDays).toBe(1)
    expect(scheduleNext(state({ repetitions: 5, intervalDays: MAX_INTERVAL_DAYS }), 'hard', NOW).intervalDays).toBe(MAX_INTERVAL_DAYS)
  })

  it('ease is floored at the minimum', () => {
    const s = scheduleNext(state({ repetitions: 3, intervalDays: 5, easeFactor: MIN_EASE_FACTOR + 0.05 }), 'hard', NOW)
    expect(s.easeFactor).toBe(MIN_EASE_FACTOR)
  })

  it('keeps the lapse count (hard is a pass, not a lapse)', () => {
    expect(scheduleNext(state({ repetitions: 2, intervalDays: 3, lapses: 2 }), 'hard', NOW).lapses).toBe(2)
  })
})

describe('scheduleReview', () => {
  it('treats a missing row as a brand-new card', () => {
    expect(scheduleReview(null, 'good', NOW)).toEqual(scheduleNext(newSrsState(), 'good', NOW))
  })
  it('schedules the given grade against the existing state', () => {
    const existing = state({ repetitions: 2, intervalDays: 3, easeFactor: 2.5, dueAt: NOW - 1 })
    for (const g of GRADES) {
      expect(scheduleReview(existing, g, NOW)).toEqual(scheduleNext(existing, g, NOW))
    }
  })
})

describe('previewIntervals', () => {
  it('lists the four grades in order', () => {
    expect(GRADES).toEqual(['again', 'hard', 'good', 'easy'])
  })

  it('a never-reviewed card: 1 / 1 / 1 / 1 day', () => {
    expect(previewIntervals(null, NOW)).toEqual({ again: 1, hard: 1, good: 1, easy: 1 })
  })

  it('a card on its second rep: again 1, hard 2, good 3, easy 3', () => {
    expect(previewIntervals(state({ repetitions: 1, intervalDays: 1 }), NOW)).toEqual({ again: 1, hard: 2, good: 3, easy: 3 })
  })

  it('a mature card grows by ease for good/easy and × 1.2 for hard', () => {
    const s = state({ repetitions: 3, intervalDays: 10, easeFactor: 2.5 })
    expect(previewIntervals(s, NOW)).toEqual({ again: 1, hard: 12, good: 25, easy: 25 })
  })

  it('always agrees with scheduleNext', () => {
    const s = state({ repetitions: 4, intervalDays: 7, easeFactor: 1.9 })
    const p = previewIntervals(s, NOW)
    for (const g of GRADES) expect(p[g]).toBe(scheduleNext(s, g, NOW).intervalDays)
  })
})

describe('formatIntervalDays', () => {
  it('names the unit in words', () => {
    expect(formatIntervalDays(1)).toBe('1 day')
    expect(formatIntervalDays(3)).toBe('3 days')
    expect(formatIntervalDays(180)).toBe('180 days')
  })
})
