// Retention policy for question_attempts (Task D telemetry). The table grows
// monotonically with lifetime practice usage — one row per question, every
// exam/upcat/diagnostic/flashcard run — and its FULL contents are re-sent on
// every services/sync.ts pushUserData() call (fired after every practice
// submission via hooks/useRecordSession.ts). Left unbounded, the push payload
// grows without limit for a long-lived user.
//
// Task G (analytics: weeks/months of trend data, "most common mistakes")
// needs a generous history, so this cap is intentionally large — a few
// thousand rows, not a small count or a short time window. 5000 rows covers
// years of typical practice volume while still keeping the push payload and
// on-device table bounded.
export const MAX_RETAINED_ATTEMPTS = 5000

/**
 * Pure cutoff logic: given the current total row count in question_attempts,
 * how many of the OLDEST rows (ordered by answeredAt ascending) should be
 * deleted to bring the table back within `cap`?
 *
 * Returns 0 when `totalCount` is already at or under the cap — callers
 * should treat 0 as "skip the DELETE entirely" so pruning stays cheap (a
 * single count check) on the common case where the cap hasn't been hit.
 */
export function computeAttemptsToPrune(totalCount: number, cap: number = MAX_RETAINED_ATTEMPTS): number {
  if (totalCount <= cap) return 0
  return totalCount - cap
}
