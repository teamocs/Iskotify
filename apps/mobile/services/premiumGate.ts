import type { DrizzleClient } from '../db/client'
import { canStartFullMock, practiceAllowance } from '../utils/premiumLimits'
import { getPremiumSnapshot } from './premiumState'
import { countFullMocks, countPracticeAnswersToday } from './premiumUsage'

// What a practice runner asks right before it starts a run. Fail-open on
// purpose: while the premium state is still loading, or if counting fails, a
// student is never blocked (a paying one must never be locked out by a glitch).

/** Practice questions this run may serve: Infinity when no limit applies. */
export async function practiceAllowanceNow(db: DrizzleClient): Promise<number> {
  const s = getPremiumSnapshot()
  if (s.unlimited || s.loading) return Infinity
  try {
    return practiceAllowance(await countPracticeAnswersToday(db))
  } catch (e) {
    console.warn('[premium] could not count today\'s practice:', e)
    return Infinity
  }
}

/** May a new FULL mock start for this exam? (Study Sprint is never gated.) */
export async function fullMockAllowedNow(db: DrizzleClient, listingSlug: string): Promise<boolean> {
  const s = getPremiumSnapshot()
  if (s.unlimited || s.loading) return true
  try {
    return canStartFullMock(await countFullMocks(db, listingSlug))
  } catch (e) {
    console.warn('[premium] could not count full mocks:', e)
    return true
  }
}
