/**
 * services/srsAggregates.ts
 *
 * SQL aggregate helpers for Task H's flashcard_srs (spaced-repetition) table.
 * Kept separate from services/homeAggregates.ts, which predates SRS and is
 * scoped to user_progress/practice_sessions session data — this file is the
 * flashcard_srs-specific counterpart.
 *
 * Pure DB reads (no React) so they're unit-testable under the real-SQLite
 * services Jest project, same convention as homeAggregates.ts.
 */

import { and, eq, inArray, gt, lte } from 'drizzle-orm'
import { flashcardSrs, flashcards } from '../db/schema'
import type { DrizzleClient } from '../db/client'
import { dedupeByStem } from '../utils/flashcardExam'

export interface DueFlashcardRow {
  flashcardId: string
  topicId: string
  dueAt: number
}

/**
 * getDueFlashcards — every published flashcard whose flashcard_srs row is
 * currently due (0 < dueAt <= now). A card with no flashcard_srs row (never
 * reviewed) never appears — "due" describes the review queue, not the whole
 * unreviewed catalog (see utils/srs.ts's isDue).
 *
 * `ids`, when passed, scopes the result to that flashcard id set (e.g. a
 * single topic/deck/listing's card pool for a chooser's "Due today" option).
 * Passing an explicit EMPTY array returns [] immediately rather than falling
 * through to "all due flashcards" — callers scoping to a card pool that
 * happens to be empty must get an empty due list, not the global one.
 *
 * Task H bugfix: the result is collapsed with utils/flashcardExam.ts's
 * dedupeByStem — the SAME normalized-stem-collision rule pickQuestions('due',
 * …) applies before it ever serves a quiz. Before this, a "Due today (N)"
 * badge built from this list's raw length could promise more cards than
 * pickQuestions('due', …) actually delivered whenever two due cards shared a
 * normalized stem (pickQuestions deduped, this function didn't). Reusing the
 * one imported helper — rather than reimplementing the rule here — is what
 * keeps the count and the served quiz from drifting apart again.
 */
export async function getDueFlashcards(
  db: DrizzleClient,
  now: number = Date.now(),
  ids?: string[],
): Promise<DueFlashcardRow[]> {
  if (ids && ids.length === 0) return []

  const conds = [
    eq(flashcards.status, 'published'),
    gt(flashcardSrs.dueAt, 0),
    lte(flashcardSrs.dueAt, now),
  ]
  if (ids && ids.length > 0) conds.push(inArray(flashcardSrs.flashcardId, ids))

  const rows = await db
    .select({
      flashcardId: flashcardSrs.flashcardId,
      topicId: flashcards.topicId,
      dueAt: flashcardSrs.dueAt,
      // Pulled only to compute the dedup key below — not part of the public
      // DueFlashcardRow shape (matches the `stem` pickQuestions dedupes on
      // for the common, non-embedded-MCQ card: see mcDistractors.ts's
      // buildQuizQuestions, which uses card.question.trim() as the stem for
      // AI-enhanced/admin-option cards, i.e. the vast majority of cards a
      // chooser has already run through on-demand enhancement before quiz).
      question: flashcards.question,
    })
    .from(flashcardSrs)
    .innerJoin(flashcards, eq(flashcardSrs.flashcardId, flashcards.id))
    .where(and(...conds))

  const mapped = rows.map(r => ({
    flashcardId: r.flashcardId,
    topicId: r.topicId,
    dueAt: Number(r.dueAt),
    stem: r.question,
  }))
  return dedupeByStem(mapped).map(({ stem: _stem, ...row }) => row)
}

export interface DueCounts {
  total: number
  byTopic: Record<string, number>
}

/**
 * getDueCounts — total due-card count + a per-topic breakdown (for deck due
 * badges, which sum byTopic over a deck's topicIds — same shape convention as
 * usePracticeData's cardCountByTopic).
 */
export async function getDueCounts(
  db: DrizzleClient,
  now: number = Date.now(),
): Promise<DueCounts> {
  const rows = await getDueFlashcards(db, now)
  const byTopic: Record<string, number> = {}
  for (const r of rows) byTopic[r.topicId] = (byTopic[r.topicId] ?? 0) + 1
  return { total: rows.length, byTopic }
}
