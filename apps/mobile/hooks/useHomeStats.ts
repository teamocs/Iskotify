import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { eq, asc, gt, and } from 'drizzle-orm'
import { useFocusEffect } from 'expo-router'
import { useDb } from './useDb'
import { userSettings, listings as listingsTable, userProgress, flashcards, topics, focusListings, notes as notesTable } from '../db/schema'
import { resolveTopicLabel } from '../utils/topicLabel'

export interface WeakTopic {
  topicId: string
  topicName: string
  accuracy: number
}

export interface FocusedListing {
  slug: string
  priority: number
  title: string
  type: string
  examDate: number | null
  deadline: number | null
}

export interface NoteReminder {
  noteId: string
  noteTitle: string
  reminderAt: number
}

export interface HomeStats {
  listing: { title: string; examDate: number | null } | null
  daysLeft: number | null
  todayAccuracy: number | null
  streakDays: number
  weakTopics: WeakTopic[]
  firstTopicId: string | null
  fullName: string
  importantDayIndices: number[]
  practiceDayIndices: number[]
  focusedListings: FocusedListing[]
  noteReminders: NoteReminder[]
  refresh: () => Promise<void>
}

// ── Pure functions (exported for unit tests) ─────────────────────────────────

export function computeStreak(rows: Array<{ answeredAt: number }>): number {
  if (rows.length === 0) return 0
  const days = new Set(rows.map(r => Math.floor(r.answeredAt / 86_400_000)))
  const today = Math.floor(Date.now() / 86_400_000)
  let d = days.has(today) ? today : today - 1
  let streak = 0
  while (days.has(d)) { streak++; d-- }
  return streak
}

export function computeTodayAccuracy(
  rows: Array<{ correct: boolean | number }>
): number | null {
  if (rows.length === 0) return null
  const correct = rows.filter(r => r.correct === true || r.correct === 1).length
  return Math.round((correct / rows.length) * 100)
}

export function computeWeakTopics(
  progress: Array<{ flashcardId: string; correct: boolean | number }>,
  fcList: Array<{ id: string; topicId: string }>,
  topicList: Array<{ id: string; name: string }>,
): WeakTopic[] {
  const fcMap = new Map(fcList.map(f => [f.id, f.topicId]))
  const topicStats = new Map<string, { correct: number; total: number }>()
  for (const p of progress) {
    const tid = fcMap.get(p.flashcardId)
    if (!tid) continue
    const s = topicStats.get(tid) ?? { correct: 0, total: 0 }
    s.total++
    if (p.correct === true || p.correct === 1) s.correct++
    topicStats.set(tid, s)
  }
  const topicMap = new Map(topicList.map(t => [t.id, t.name]))
  return Array.from(topicStats.entries())
    .map(([tid, { correct, total }]) => ({
      topicId: tid,
      topicName: resolveTopicLabel(tid, topicMap),
      accuracy: Math.round((correct / total) * 100),
    }))
    .filter(t => t.accuracy < 60)
    .sort((a, b) => a.accuracy - b.accuracy || a.topicId.localeCompare(b.topicId))
    .slice(0, 4)
}

// ── React hook ───────────────────────────────────────────────────────────────

const DEFAULT: HomeStats = {
  listing: null,
  daysLeft: null,
  todayAccuracy: null,
  streakDays: 0,
  weakTopics: [],
  firstTopicId: null,
  fullName: '',
  importantDayIndices: [],
  practiceDayIndices: [],
  focusedListings: [],
  noteReminders: [],
  refresh: async () => {},
}

