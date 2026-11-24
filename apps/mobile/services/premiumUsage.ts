import { and, count, countDistinct, eq, exists, gte, isNotNull, lt } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { examRuns, practiceSessions, questionAttempts } from '../db/schema'
import { isRunExpired, safeParseJson } from '../utils/examRunPersistence'
import { manilaDayBounds } from '../utils/premiumLimits'
import { upcatDrillKind } from '../utils/sessionKind'

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

/**
 * Saved runs that can still turn into a sitting: time left, or last touched today
 * (Manila). An older abandoned run never eats a later day's allowance. `exceptKey`
 * is the run about to be replaced or resumed.
 */
async function openRuns(db: DrizzleClient, exceptKey: string, now: number) {
  const { start } = manilaDayBounds(now)
  const rows = await db.select().from(examRuns)
  return rows.filter(r => r.runKey !== exceptKey && (r.updatedAt >= start || (r.endTime != null && r.endTime > now)))
}

/**
 * Free practice questions already handed out to other unfinished drills: without
 * this, several runs opened before any is submitted would each get the full daily
 * limit. Every question while the clock runs; only the answered ones after.
 */
export async function countPracticeHeld(db: DrizzleClient, exceptKey: string, now: number = Date.now()): Promise<number> {
  let held = 0
  for (const r of await openRuns(db, exceptKey, now)) {
    if (r.kind !== 'upcat' || upcatDrillKind(r.slug, r.mode) !== 'drill') continue
    held += isRunExpired(r, now)
      ? Object.keys(safeParseJson<Record<number, number>>(r.answers, {})).length
      : safeParseJson<string[]>(r.questionIds, []).length
  }
  return held
}

/** Is another full mock of this exam unfinished? (UPCAT has two full-mock routes.) */
export async function hasHeldFullMock(db: DrizzleClient, listingSlug: string, exceptKey: string, now: number = Date.now()): Promise<boolean> {
  return (await openRuns(db, exceptKey, now)).some(r =>
    r.kind === 'exam' ? r.slug === listingSlug && r.mode === 'full'
      : r.kind === 'upcat' && listingSlug === 'upcat' && upcatDrillKind(r.slug, r.mode) === 'mock')
}
