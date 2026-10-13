import {
  scheduleNext, scheduleReview, previewIntervals, formatIntervalDays, newSrsState, GRADES,
  DEFAULT_EASE_FACTOR, MIN_EASE_FACTOR, MAX_INTERVAL_DAYS, EASE_DELTA_HARD, EASE_DELTA_EASY,
  AGAIN_RELEARN_MINUTES, EASY_FIRST_INTERVAL_DAYS, EASY_BONUS,
  type Grade, type SrsCardState,
} from '../srs'

// Self-graded flashcard review (iOS redesign P4; owner decision 2026-10-13):
// the card stack asks Again / Hard / Good / Easy, and each grade schedules a
// distinct, sensible interval: Again < Hard <= Good < Easy, with Easy strictly
// longer than Good at every rep and Again (a same-day relearn) never tying Hard.
// The MCQ-derived ladder (applyReview / scheduleNext's default mode) is
// unchanged and covered by srs.test.ts.

const DAY_MS = 86_400_000
const MIN_MS = 60_000
const NOW = 1_700_000_000_000

function state(over: Partial<SrsCardState>): SrsCardState {
  return { ...newSrsState(), ...over }
}

const self = (s: SrsCardState, g: Grade) => scheduleNext(s, g, NOW, 'self')

describe('self-graded ladder: first rep (a new card)', () => {
  it('Again relearns the same day (10 min), Hard 1 day, Good 1 day, Easy 4 days', () => {
    expect(AGAIN_RELEARN_MINUTES).toBe(10)
    expect(EASY_FIRST_INTERVAL_DAYS).toBe(4)
    expect(previewIntervals(null, NOW)).toEqual({ again: 0, hard: 1, good: 1, easy: 4 })
    const again = self(newSrsState(), 'again')
    expect(again.dueAt).toBe(NOW + AGAIN_RELEARN_MINUTES * MIN_MS)
    expect(again.intervalDays).toBe(0)
    expect(again.repetitions).toBe(0)
    expect(again.lapses).toBe(1)
    expect(self(newSrsState(), 'easy').dueAt).toBe(NOW + 4 * DAY_MS)
  })
})

describe('self-graded ladder: second rep', () => {
  it('Hard < Good < Easy strictly: 2 / 3 / 4 days', () => {
    expect(previewIntervals(state({ repetitions: 1, intervalDays: 1 }), NOW)).toEqual({ again: 0, hard: 2, good: 3, easy: 4 })
  })
})

describe('self-graded ladder: later reps', () => {
  it('Hard grows ×1.2, Good × ease, Easy × ease × the 1.3 bonus', () => {
    expect(EASY_BONUS).toBeCloseTo(1.3)
    const s = state({ repetitions: 3, intervalDays: 10, easeFactor: 2.5 })
    expect(previewIntervals(s, NOW)).toEqual({ again: 0, hard: 12, good: 25, easy: 33 })
  })

  it('Hard never exceeds Good, even at the lowest ease', () => {
    const s = state({ repetitions: 4, intervalDays: 3, easeFactor: MIN_EASE_FACTOR })
    const p = previewIntervals(s, NOW)
    expect(p.hard).toBeLessThanOrEqual(p.good)
    expect(p.good).toBeLessThan(p.easy)
  })

  it('ease moves: Hard −0.15, Easy +0.15 (floored / capped), Good unchanged', () => {
    const s = state({ repetitions: 2, intervalDays: 3, easeFactor: DEFAULT_EASE_FACTOR })
    expect(self(s, 'hard').easeFactor).toBeCloseTo(DEFAULT_EASE_FACTOR + EASE_DELTA_HARD)
    expect(self(s, 'easy').easeFactor).toBeCloseTo(DEFAULT_EASE_FACTOR + EASE_DELTA_EASY)
    expect(self(s, 'good').easeFactor).toBe(DEFAULT_EASE_FACTOR)
    expect(self(state({ repetitions: 3, intervalDays: 5, easeFactor: MIN_EASE_FACTOR + 0.05 }), 'hard').easeFactor).toBe(MIN_EASE_FACTOR)
  })

  it('is capped at the maximum interval', () => {
    const p = previewIntervals(state({ repetitions: 6, intervalDays: MAX_INTERVAL_DAYS }), NOW)
    for (const g of GRADES) expect(p[g]).toBeLessThanOrEqual(MAX_INTERVAL_DAYS)
  })

  it('keeps the lapse count on a pass (Hard is a pass, not a lapse)', () => {
    expect(self(state({ repetitions: 2, intervalDays: 3, lapses: 2 }), 'hard').lapses).toBe(2)
  })
})