export function useHomeStats(): HomeStats {
  const db = useDb()
  const [stats, setStats] = useState<HomeStats>(DEFAULT)
  const isMountedRef = useRef(true)
  const loadingRef = useRef(false)
  const lastLoadRef = useRef(0)

  const load = useCallback(async () => {
    if (Date.now() - lastLoadRef.current < 2000) return
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const settingsRows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
      const slug = settingsRows[0]?.selectedListingSlug
      if (!slug) {
        if (isMountedRef.current) setStats(DEFAULT)
        return
      }

      const [listingRows, allProgress, allFc, allTopics, firstTopicRows, focusedRows, reminderRows] = await Promise.all([
        db.select().from(listingsTable).where(eq(listingsTable.slug, slug)).limit(1),
        db.select({
          flashcardId: userProgress.flashcardId,
          correct: userProgress.correct,
          answeredAt: userProgress.answeredAt,
        }).from(userProgress),
        db.select({ id: flashcards.id, topicId: flashcards.topicId }).from(flashcards),
        db.select({ id: topics.id, name: topics.name }).from(topics),
        db.select({ id: topics.id }).from(topics).orderBy(topics.id).limit(1),
        db.select({
          slug: focusListings.listingSlug,
          priority: focusListings.priority,
          title: listingsTable.title,
          type: listingsTable.type,
          examDate: listingsTable.examDate,
          deadline: listingsTable.deadline,
        }).from(focusListings)
          .leftJoin(listingsTable, eq(listingsTable.slug, focusListings.listingSlug))
          .orderBy(asc(focusListings.priority)),
        // Active notes with a future reminder
        db.select({ id: notesTable.id, title: notesTable.title, reminderAt: notesTable.reminderAt })
          .from(notesTable)
          .where(and(eq(notesTable.isArchived, false), eq(notesTable.isTrashed, false), gt(notesTable.reminderAt, Date.now()))),
      ])

      const listing = listingRows[0] ?? null
      const daysLeft = listing?.examDate
        ? Math.ceil((listing.examDate - Date.now()) / 86_400_000)
        : null

      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayRows = allProgress.filter(p => p.answeredAt >= todayStart.getTime())

      lastLoadRef.current = Date.now()
      if (isMountedRef.current) {
        setStats({
          listing: listing ? { title: listing.title, examDate: listing.examDate ?? null } : null,
          daysLeft,
          todayAccuracy: computeTodayAccuracy(todayRows),
          streakDays: computeStreak(allProgress),
          weakTopics: computeWeakTopics(allProgress, allFc, allTopics),
          firstTopicId: firstTopicRows[0]?.id ?? null,
          fullName: settingsRows[0]?.fullName ?? '',
          importantDayIndices: [
            ...focusedRows.flatMap(r => [
              r.examDate != null ? Math.floor(r.examDate / 86_400_000) : null,
              r.deadline != null ? Math.floor(r.deadline / 86_400_000) : null,
            ]).filter((d): d is number => d != null),
            // Merge note reminder day indices
            ...reminderRows
              .filter(r => r.reminderAt != null)
              .map(r => Math.floor(r.reminderAt! / 86_400_000)),
          ],
          practiceDayIndices: allProgress.map(p => Math.floor(p.answeredAt / 86_400_000)),
          focusedListings: focusedRows.map(r => ({
            slug: r.slug,
            priority: r.priority,
            title: r.title ?? r.slug,
            type: r.type ?? 'exam',
            examDate: r.examDate ?? null,
            deadline: r.deadline ?? null,
          })),
          noteReminders: reminderRows
            .filter(r => r.reminderAt != null)
            .map(r => ({ noteId: r.id, noteTitle: r.title, reminderAt: r.reminderAt! }))
            .sort((a, b) => a.reminderAt - b.reminderAt),
          refresh: load,
        })
      }
    } catch (e) {
      console.error('[useHomeStats] load error:', e)
    } finally {
      loadingRef.current = false
    }
  }, [db])

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  // Return a referentially-stable object: a fresh `{ ...stats }` on every render
  // makes every consumer (incl. the app-wide AiCoachProvider) treat `stats` as
  // changed each render, re-running effects/DB work and cascading re-renders that
  // make taps feel laggy. `stats` only changes when `load()` calls setStats, and
  // `load` is stable, so this memo changes only when the data actually changes.
  return useMemo(() => ({ ...stats, refresh: load }), [stats, load])
}
