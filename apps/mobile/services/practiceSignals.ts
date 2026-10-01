/**
 * services/practiceSignals.ts
 *
 * Small reads that feed the Practice tab's "one next step"
 * (utils/nextPracticeAction.ts): recent UPCAT accuracy per subtest, so a
 * student who only takes UPCAT drills/mocks still gets a weak-area step, and
 * whether a diagnostic was already taken, so it is not offered again. Also
 * whether an exam has flashcard topics to review, so a "Practise" button only
 * appears where there is something to practise.
 */

import { sql, eq, and, like } from 'drizzle-orm'
import { practiceSessions, flashcards, topics } from '../db/schema'
import type { DrizzleClient } from '../db/client'
import { READINESS_WINDOW, READINESS_MIN_ANSWERED } from '../utils/subjectReadiness'
import { SUBTESTS } from '../utils/upcatExam'

export interface SubtestAccuracyRow {
  subtest: string
  pct: number
  answered: number
}

/**
 * Weighted accuracy over each UPCAT subtest's most recent READINESS_WINDOW
 * answered bank questions; absent below READINESS_MIN_ANSWERED answers. Same
 * evidence rules as homeAggregates.getSubjectRecentAccuracy's attempt half:
 * upcat_questions only, skipped answers and bundled 'pre-' ids never count.
 */
export async function getUpcatSubtestAccuracy(db: DrizzleClient): Promise<SubtestAccuracyRow[]> {
  const subtests = sql.join(SUBTESTS.map(s => sql`${s}`), sql`, `)
  const rows = await db.all<{ key: string; answered: number; ok: number }>(sql`
    WITH ranked AS (
      SELECT qa.subtest AS k, qa.correct AS correct,
             ROW_NUMBER() OVER (PARTITION BY qa.subtest ORDER BY qa.answered_at DESC, qa.id DESC) AS rn
        FROM question_attempts qa
       WHERE qa.source_table = 'upcat_questions'
         AND qa.selected_index IS NOT NULL
         AND qa.question_id NOT LIKE 'pre-%'
         AND qa.subtest IN (${subtests})
    )
    SELECT k AS key, COUNT(*) AS answered, SUM(correct) AS ok
    FROM ranked
    WHERE rn <= ${READINESS_WINDOW}
    GROUP BY k
    HAVING COUNT(*) >= ${READINESS_MIN_ANSWERED}
  `)
  return rows.map(r => ({
    subtest: String(r.key),
    pct: Math.round((Number(r.ok) * 100) / Number(r.answered)),
    answered: Number(r.answered),
  }))
}

/** True once any diagnostic sitting is recorded (practice_sessions kind 'diagnostic'). */
export async function hasTakenDiagnostic(db: DrizzleClient): Promise<boolean> {
  const rows = await db.select({ id: practiceSessions.id }).from(practiceSessions)
    .where(eq(practiceSessions.kind, 'diagnostic')).limit(1)
  return rows.length > 0
}

/**
 * True when the exam has topic review content: a published flashcard of an
 * existing topic tagged with this listing slug (the same tagging
 * /practice/review/<slug> lists; slugs are [a-z0-9-], LIKE needs no escaping).
 */
export async function hasReviewContent(db: DrizzleClient, slug: string): Promise<boolean> {
  const rows = await db.select({ id: flashcards.id }).from(flashcards)
    .innerJoin(topics, eq(topics.id, flashcards.topicId))
    .where(and(eq(flashcards.status, 'published'), like(flashcards.listingSlugs, `%"${slug}"%`)))
    .limit(1)
  return rows.length > 0
}
