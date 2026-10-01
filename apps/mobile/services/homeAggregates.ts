/**
 * services/homeAggregates.ts
 *
 * SQL aggregate helpers for hot-path home/practice screen data.
 * These replace full-table-scan JS loops in useHomeStats and usePracticeData
 * with server-computed GROUP BY / COUNT aggregates.
 *
 * All functions are pure (no React) so they can be unit-tested under the
 * real-SQLite services Jest project.
 */

import { sql, and, gte, like, eq, ne } from 'drizzle-orm'
import { union } from 'drizzle-orm/sqlite-core'
import { userProgress, flashcards, topics, practiceSessions } from '../db/schema'
import type { DrizzleClient } from '../db/client'
import { READINESS_WINDOW, READINESS_MIN_ANSWERED } from '../utils/subjectReadiness'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TodayAccuracyRow {
  total: number
  correct: number
}

export interface PracticeDayRow {
  dayIndex: number
}

export interface WeakTopicStatRow {
  topicId: string
  total: number
  ok: number
}

export interface TopicCardCountRow {
  topicId: string
  cardCount: number
}

export interface ListingAccuracyRow {
  listingSlug: string
  ok: number
  total: number
}

export interface TopicRecentAccuracyRow {
  topicId: string
  pct: number
  answered: number
}

export interface SubjectRecentAccuracyRow {
  subject: string
  pct: number
  answered: number
}

export interface ListingMockBestRow {
  listingSlug: string
  bestPct: number
}

// ── Aggregate functions ────────────────────────────────────────────────────────

/**
 * getTodayAccuracy — count total and correct answers since todayStart (ms).
 *
 * Returns { total, correct } — caller divides to get a percentage.
 * Returns { total: 0, correct: 0 } when no rows (todayAccuracy = null).
 */
export async function getTodayAccuracy(
  db: DrizzleClient,
  todayStart: number,
): Promise<TodayAccuracyRow> {
  const rows = await db
    .select({
      total: sql<number>`count(*)`.as('total'),
      correct: sql<number>`sum(case when ${userProgress.correct} = 1 then 1 else 0 end)`.as('correct'),
    })
    .from(userProgress)
    .where(gte(userProgress.answeredAt, todayStart))

  const row = rows[0]
  return {
    total: Number(row?.total ?? 0),
    correct: Number(row?.correct ?? 0),
  }
}

/**
 * getPracticeDayIndices — distinct day bucket indices for every study activity:
 * the SQL UNION of user_progress.answeredAt (flashcard reviews, also cloud sync)
 * and practice_sessions.completedAt (locally recorded sessions). Completing a
 * practice session writes ONLY practice_sessions, so both tables must count.
 *
 * `offsetMs` is applied inside the bucket math — pass localDayOffsetMs() so a
 * timestamp buckets into the user's LOCAL calendar day instead of the UTC day:
 *   dayIndex = cast((ts + offsetMs) / 86400000 as integer)
 * Defaults to 0 (UTC days) for backward compatibility.
 *
 * Returns an array of unique day indices (epoch-day integers — UNION dedupes).
 * Used by computeStreakFromDays and for the calendar heatmap.
 */
export async function getPracticeDayIndices(
  db: DrizzleClient,
  offsetMs = 0,
): Promise<number[]> {
  const DAY_MS = 86_400_000
  const progressDays = db
    .select({
      dayIndex: sql<number>`cast((${userProgress.answeredAt} + ${offsetMs}) / ${DAY_MS} as integer)`.as('day_index'),
    })
    .from(userProgress)
    .groupBy(sql`cast((${userProgress.answeredAt} + ${offsetMs}) / ${DAY_MS} as integer)`)
  const sessionDays = db
    .select({
      dayIndex: sql<number>`cast((${practiceSessions.completedAt} + ${offsetMs}) / ${DAY_MS} as integer)`.as('day_index'),
    })
    .from(practiceSessions)
    .groupBy(sql`cast((${practiceSessions.completedAt} + ${offsetMs}) / ${DAY_MS} as integer)`)

  const rows = await union(progressDays, sessionDays)
  return rows.map(r => Number(r.dayIndex))
}

/**
 * getWeakTopicStats — JOIN user_progress with flashcards, GROUP BY topic_id.
 *
 * Returns { topicId, total, ok } for every topic that has at least one progress row.
 * Caller filters to accuracy < 60% and sorts to produce WeakTopics.
 * Only counts published flashcards (status='published').
 */
export async function getWeakTopicStats(db: DrizzleClient): Promise<WeakTopicStatRow[]> {
  const rows = await db
    .select({
      topicId: flashcards.topicId,
      total: sql<number>`count(*)`.as('total'),
      ok: sql<number>`sum(case when ${userProgress.correct} = 1 then 1 else 0 end)`.as('ok'),
    })
    .from(userProgress)
    .innerJoin(flashcards, sql`${userProgress.flashcardId} = ${flashcards.id}`)
    .where(eq(flashcards.status, 'published'))
    .groupBy(flashcards.topicId)

  return rows.map(r => ({
    topicId: r.topicId,
    total: Number(r.total),
    ok: Number(r.ok),
  }))
}

