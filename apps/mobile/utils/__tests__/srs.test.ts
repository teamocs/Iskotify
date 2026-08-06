import {
  applyReview, scheduleNext, deriveGrade, isDue, newSrsState,
  FAST_THRESHOLD_MS, DEFAULT_EASE_FACTOR, MIN_EASE_FACTOR, MAX_EASE_FACTOR,
  FIRST_INTERVAL_DAYS, LAPSE_INTERVAL_DAYS, MAX_INTERVAL_DAYS,
  type SrsCardState,
} from '../srs'

const DAY_MS = 86_400_000
const NOW = 1_700_000_000_000

describe('deriveGrade', () => {
  it('wrong answer is always Again, regardless of speed', () => {
    expect(deriveGrade(false, 500)).toBe('again')
    expect(deriveGrade(false, 60_000)).toBe('again')
  })
  it('correct + fast (<= threshold) is Easy', () => {
    expect(deriveGrade(true, 0)).toBe('easy')
    expect(deriveGrade(true, FAST_THRESHOLD_MS)).toBe('easy')
  })
  it('correct + slow (> threshold) is Good', () => {
    expect(deriveGrade(true, FAST_THRESHOLD_MS + 1)).toBe('good')
    expect(deriveGrade(true, 120_000)).toBe('good')
  })
})

describe('isDue', () => {
  it('a never-scheduled card (dueAt=0) is never due', () => {
    expect(isDue(0, NOW)).toBe(false)
    expect(isDue(0, 0)).toBe(false)
  })
  it('due exactly at or before now', () => {
    expect(isDue(NOW, NOW)).toBe(true)
    expect(isDue(NOW - 1, NOW)).toBe(true)
  })
  it('not yet due', () => {
    expect(isDue(NOW + 1, NOW)).toBe(false)
  })
})

describe('applyReview — brand-new card', () => {
  it('schedules a first correct+fast review sanely (1 day out, rep 1, ease bumped toward Easy)', () => {
    const state = applyReview(null, true, 1000, NOW)
    expect(state.repetitions).toBe(1)
    expect(state.intervalDays).toBe(FIRST_INTERVAL_DAYS)
    expect(state.dueAt).toBe(NOW + FIRST_INTERVAL_DAYS * DAY_MS)
    expect(state.easeFactor).toBeGreaterThan(DEFAULT_EASE_FACTOR)
    expect(state.lapses).toBe(0)
    expect(state.lastGrade).toBe('easy')
    expect(state.lastReviewedAt).toBe(NOW)
  })

  it('schedules a first correct+slow review sanely (1 day out, ease untouched)', () => {
    const state = applyReview(null, true, 20_000, NOW)
    expect(state.repetitions).toBe(1)
    expect(state.intervalDays).toBe(FIRST_INTERVAL_DAYS)
    expect(state.easeFactor).toBe(DEFAULT_EASE_FACTOR)
    expect(state.lastGrade).toBe('good')
  })

  it('a wrong first answer still produces a sane near-term reschedule + counts as a lapse', () => {
    const state = applyReview(null, false, 5000, NOW)
    expect(state.repetitions).toBe(0)
    expect(state.intervalDays).toBe(LAPSE_INTERVAL_DAYS)
    expect(state.dueAt).toBe(NOW + LAPSE_INTERVAL_DAYS * DAY_MS)
    expect(state.lapses).toBe(1)
    expect(state.easeFactor).toBeLessThan(DEFAULT_EASE_FACTOR)
    expect(state.lastGrade).toBe('again')
  })
})

describe('the 1d → 3d → ~1w progression (brief-specified ladder)', () => {
  it('three consecutive Good (correct+slow) reviews grow 1d → 3d → round(3*ease)d', () => {
    let state: SrsCardState | null = null
    let now = NOW

    state = applyReview(state, true, 20_000, now) // 1st correct
    expect(state.intervalDays).toBe(1)
    expect(state.repetitions).toBe(1)

    now += state.intervalDays * DAY_MS
    state = applyReview(state, true, 20_000, now) // 2nd correct
    expect(state.intervalDays).toBe(3)
    expect(state.repetitions).toBe(2)

    now += state.intervalDays * DAY_MS
    state = applyReview(state, true, 20_000, now) // 3rd correct
    // ease stayed at the default 2.5 (Good never bumps it) → 3 * 2.5 = 7.5 → 8
    expect(state.easeFactor).toBe(DEFAULT_EASE_FACTOR)
    expect(state.intervalDays).toBe(8)
    expect(state.repetitions).toBe(3)
    expect(state.dueAt).toBe(now + 8 * DAY_MS)
  })

  it('three consecutive Easy (correct+fast) reviews grow the interval AND the ease factor', () => {
    let state: SrsCardState | null = null
    let now = NOW

    state = applyReview(state, true, 500, now)
    expect(state.intervalDays).toBe(1)
    expect(state.easeFactor).toBeCloseTo(DEFAULT_EASE_FACTOR + 0.15, 5)

    now += state.intervalDays * DAY_MS
    state = applyReview(state, true, 500, now)
    expect(state.intervalDays).toBe(3)
    expect(state.easeFactor).toBeCloseTo(DEFAULT_EASE_FACTOR + 0.3, 5)

    now += state.intervalDays * DAY_MS
    state = applyReview(state, true, 500, now)
    // 3 * 2.8 = 8.4 → 8, and growing faster than the all-Good path above
    expect(state.intervalDays).toBe(8)
    expect(state.easeFactor).toBeCloseTo(DEFAULT_EASE_FACTOR + 0.45, 5)
  })
})

