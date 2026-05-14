import { useState, useEffect, useCallback } from 'react'
import { eq } from 'drizzle-orm'
import { useFocusEffect } from 'expo-router'
import { useDb } from './useDb'
import { userSettings, listings, userProgress, flashcards, topics } from '../db/schema'

export interface WeakTopic {
  topicId: string
  topicName: string
  accuracy: number
}

export interface HomeStats {
  listing: { title: string; examDate: number | null } | null
  daysLeft: number | null
  todayAccuracy: number | null
  streakDays: number
  weakTopics: WeakTopic[]
  firstTopicId: string | null
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
      topicName: topicMap.get(tid) ?? tid,
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
}

export function useHomeStats(): HomeStats {
  const db = useDb()
  const [stats, setStats] = useState<HomeStats>(DEFAULT)

  useFocusEffect(useCallback(() => {
    let cancelled = false
    async function load() {
      try {
        const settingsRows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
        const slug = settingsRows[0]?.selectedListingSlug
        if (!slug) { if (!cancelled) setStats(DEFAULT); return }

        const [listingRows, allProgress, allFc, allTopics, firstTopicRows] = await Promise.all([
          db.select().from(listings).where(eq(listings.slug, slug)).limit(1),
          db.select({
            flashcardId: userProgress.flashcardId,
            correct: userProgress.correct,
            answeredAt: userProgress.answeredAt,
          }).from(userProgress),
          db.select({ id: flashcards.id, topicId: flashcards.topicId }).from(flashcards),
          db.select({ id: topics.id, name: topics.name }).from(topics),
          db.select({ id: topics.id }).from(topics).orderBy(topics.id).limit(1),
        ])

        const listing = listingRows[0] ?? null
        const daysLeft = listing?.examDate
          ? Math.ceil((listing.examDate - Date.now()) / 86_400_000)
          : null

        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const todayRows = allProgress.filter(p => p.answeredAt >= todayStart.getTime())

        if (!cancelled) {
          setStats({
            listing: listing ? { title: listing.title, examDate: listing.examDate ?? null } : null,
            daysLeft,
            todayAccuracy: computeTodayAccuracy(todayRows),
            streakDays: computeStreak(allProgress),
            weakTopics: computeWeakTopics(allProgress, allFc, allTopics),
            firstTopicId: firstTopicRows[0]?.id ?? null,
          })
        }
      } catch (e) {
        console.error('[useHomeStats] load error:', e)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [db]))

  return stats
}