/**
 * getTopicCardCounts — count published flashcards per topic, optionally filtered to a listing slug.
 *
 * listingSlug filter: uses LIKE '%"<slug>"%' against the listing_slugs JSON array column.
 * Slug characters are [a-z0-9-] so no special escaping needed.
 * Only counts published flashcards (status='published') so draft/unpublished cards
 * are excluded from the deck counts shown in the UI.
 */
export async function getTopicCardCounts(
  db: DrizzleClient,
  listingSlug?: string,
): Promise<TopicCardCountRow[]> {
  const statusFilter = eq(flashcards.status, 'published')
  const whereClause = listingSlug
    ? and(statusFilter, like(flashcards.listingSlugs, `%"${listingSlug}"%`))
    : statusFilter

  const rows = await db
    .select({
      topicId: flashcards.topicId,
      cardCount: sql<number>`count(*)`.as('card_count'),
    })
    .from(flashcards)
    .where(whereClause)
    .groupBy(flashcards.topicId)

  return rows.map(r => ({
    topicId: r.topicId,
    cardCount: Number(r.cardCount),
  }))
}

/**
 * getTopicNames — small lookup: all topic ids + names.
 * Kept here so callers can build the topicId→name map in one query.
 */
export async function getTopicNames(
  db: DrizzleClient,
): Promise<Array<{ id: string; name: string }>> {
  return db.select({ id: topics.id, name: topics.name }).from(topics)
}

/**
 * getListingAccuracy — per-listing score/total sums from practice_sessions.
 *
 * SELECT listing_slug, SUM(score), SUM(total)
 * FROM practice_sessions
 * WHERE total > 0 AND listing_slug != ''
 * GROUP BY listing_slug
 *
 * Returns an array of { listingSlug, ok, total } rows.
 * Rows with total=0 are excluded (division by zero guard).
 * Rows with an empty listing_slug are excluded (sentinel / untagged sessions).
 */
export async function getListingAccuracy(
  db: DrizzleClient,
): Promise<ListingAccuracyRow[]> {
  const rows = await db
    .select({
      listingSlug: practiceSessions.listingSlug,
      ok: sql<number>`sum(${practiceSessions.score})`.as('ok'),
      total: sql<number>`sum(${practiceSessions.total})`.as('total'),
    })
    .from(practiceSessions)
    .where(and(
      sql`${practiceSessions.total} > 0`,
      ne(practiceSessions.listingSlug, ''),
    ))
    .groupBy(practiceSessions.listingSlug)

  return rows.map(r => ({
    listingSlug: r.listingSlug,
    ok: Number(r.ok ?? 0),
    total: Number(r.total ?? 0),
  }))
}

interface RecentAccuracyRaw { key: string; answered: number; ok: number }

/**
 * getSubjectRecentAccuracy — per-SUBJECT readiness: weighted accuracy over the
 * most recent READINESS_WINDOW (60) ANSWERED questions, keyed by subject NAME.
 *
 * Flashcard answers resolve to a subject via flashcards.topic_id -> topics ->
 * subjects; UPCAT attempts use their canonical `subtest`, which equals the
 * subject name because flashcard subjects are projected from the UPCAT subtests.
 * A subject with fewer than READINESS_MIN_ANSWERED (10) answers is absent
 * ("Not started"). Replaces the all-time best session % (a single lucky result
 * stuck forever). Returns rounded integer percentages.
 */
export async function getSubjectRecentAccuracy(db: DrizzleClient): Promise<SubjectRecentAccuracyRow[]> {
  const rows = await db.all<RecentAccuracyRaw>(sql`
    WITH evidence AS (
      SELECT s.name AS k, up.correct AS correct, up.answered_at AS at, 'p' || up.id AS tie
        FROM user_progress up
        JOIN flashcards f ON f.id = up.flashcard_id
        JOIN topics t ON t.id = f.topic_id
        JOIN subjects s ON s.id = t.subject_id
       WHERE f.status = 'published'
      UNION ALL
      SELECT qa.subtest AS k, qa.correct AS correct, qa.answered_at AS at, 'a' || qa.id AS tie
        FROM question_attempts qa
       WHERE qa.source_table = 'upcat_questions'
         AND qa.selected_index IS NOT NULL
         -- Older devices recorded bundled diagnostic questions ('pre-math-1')
         -- as bank attempts; no such question exists, so they never count.
         AND qa.question_id NOT LIKE 'pre-%'
         AND qa.subtest IS NOT NULL AND qa.subtest != ''
    ),
    ranked AS (
      SELECT k, correct, ROW_NUMBER() OVER (PARTITION BY k ORDER BY at DESC, tie DESC) AS rn
      FROM evidence
    )
    SELECT k AS key, COUNT(*) AS answered, SUM(correct) AS ok
    FROM ranked
    WHERE rn <= ${READINESS_WINDOW}
    GROUP BY k
    HAVING COUNT(*) >= ${READINESS_MIN_ANSWERED}
  `)
  return rows.map(r => ({
    subject: String(r.key),
    pct: Math.round((Number(r.ok) * 100) / Number(r.answered)),
    answered: Number(r.answered),
  }))
}

