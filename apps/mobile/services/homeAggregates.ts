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

import { sql, and, gte, like, eq } from 'drizzle-orm'
import { userProgress, flashcards, topics } from '../db/schema'
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
 * getPracticeDayIndices — distinct day bucket indices (floor(answeredAt / 86400000))
 * for every row in user_progress.
 *
 * Returns an array of unique day indices (epoch-day integers).
 * Used by computeStreakFromDays and for the calendar heatmap.
 */
export async function getPracticeDayIndices(db: DrizzleClient): Promise<number[]> {
  const DAY_MS = 86_400_000
  const rows = await db
    .select({
      dayIndex: sql<number>`cast(${userProgress.answeredAt} / ${DAY_MS} as integer)`.as('day_index'),
    })
    .from(userProgress)
    .groupBy(sql`cast(${userProgress.answeredAt} / ${DAY_MS} as integer)`)

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
