// Pure SM-2-lite spaced-repetition scheduler for flashcards (Task H). No
// React/DB — hooks/useRecordSrs.ts reads a flashcard_srs row (or null for a
// never-reviewed card), calls applyReview(), and writes the result back.
//
// ── Grade derivation ─────────────────────────────────────────────────────────
// Flashcard reviews here are MCQs (not a self-graded "how well did I
// remember" prompt), so the grade is DERIVED rather than asked for:
//   - wrong                       → Again  (forgot it — reset progress)
//   - correct AND answered fast   → Easy   (confident recall — grow faster)
//   - correct AND answered slow   → Good   (recalled, but had to think)
//
// FAST_THRESHOLD_MS picks the fast/slow boundary. elapsedMs (from
// utils/attemptTiming.ts) is CUMULATIVE dwell time on a question, including
// any time spent after navigating back to it — so it is not a clean
// "time to first answer" signal and must not be set tight. 10 seconds is
// generous enough to absorb reading a multi-line stem + 4 options and a
// short revisit, while still separating "recognized it immediately" from
// "had to work it out" for the vast majority of genuine MCQ reviews.
export const FAST_THRESHOLD_MS = 10_000

export type Grade = 'again' | 'good' | 'easy'

// ── SM-2 constants (clamped, day-granularity "lite" variant) ────────────────
export const DEFAULT_EASE_FACTOR = 2.5
export const MIN_EASE_FACTOR = 1.3
export const MAX_EASE_FACTOR = 3.0
export const EASE_DELTA_EASY = 0.15
export const EASE_DELTA_AGAIN = -0.2
export const FIRST_INTERVAL_DAYS = 1
export const SECOND_INTERVAL_DAYS = 3
export const LAPSE_INTERVAL_DAYS = 1
export const MAX_INTERVAL_DAYS = 180

const DAY_MS = 86_400_000

export interface SrsCardState {
  intervalDays: number
  easeFactor: number
  repetitions: number
  lapses: number
  /** Epoch ms the card next becomes due. 0 = never reviewed / not scheduled. */
  dueAt: number
  lastReviewedAt: number | null
  lastGrade: Grade | null
}

/** A brand-new card that has never been through applyReview(). */
export function newSrsState(): SrsCardState {
  return {
    intervalDays: 0,
    easeFactor: DEFAULT_EASE_FACTOR,
    repetitions: 0,
    lapses: 0,
    dueAt: 0,
    lastReviewedAt: null,
    lastGrade: null,
  }
}

/** Derives a review grade from raw MCQ outcome + response time. Pure. */
export function deriveGrade(correct: boolean, elapsedMs: number): Grade {
  if (!correct) return 'again'
  return elapsedMs <= FAST_THRESHOLD_MS ? 'easy' : 'good'
}

/**
 * isDue — true when a scheduled card (dueAt > 0) is due at `now`. A card with
 * dueAt === 0 has never been reviewed and is intentionally excluded — "due"
 * describes the review queue, not the full unreviewed catalog.
 */
export function isDue(dueAt: number, now: number): boolean {
  return dueAt > 0 && dueAt <= now
}

/**
 * scheduleNext — advances `state` by one review of `grade`, landing at `now`.
 * Pure; does not read the clock itself so callers/tests stay deterministic.
 *
 * Ladder (correct reviews): 1st correct rep → 1 day, 2nd → 3 days, 3rd+ →
 * previous interval × easeFactor (≈1 week once ease reaches the 2.5 default:
 * 3 × 2.5 = 7.5 → 8 days), capped at MAX_INTERVAL_DAYS. `easy` nudges ease up
 * (grows future intervals faster); `good` leaves ease untouched — this is the
 * "lite" simplification versus full SM-2's per-quality EF formula.
 *
 * A lapse (`again`) resets repetitions to 0 and the interval to
 * LAPSE_INTERVAL_DAYS, nudges ease down (harder future growth), and always
 * increments `lapses` — including on a brand-new card's first miss, which we
 * treat as "failed to learn" rather than skipping the counter.
 */
export function scheduleNext(state: SrsCardState, grade: Grade, now: number): SrsCardState {
  if (grade === 'again') {
    const easeFactor = Math.max(MIN_EASE_FACTOR, state.easeFactor + EASE_DELTA_AGAIN)
    return {
      intervalDays: LAPSE_INTERVAL_DAYS,
      easeFactor,
      repetitions: 0,
      lapses: state.lapses + 1,
      dueAt: now + LAPSE_INTERVAL_DAYS * DAY_MS,
      lastReviewedAt: now,
      lastGrade: grade,
    }
  }

  let intervalDays: number
  if (state.repetitions === 0) intervalDays = FIRST_INTERVAL_DAYS
  else if (state.repetitions === 1) intervalDays = SECOND_INTERVAL_DAYS
  else intervalDays = Math.round(state.intervalDays * state.easeFactor)
  intervalDays = Math.min(MAX_INTERVAL_DAYS, Math.max(1, intervalDays))

  const easeFactor = grade === 'easy'
    ? Math.min(MAX_EASE_FACTOR, state.easeFactor + EASE_DELTA_EASY)
    : state.easeFactor

  return {
    intervalDays,
    easeFactor,
    repetitions: state.repetitions + 1,
    lapses: state.lapses,
    dueAt: now + intervalDays * DAY_MS,
    lastReviewedAt: now,
    lastGrade: grade,
  }
}

/**
 * applyReview — convenience wrapper combining deriveGrade + scheduleNext for
 * a single MCQ outcome. `existing` is null for a card with no flashcard_srs
 * row yet (never reviewed).
 */
export function applyReview(
  existing: SrsCardState | null,
  correct: boolean,
  elapsedMs: number,
  now: number,
): SrsCardState {
  const grade = deriveGrade(correct, elapsedMs)
  return scheduleNext(existing ?? newSrsState(), grade, now)
}
