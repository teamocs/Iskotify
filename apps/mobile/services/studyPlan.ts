/**
 * services/studyPlan.ts
 *
 * DB-facing half of Task I's "Today's Plan": gathers the inputs
 * utils/studyPlan.ts's generateStudyPlan() needs, persists the generated
 * items, and marks items done when a matching practice session / SRS review
 * completes. Kept separate from hooks/useStudyPlan.ts so the fire-and-forget
 * mark-done calls can be wired directly into hooks/useRecordSession.ts and
 * hooks/useRecordSrs.ts without a circular hook→hook dependency.
 *
 * Pure DB reads/writes (no React) so this is unit-testable under the
 * real-SQLite services Jest project, same convention as homeAggregates.ts /
 * srsAggregates.ts.
 */

import { asc, eq, and, isNull } from 'drizzle-orm'
import { studyPlanItems, focusListings, listings as listingsTable } from '../db/schema'
import type { DrizzleClient } from '../db/client'
import { getDueCounts } from './srsAggregates'
import { getWeakTopicStats, getTopicNames, getPracticeDayIndices } from './homeAggregates'
import { resolveTopicLabel } from '../utils/topicLabel'
import { isSchoolFocusSlug } from '../utils/focusSlug'
import { scheduleWebPersist } from '../db/webPersist'
import {
  itemMatchesSession, itemMatchesSrsReview, formatPlanDate,
  type GenerateStudyPlanInput, type StudyPlanItemDraft, type StudyPlanItemKind,
  type SessionCompletionSignal,
} from '../utils/studyPlan'

export interface StudyPlanItemRow {
  id: number
  planDate: string
  kind: StudyPlanItemKind
  refId: string
  targetCount: number
  completedAt: number | null
  createdAt: number
}

function toRow(r: typeof studyPlanItems.$inferSelect): StudyPlanItemRow {
  return {
    id: r.id,
    planDate: r.planDate,
    kind: r.kind as StudyPlanItemKind,
    refId: r.refId,
    targetCount: r.targetCount,
    completedAt: r.completedAt,
    createdAt: r.createdAt,
  }
}

/** Every plan item for one calendar day ('YYYY-MM-DD'), insertion order. */
export async function getPlanItemsForDate(db: DrizzleClient, planDate: string): Promise<StudyPlanItemRow[]> {
  const rows = await db.select().from(studyPlanItems)
    .where(eq(studyPlanItems.planDate, planDate))
    .orderBy(asc(studyPlanItems.id))
  return rows.map(toRow)
}

/**
 * gatherPlanInputs — builds generateStudyPlan()'s input from live DB state.
 * `today` is passed straight through to the generator; this function itself
 * still reads Date.now() implicitly only via its callers (getDueCounts
 * defaults `now` to Date.now() when not passed — callers here always pass
 * `today.getTime()` explicitly so the whole read is pinned to one instant).
 */
export async function gatherPlanInputs(db: DrizzleClient, today: Date): Promise<GenerateStudyPlanInput> {
  const now = today.getTime()

  const [dueCounts, weakStats, topicNames, dayIndices, focusedRows] = await Promise.all([
    getDueCounts(db, now),
    getWeakTopicStats(db),
    getTopicNames(db),
    getPracticeDayIndices(db),
    db.select({
      slug: focusListings.listingSlug,
      priority: focusListings.priority,
      examDate: listingsTable.examDate,
    }).from(focusListings)
      .leftJoin(listingsTable, eq(listingsTable.slug, focusListings.listingSlug))
      .orderBy(asc(focusListings.priority)),
  ])

  const topicMap = new Map(topicNames.map(t => [t.id, t.name]))
  const weakTopics = weakStats
    .map(s => ({
      topicId: s.topicId,
      topicName: resolveTopicLabel(s.topicId, topicMap),
      accuracy: Math.round((s.ok / s.total) * 100),
    }))
    .filter(t => t.accuracy < 60)
    .sort((a, b) => a.accuracy - b.accuracy || a.topicId.localeCompare(b.topicId))
    .slice(0, 4)

  // Nearest focused exam WITH a future date. School-level focus entries
  // ("school:<id>") have no exam date of their own and are skipped.
  const upcoming = focusedRows
    .filter(r => !isSchoolFocusSlug(r.slug) && r.examDate != null && r.examDate > now)
    .sort((a, b) => a.examDate! - b.examDate!)
  const nearest = upcoming[0] ?? null

  return {
    today,
    earliestExamDate: nearest?.examDate ?? null,
    dueSrsCount: dueCounts.total,
    weakTopics,
    hasAnyReadinessData: dayIndices.length > 0,
    mockSectionRefId: nearest?.slug ?? null,
  }
}

/** Persists a freshly-generated draft plan for `planDate`. Returns the inserted rows. */
export async function persistPlanItems(
  db: DrizzleClient,
  planDate: string,
  drafts: StudyPlanItemDraft[],
  now: number,
): Promise<StudyPlanItemRow[]> {
  if (drafts.length === 0) return []
  const values = drafts.map(d => ({
    planDate, kind: d.kind, refId: d.refId, targetCount: d.targetCount,
    completedAt: null, createdAt: now,
  }))
  await db.insert(studyPlanItems).values(values)
  scheduleWebPersist()
  return getPlanItemsForDate(db, planDate)
}

/** Manual check-off — sets completedAt if not already set (idempotent). */
export async function markPlanItemDone(db: DrizzleClient, id: number, now: number = Date.now()): Promise<void> {
  await db.update(studyPlanItems)
    .set({ completedAt: now })
    .where(and(eq(studyPlanItems.id, id), isNull(studyPlanItems.completedAt)))
  scheduleWebPersist()
}

async function openItemsForToday(db: DrizzleClient, now: number) {
  const planDate = formatPlanDate(new Date(now))
  return db.select().from(studyPlanItems)
    .where(and(eq(studyPlanItems.planDate, planDate), isNull(studyPlanItems.completedAt)))
}

/**
 * markPlanItemsDoneForSession — best-effort bookkeeping called from
 * hooks/useRecordSession.ts AFTER the real practice_sessions row is
 * committed. Never throws to its caller in practice (callers wrap with
 * `void ....catch()`), matching the Task D/H error-isolation convention:
 * real user data first, plan bookkeeping is fire-and-forget.
 */
export async function markPlanItemsDoneForSession(
  db: DrizzleClient,
  signal: SessionCompletionSignal,
  now: number = Date.now(),
): Promise<void> {
  const openItems = await openItemsForToday(db, now)
  for (const item of openItems) {
    if (itemMatchesSession({ kind: item.kind as StudyPlanItemKind, refId: item.refId }, signal)) {
      await db.update(studyPlanItems).set({ completedAt: now }).where(eq(studyPlanItems.id, item.id))
    }
  }
  if (openItems.length > 0) scheduleWebPersist()
}

/**
 * markPlanItemsDoneForSrsReview — same convention as
 * markPlanItemsDoneForSession, called from hooks/useRecordSrs.ts after its
 * flashcard_srs upserts are committed.
 */
export async function markPlanItemsDoneForSrsReview(
  db: DrizzleClient,
  reviewCount: number,
  now: number = Date.now(),
): Promise<void> {
  if (reviewCount === 0) return
  const openItems = await openItemsForToday(db, now)
  for (const item of openItems) {
    if (itemMatchesSrsReview({ kind: item.kind as StudyPlanItemKind, refId: item.refId }, reviewCount)) {
      await db.update(studyPlanItems).set({ completedAt: now }).where(eq(studyPlanItems.id, item.id))
    }
  }
  if (openItems.length > 0) scheduleWebPersist()
}