describe('monotonic at every rep: Again < Hard <= Good < Easy', () => {
  // Walk a card up the ladder by each grade in turn, checking every step's preview.
  it.each(GRADES.filter(g => g !== 'again'))('along a %s path (reps 1–6)', (path) => {
    let s = newSrsState()
    for (let rep = 0; rep < 6; rep++) {
      const p = previewIntervals(s, NOW)
      if (p.good >= MAX_INTERVAL_DAYS) break // at the 180-day cap Good and Easy may meet
      expect(p.again).toBeLessThan(p.hard)     // never an Again/Hard tie
      expect(p.hard).toBeLessThanOrEqual(p.good)
      expect(p.good).toBeLessThan(p.easy)      // Easy strictly beats Good
      if (rep >= 1) expect(p.hard).toBeLessThan(p.easy)
      if (rep === 1) expect(p.hard).toBeLessThan(p.good)
      s = self(s, path)
    }
  })
})

describe('previewIntervals', () => {
  it('lists the four grades in order', () => {
    expect(GRADES).toEqual(['again', 'hard', 'good', 'easy'])
  })

  it('always agrees with scheduleNext (self-graded), so a button never promises what grading does not write', () => {
    for (const s of [newSrsState(), state({ repetitions: 1, intervalDays: 1 }), state({ repetitions: 4, intervalDays: 7, easeFactor: 1.9 })]) {
      const p = previewIntervals(s, NOW)
      for (const g of GRADES) expect(p[g]).toBe(scheduleNext(s, g, NOW, 'self').intervalDays)
    }
  })
})

describe('scheduleReview', () => {
  it('treats a missing row as a brand-new card, on the self-graded ladder', () => {
    expect(scheduleReview(null, 'good', NOW)).toEqual(scheduleNext(newSrsState(), 'good', NOW, 'self'))
  })
  it('schedules the given grade against the existing state', () => {
    const existing = state({ repetitions: 2, intervalDays: 3, easeFactor: 2.5, dueAt: NOW - 1 })
    for (const g of GRADES) expect(scheduleReview(existing, g, NOW)).toEqual(scheduleNext(existing, g, NOW, 'self'))
  })
  it('reads old stored rows as they are (any prior interval, grade or lapse count)', () => {
    const old = state({ repetitions: 5, intervalDays: 40, easeFactor: 2.2, lapses: 3, dueAt: NOW - DAY_MS, lastGrade: 'easy' })
    const s = scheduleReview(old, 'good', NOW)
    expect(s.intervalDays).toBe(88)
    expect(s.repetitions).toBe(6)
    expect(s.lapses).toBe(3)
  })
})

describe('the derived (multiple-choice) ladder is unchanged', () => {
  it('a new card answered fast is still 1 day, and a miss still 1 day', () => {
    expect(scheduleNext(newSrsState(), 'easy', NOW).intervalDays).toBe(1)
    expect(scheduleNext(newSrsState(), 'again', NOW).dueAt).toBe(NOW + DAY_MS)
  })
})

describe('formatIntervalDays', () => {
  it('names the unit in words; a same-day relearn reads in minutes', () => {
    expect(formatIntervalDays(0)).toBe('10 min')
    expect(formatIntervalDays(1)).toBe('1 day')
    expect(formatIntervalDays(3)).toBe('3 days')
    expect(formatIntervalDays(180)).toBe('180 days')
  })
})