/**
 * getTopicRecentAccuracy — per-TOPIC readiness: weighted accuracy over the most
 * recent READINESS_WINDOW answered flashcards of the topic (user_progress joined
 * to published flashcards). Absent below READINESS_MIN_ANSWERED answers. Not
 * lifted by the subject's result — a weak topic must stay visibly weak.
 */
export async function getTopicRecentAccuracy(db: DrizzleClient): Promise<TopicRecentAccuracyRow[]> {
  const rows = await db.all<RecentAccuracyRaw>(sql`
    WITH evidence AS (
      SELECT f.topic_id AS k, up.correct AS correct, up.answered_at AS at, up.id AS tie
        FROM user_progress up
        JOIN flashcards f ON f.id = up.flashcard_id
       WHERE f.status = 'published'
    ),
    ranked AS (
      SELECT k, correct, ROW_NUMBER() OVER (PARTITION BY k ORDER BY at DESC, tie DESC) AS rn
      FROM evidence
    )
    SELECT k AS key, COUNT(*) AS answered, SUM(correct) AS ok
    FROM ranked
    WHERE rn <= ${READINESS_WINDOW}
    GROUP BY k
    HAVING COUNT(*) >= ${READINESS_MIN_ANSWERED}
  `)
  return rows.map(r => ({
    topicId: String(r.key),
    pct: Math.round((Number(r.ok) * 100) / Number(r.answered)),
    answered: Number(r.answered),
  }))
}

/**
 * getListingMockBest — per-listing BEST overall MOCK-exam attempt %.
 *
 * A single mock-exam attempt (app/practice/exam/[slug].tsx submit() via
 * useRecordSession) writes ONE practice_sessions row per SECTION, each with
 * topic_id='' (the mock sentinel), a non-empty `subtest` (the section name),
 * and that section's raw score/total. Every section row of one attempt shares
 * the same attempt_key (the sitting start). Legacy rows (attempt_key NULL)
 * reconstruct it as completed_at - duration_secs*1000 bucketed to the second.
 * Only kind='mock' rows count (legacy kind NULL keeps the old inference).
 *
 * Two-level aggregation:
 *   inner  — SELECT listing_slug, <attemptKey>, round(sum(score)*100.0/sum(total))
 *            FROM practice_sessions
 *            WHERE topic_id='' AND subtest IS NOT NULL AND subtest!=''
 *                  AND total > 0 AND listing_slug != ''
 *            GROUP BY listing_slug, attemptKey        -- one row per ATTEMPT
 *   outer  — SELECT listing_slug, MAX(attemptPct) FROM (inner) GROUP BY listing_slug
 *
 * So the overall % is summed ACROSS sections per attempt (not the best single
 * section), and bestPct is the MAX over a listing's attempts (not the average).
 * Rows with total=0 or an empty listing_slug are excluded; a listing with no
 * mock rows is absent from the result. Returns rounded integer percentages.
 */
export async function getListingMockBest(
  db: DrizzleClient,
): Promise<ListingMockBestRow[]> {
  const attempts = db
    .select({
      listingSlug: practiceSessions.listingSlug,
      attemptKey: sql<number>`coalesce(${practiceSessions.attemptKey}, cast((${practiceSessions.completedAt} - ${practiceSessions.durationSecs} * 1000) / 1000 as integer))`.as('attempt_key'),
      attemptPct: sql<number>`round(sum(${practiceSessions.score}) * 100.0 / sum(${practiceSessions.total}))`.as('attempt_pct'),
    })
    .from(practiceSessions)
    .where(and(
      // Explicit kind='mock', or (legacy, kind NULL) the old inference. Sprints,
      // drills and diagnostics also write topic_id='' + a subtest, so the
      // inference alone counted them as full mocks.
      sql`(${practiceSessions.kind} = 'mock' or (${practiceSessions.kind} is null and ${practiceSessions.topicId} = '' and ${practiceSessions.subtest} is not null and ${practiceSessions.subtest} != ''))`,
      sql`${practiceSessions.total} > 0`,
      ne(practiceSessions.listingSlug, ''),
    ))
    .groupBy(
      practiceSessions.listingSlug,
      sql`coalesce(${practiceSessions.attemptKey}, cast((${practiceSessions.completedAt} - ${practiceSessions.durationSecs} * 1000) / 1000 as integer))`,
    )
    .as('attempts')

  const rows = await db
    .select({
      listingSlug: attempts.listingSlug,
      bestPct: sql<number>`max(${attempts.attemptPct})`.as('best_pct'),
    })
    .from(attempts)
    .groupBy(attempts.listingSlug)

  return rows.map(r => ({
    listingSlug: r.listingSlug,
    bestPct: Number(r.bestPct ?? 0),
  }))
}
