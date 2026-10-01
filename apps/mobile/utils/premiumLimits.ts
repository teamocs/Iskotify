// Iskotify Full Access (P3): the free limits and the pure rules around them.
// One-time ₱500, no ads, no subscription. Every number the paywall uses lives
// here so the free tier can be tuned in one place.
//
// Free: diagnostic, explore/scholarships, notes, estimator, flashcards, Study
// Sprint, every explanation (main and per-option), FREE_FULL_MOCKS_PER_EXAM
// full mock per exam, and up to FREE_DAILY_PRACTICE_QUESTIONS practice
// questions per Manila calendar day. Full Access: unlimited practice and
// unlimited full mocks. (Per-option explanations may return to the paid list
// once >=90% of questions carry checked ones.)

import { DAY_MS, localDayIndex } from './localDay'

export const FREE_DAILY_PRACTICE_QUESTIONS = 30
export const FREE_FULL_MOCKS_PER_EXAM = 1

/** Manila is UTC+8 all year (no daylight saving). */
export const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000

/**
 * The paywall flag. Off (anything but '1') means the app behaves exactly as it
 * did before Full Access existed: no limits and no upgrade UI anywhere. Read at
 * call time; the full `process.env.EXPO_PUBLIC_…` expression is what Expo inlines.
 */
export function isPaywallEnabled(): boolean {
  return process.env.EXPO_PUBLIC_PAYWALL_ENABLED === '1'
}

/** Start (inclusive) and end (exclusive) epoch ms of the Manila calendar day holding `now`. */
export function manilaDayBounds(now: number): { start: number; end: number } {
  const start = localDayIndex(now, MANILA_OFFSET_MS) * DAY_MS - MANILA_OFFSET_MS
  return { start, end: start + DAY_MS }
}

/** Free practice questions still available today (Infinity with Full Access). */
export function practiceAllowance(answeredToday: number, unlimited = false): number {
  if (unlimited) return Infinity
  const used = Number.isFinite(answeredToday) && answeredToday > 0 ? Math.floor(answeredToday) : 0
  return Math.max(0, FREE_DAILY_PRACTICE_QUESTIONS - used)
}

/** May a new practice run start, given today's answered practice questions? */
export function canStartPractice(answeredToday: number, unlimited = false): boolean {
  return practiceAllowance(answeredToday, unlimited) > 0
}

/** May a new FULL mock start for this exam? Study Sprint is never gated. */
export function canStartFullMock(completedFullMocksForListing: number, unlimited = false): boolean {
  if (unlimited) return true
  return completedFullMocksForListing < FREE_FULL_MOCKS_PER_EXAM
}

/**
 * Full Access comes from ONE place: the server entitlement row for the
 * signed-in student (`row`; null when it could not be read). The store's own
 * customer info is never trusted for this: a RevenueCat app_user_id is set by
 * the client, so it could show someone else's purchase. Both the Play webhook
 * and the PayMongo webhook write the row. When the row could not be read
 * (offline) the last known state stands, so a paying student keeps access.
 * Signed out is never premium: a purchase belongs to an account.
 */
export function resolvePremium(input: { signedIn: boolean; row: boolean | null; cached: boolean }): boolean {
  if (!input.signedIn) return false
  if (input.row === null) return input.cached
  return input.row
}

/**
 * Cut a run down to today's free allowance without splitting a passage set.
 * A set is the run of consecutive questions sharing a setId (buildExam keeps
 * each set together); a question without a setId is a set of one.
 * Rule: take whole sets in order while they fit, and stop at the first one that
 * doesn't. The one exception: if the FIRST set alone is bigger than a non-zero
 * allowance, it is served whole, so the run is never empty and goes over the
 * allowance by less than one set. An allowance of 0 serves nothing.
 */
export function trimToAllowance<T extends { setId: string | null }>(questions: T[], allowance: number): T[] {
  if (allowance <= 0) return []
  if (questions.length <= allowance) return questions
  const out: T[] = []
  let i = 0
  while (i < questions.length) {
    const setId = questions[i]!.setId
    let end = i + 1
    if (setId) while (end < questions.length && questions[end]!.setId === setId) end++
    const size = end - i
    if (out.length + size > allowance && out.length > 0) break
    out.push(...questions.slice(i, end))
    if (out.length >= allowance) break
    i = end
  }
  return out
}