describe('lapse reset', () => {
  it('an Again after several successful reps resets repetitions/interval and increments lapses', () => {
    let state: SrsCardState | null = null
    let now = NOW
    // Build up to rep 3 (interval 8, ease 2.5) via three Good reviews.
    state = applyReview(state, true, 20_000, now)
    now += state.intervalDays * DAY_MS
    state = applyReview(state, true, 20_000, now)
    now += state.intervalDays * DAY_MS
    state = applyReview(state, true, 20_000, now)
    expect(state.repetitions).toBe(3)
    expect(state.intervalDays).toBe(8)
    expect(state.lapses).toBe(0)

    // Now forget it.
    now += state.intervalDays * DAY_MS
    const preLapseEase = state.easeFactor
    state = applyReview(state, false, 4000, now)

    expect(state.repetitions).toBe(0)
    expect(state.intervalDays).toBe(LAPSE_INTERVAL_DAYS)
    expect(state.dueAt).toBe(now + LAPSE_INTERVAL_DAYS * DAY_MS)
    expect(state.lapses).toBe(1)
    expect(state.easeFactor).toBeCloseTo(preLapseEase - 0.2, 5)
    expect(state.lastGrade).toBe('again')

    // A subsequent correct review restarts the ladder from 1 day.
    now += state.intervalDays * DAY_MS
    state = applyReview(state, true, 20_000, now)
    expect(state.intervalDays).toBe(1)
    expect(state.repetitions).toBe(1)
  })

  it('repeated lapses keep incrementing the counter', () => {
    let state: SrsCardState | null = null
    let now = NOW
    state = applyReview(state, false, 1000, now)
    now += DAY_MS
    state = applyReview(state, false, 1000, now)
    now += DAY_MS
    state = applyReview(state, false, 1000, now)
    expect(state.lapses).toBe(3)
    expect(state.repetitions).toBe(0)
  })
})

describe('ease-factor clamps', () => {
  it('easeFactor never exceeds MAX_EASE_FACTOR even after many Easy reviews', () => {
    let state: SrsCardState | null = null
    let now = NOW
    for (let i = 0; i < 20; i++) {
      state = applyReview(state, true, 100, now)
      now += Math.max(1, state.intervalDays) * DAY_MS
    }
    expect(state!.easeFactor).toBeLessThanOrEqual(MAX_EASE_FACTOR)
    expect(state!.easeFactor).toBe(MAX_EASE_FACTOR)
  })

  it('easeFactor never drops below MIN_EASE_FACTOR even after many lapses', () => {
    let state: SrsCardState | null = null
    let now = NOW
    for (let i = 0; i < 20; i++) {
      state = applyReview(state, false, 1000, now)
      now += DAY_MS
    }
    expect(state!.easeFactor).toBeGreaterThanOrEqual(MIN_EASE_FACTOR)
    expect(state!.easeFactor).toBe(MIN_EASE_FACTOR)
  })

  it('intervalDays never exceeds MAX_INTERVAL_DAYS even with a maxed-out ease factor', () => {
    let state: SrsCardState = { ...newSrsState(), repetitions: 5, intervalDays: 170, easeFactor: MAX_EASE_FACTOR }
    state = scheduleNext(state, 'good', NOW)
    expect(state.intervalDays).toBeLessThanOrEqual(MAX_INTERVAL_DAYS)
    expect(state.intervalDays).toBe(MAX_INTERVAL_DAYS)
  })
})

describe('newSrsState', () => {
  it('is the null-state a never-reviewed card starts from', () => {
    const state = newSrsState()
    expect(state.dueAt).toBe(0)
    expect(state.repetitions).toBe(0)
    expect(state.lapses).toBe(0)
    expect(state.easeFactor).toBe(DEFAULT_EASE_FACTOR)
    expect(state.lastReviewedAt).toBeNull()
    expect(state.lastGrade).toBeNull()
    expect(isDue(state.dueAt, NOW)).toBe(false)
  })
})
