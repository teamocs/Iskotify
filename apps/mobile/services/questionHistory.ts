import { and, eq, inArray, isNotNull, max, notLike } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { questionAttempts, upcatQuestions } from '../db/schema'
import { openMistakeIds } from '../utils/mistakes'
import type { AttemptSourceTable } from '../utils/attemptRows'

// P4: the student's question history, read from question_attempts.
//  - getLastSeenByQuestionId feeds unseen-first sampling (utils/unseenFirst).
//  - getOpenMistakeIds feeds Mistakes mode (utils/mistakes).
// Both are served by the question_attempts (source_table, question_id,
// answered_at) index. Note the attempts table is capped (utils/attemptRetention);
// see utils/unseenFirst.ts for what that means for "seen".

/** SQLite's bound-parameter limit is 999 on older builds; stay well under it. */
export const SEEN_CHUNK_SIZE = 500

/**
 * question id -> when it was last served (MAX(answered_at)) for one source
 * table. Any attempt row counts, a skipped one too: served = seen. One grouped
 * query per chunk of at most SEEN_CHUNK_SIZE ids (normally a single query).
 */
export async function getLastSeenByQuestionId(
  db: DrizzleClient,
  sourceTable: AttemptSourceTable,
  ids: readonly string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(ids)]
  const seen = new Map<string, number>()
  for (let i = 0; i < unique.length; i += SEEN_CHUNK_SIZE) {
    const chunk = unique.slice(i, i + SEEN_CHUNK_SIZE)
    const rows = await db
      .select({ questionId: questionAttempts.questionId, lastSeen: max(questionAttempts.answeredAt) })
      .from(questionAttempts)
      .where(and(eq(questionAttempts.sourceTable, sourceTable), inArray(questionAttempts.questionId, chunk)))
      .groupBy(questionAttempts.questionId)
    for (const r of rows) {
      if (typeof r.questionId === 'string' && typeof r.lastSeen === 'number') seen.set(r.questionId, r.lastSeen)
    }
  }
  return seen
}

/**
 * getLastSeenByQuestionId for a run that is about to be sampled: history only
 * improves the mix, so a failed read never blocks the run (it samples as if
 * nothing was seen).
 */
export async function lastSeenOrEmpty(
  db: DrizzleClient,
  sourceTable: AttemptSourceTable,
  ids: readonly string[],
): Promise<Map<string, number>> {
  try {
    return await getLastSeenByQuestionId(db, sourceTable, ids)
  } catch (err) {
    console.warn('[questionHistory] last-seen lookup failed; sampling without history:', err)
    return new Map()
  }
}

/**
 * UPCAT bank questions the student answered wrong and hasn't answered
 * correctly since (the latest ANSWERED attempt is wrong; skips don't count
 * either way), newest mistake first. Only published questions; onboarding
 * pre-assessment ids ('pre-%') are excluded.
 */
export async function getOpenMistakeIds(db: DrizzleClient): Promise<string[]> {
  const rows = await db
    .select({ questionId: questionAttempts.questionId, answeredAt: questionAttempts.answeredAt, correct: questionAttempts.correct })
    .from(questionAttempts)
    .innerJoin(upcatQuestions, eq(upcatQuestions.questionId, questionAttempts.questionId))
    .where(and(
      eq(questionAttempts.sourceTable, 'upcat_questions'),
      isNotNull(questionAttempts.selectedIndex),
      notLike(questionAttempts.questionId, 'pre-%'),
      eq(upcatQuestions.status, 'published'),
    ))
  return openMistakeIds(rows.map(r => ({ questionId: r.questionId, answeredAt: r.answeredAt, correct: !!r.correct })))
}

/** How many open mistakes there are (the Practice tab's Mistakes tile). */
export async function countOpenMistakes(db: DrizzleClient): Promise<number> {
  return (await getOpenMistakeIds(db)).length
}
