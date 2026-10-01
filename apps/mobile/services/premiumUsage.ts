import { and, count, countDistinct, eq, exists, gte, isNotNull, lt } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { practiceSessions, questionAttempts } from '../db/schema'
import { manilaDayBounds } from '../utils/premiumLimits'

/**
 * Practice questions the student answered today (Manila calendar day), for the
 * free daily limit. Only bank-question drills count: a question_attempts row
 * from upcat_questions whose sitting (session_key = practice_sessions.attempt_key)
 * is a 'drill'. The diagnostic, the onboarding check, full mocks, Study Sprint
 * and flashcards are free and never counted. Skipped questions (no pick) don't
 * count either.
 */
export async function countPracticeAnswersToday(db: DrizzleClient, now: number = Date.now()): Promise<number> {
  const { start, end } = manilaDayBounds(now)
  const drill = db.select({ one: practiceSessions.id }).from(practiceSessions).where(and(
    eq(practiceSessions.attemptKey, questionAttempts.sessionKey),
    eq(practiceSessions.kind, 'drill'),
  ))
  const rows = await db.select({ n: count() }).from(questionAttempts).where(and(
    eq(questionAttempts.sourceTable, 'upcat_questions'),
    gte(questionAttempts.answeredAt, start),
    lt(questionAttempts.answeredAt, end),
    isNotNull(questionAttempts.selectedIndex),
    exists(drill),
  ))
  return rows[0]?.n ?? 0
}

/** Completed FULL mock sittings for one exam (a sitting writes one row per section). */
export async function countFullMocks(db: DrizzleClient, listingSlug: string): Promise<number> {
  const rows = await db.select({ n: countDistinct(practiceSessions.attemptKey) }).from(practiceSessions).where(and(
    eq(practiceSessions.listingSlug, listingSlug),
    eq(practiceSessions.kind, 'mock'),
  ))
  return rows[0]?.n ?? 0
}
