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

import { sql, and, gte, like, eq, ne, isNotNull } from 'drizzle-orm'
import { union } from 'drizzle-orm/sqlite-core'
import { userProgress, flashcards, topics, practiceSessions } from '../db/schema'
import type { DrizzleClient } from '../db/client'

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

export interface TopicBestSessionRow {
  topicId: string
  bestPct: number
}

export interface SubjectBestSessionRow {
  subject: string
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

/**
 * getTopicBestSessionPercentages — per-topic BEST (highest attained) result %.
 *
 * SELECT topic_id, MAX(round(score * 100.0 / total)) AS bestPct
 * FROM practice_sessions
 * WHERE topic_id != '' AND total > 0
 * GROUP BY topic_id
 *
 * Powers the Subject Details readiness bars: each topic's readiness is the highest
 * percentage the user has ever scored across their topic-review sessions on it.
 *
 * Full-mock UPCAT sessions (Epic A) write topic_id='' + a subtest tag, so the
 * topic_id != '' filter correctly excludes them — per-topic best comes only from
 * individual topic-review sessions. Rows with total=0 are excluded (division-by-zero
 * guard), so a topic whose only session is empty is absent rather than shown as 0%.
 * Returns rounded integer percentages.
 */
export async function getTopicBestSessionPercentages(
  db: DrizzleClient,
): Promise<TopicBestSessionRow[]> {
  const rows = await db
    .select({
      topicId: practiceSessions.topicId,
      bestPct: sql<number>`max(round(${practiceSessions.score} * 100.0 / ${practiceSessions.total}))`.as('best_pct'),
    })
    .from(practiceSessions)
    .where(and(
      ne(practiceSessions.topicId, ''),
      sql`${practiceSessions.total} > 0`,
    ))
    .groupBy(practiceSessions.topicId)

  return rows.map(r => ({
    topicId: r.topicId,
    bestPct: Number(r.bestPct ?? 0),
  }))
}

/**
 * getSubjectSessionPercentages — per-SUBJECT BEST (highest attained) result %.
 *
 * SELECT subtest, MAX(round(score * 100.0 / total)) AS bestPct
 * FROM practice_sessions
 * WHERE subtest IS NOT NULL AND subtest != '' AND total > 0
 * GROUP BY subtest
 *
 * Mock sessions (blueprint section in app/practice/exam/[slug].tsx and UPCAT
 * subtest in app/practice/upcat/[subtest].tsx) write topic_id='' and tag the
 * row's `subtest` with the SECTION/SUBTEST name. Because the flashcard SUBJECTS
 * were projected from UPCAT subtests, that `subtest` value EQUALS the subject
 * NAME (e.g. "Reading Comprehension", "Mathematics"). So this aggregate is the
 * subject-level mock readiness, keyed by subject name.
 *
 * Topic-review sessions write a NULL subtest and are excluded here (they're
 * covered by getTopicBestSessionPercentages). Rows with total=0 are excluded
 * (division-by-zero guard). Returns rounded integer percentages.
 */
export async function getSubjectSessionPercentages(
  db: DrizzleClient,
): Promise<SubjectBestSessionRow[]> {
  const rows = await db
    .select({
      subject: practiceSessions.subtest,
      bestPct: sql<number>`max(round(${practiceSessions.score} * 100.0 / ${practiceSessions.total}))`.as('best_pct'),
    })
    .from(practiceSessions)
    .where(and(
      isNotNull(practiceSessions.subtest),
      ne(practiceSessions.subtest, ''),
      sql`${practiceSessions.total} > 0`,
    ))
    .groupBy(practiceSessions.subtest)

  return rows.map(r => ({
    subject: String(r.subject ?? ''),
    bestPct: Number(r.bestPct ?? 0),
  }))
}
