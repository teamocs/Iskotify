import { useState, useEffect, useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import { useDb } from './useDb'
import { practiceSessions, topics, savedDecks } from '../db/schema'
import { resolveTopicLabel } from '../utils/topicLabel'
import { cachedQuery, subscribe } from '../services/queryCache'
import { getPracticeDayIndices } from '../services/homeAggregates'
import { computeStreakFromDays, localDayOffsetMs } from './useHomeStats'

export interface WeeklyBar {
  dayLabel: string
  accuracy: number | null
  sessionCount: number
}

export interface TopicMastery {
  label: string
  accuracy: number
  sessionCount: number
  // NEW: present for topic-backed entries, undefined for deck-backed entries.
  // The Subject accordion uses these to group by subject; deck entries are excluded.
  topicId?: string
  subjectId?: string
}

export interface RecentSession {
  id: number
  title: string
  accuracy: number
  completedAt: number
}

export interface AnalyticsData {
  sessionCount: number
  avgAccuracy: number | null
  streak: number
  weeklyData: WeeklyBar[]
  topicMastery: TopicMastery[]
  recentSessions: RecentSession[]
  isLoading: boolean
  refresh: () => Promise<void>
}

// ── Exported pure function (tested in hooks/__tests__/useAnalytics.test.ts) ──

/**
 * Two-tier mastery grouping:
 *   Tier 1: real topicId or deckId (existing behaviour)
 *   Tier 2: subtest string — handles UPCAT/USTET session records that carry
 *            subtest='Mathematics' etc. and have topicId='' + deckId=''
 *
 * Sentinels '__full__' and '__weak__' are still skipped.
 */
export function computeTopicMastery(
  sessions: Array<{
    topicId: string
    deckId: string
    subtest: string | null | undefined
    score: number
    total: number
  }>,
  topicNameMap: Map<string, string>,
  deckMap: Map<string, string>,
): TopicMastery[] {
  const grouped: Record<string, { score: number; total: number; count: number }> = {}
  for (const s of sessions) {
    const key = s.topicId || s.deckId || (s.subtest ? 'subtest:' + s.subtest : '')
    if (!key || key === '__full__' || key === '__weak__') continue
    if (!grouped[key]) grouped[key] = { score: 0, total: 0, count: 0 }
    grouped[key]!.score += s.score
    grouped[key]!.total += s.total
    grouped[key]!.count += 1
  }
  return Object.entries(grouped)
    .filter(([, v]) => v.total > 0)
    .map(([key, v]) => {
      let label: string
      let topicId: string | undefined
      let subjectId: string | undefined
      if (key.startsWith('subtest:')) {
        label = key.slice('subtest:'.length)
      } else if (topicNameMap.has(key)) {
        label = topicNameMap.get(key)!
        topicId = key
      } else if (deckMap.has(key)) {
        label = deckMap.get(key)!
      } else {
        label = key
      }
      return {
        label,
        accuracy: Math.round((v.score / v.total) * 100),
        sessionCount: v.count,
        topicId,
        subjectId,
      }
    })
    .sort((a, b) => b.sessionCount - a.sessionCount)
    .slice(0, 5)
}

// NOTE: the old session-only computeStreak was removed. The streak shown here is
// the GLOBAL daily study streak — getPracticeDayIndices (UNION of user_progress
// flashcard reviews + practice_sessions) + computeStreakFromDays, the exact same
// pair the Home screen uses, so the Exams-tab stats row, AnalyticsDashboard and
// Home always agree. Per-listing dashboards intentionally show this global streak.

export function computeWeeklyData(
  sessions: { completedAt: number; score: number; total: number }[]
): WeeklyBar[] {
  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dayMs = 86_400_000
  const now = new Date()
  const bars: WeeklyBar[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const start = d.getTime()
    const daySessions = sessions.filter(s => s.completedAt >= start && s.completedAt < start + dayMs && s.total > 0)
    const acc = daySessions.length > 0
      ? Math.round(daySessions.reduce((sum, s) => sum + (s.score / s.total) * 100, 0) / daySessions.length)
      : null
    bars.push({ dayLabel: DAY_LABELS[d.getDay()]!, accuracy: acc, sessionCount: daySessions.length })
  }
  return bars
}

export function useAnalytics(slug: string | 'overall'): AnalyticsData {
  const db = useDb()
  const [data, setData] = useState<Omit<AnalyticsData, 'refresh'>>({
    sessionCount: 0, avgAccuracy: null, streak: 0,
    weeklyData: [], topicMastery: [], recentSessions: [], isLoading: true,
  })
  const isMountedRef = useRef(true)
  const loadingRef = useRef(false)

  const load = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const fetcher = async () => {
        // Local-day bucketing offset — read at call time (never cached across days)
        const offsetMs = localDayOffsetMs()
        const [allSessions, topicRows, deckRows, dayIndices] = await Promise.all([
          db.select().from(practiceSessions),
          db.select({ id: topics.id, name: topics.name, subjectId: topics.subjectId }).from(topics),
          db.select({ id: savedDecks.id, name: savedDecks.name }).from(savedDecks),
          getPracticeDayIndices(db, offsetMs),
        ])

        const filtered = slug === 'overall'
          ? allSessions
          : allSessions.filter(s => s.listingSlug === slug)

        const sessionCount = filtered.length
        const withScore = filtered.filter(s => s.total > 0)
        const avgAccuracy = withScore.length > 0
          ? Math.round(withScore.reduce((sum, s) => sum + (s.score / s.total) * 100, 0) / withScore.length)
          : null

        // Global daily study streak — same union source + math as the Home streak
        const streak = computeStreakFromDays(dayIndices, offsetMs)
        const weeklyData = computeWeeklyData(filtered)

        const topicNameMap = new Map(topicRows.map(t => [t.id, t.name]))
        const deckMap = new Map(deckRows.map(d => [d.id, d.name]))
        // subjectId lookup used for accordion grouping in Subject Mastery view
        const topicSubjectMap = new Map(topicRows.map(t => [t.id, t.subjectId]))

        const topicMastery: TopicMastery[] = computeTopicMastery(filtered, topicNameMap, deckMap)
          .map(m => ({
            ...m,
            // Populate subjectId for topic-backed entries so the Subject accordion works
            subjectId: m.topicId ? topicSubjectMap.get(m.topicId) : undefined,
          }))

        const recentSessions: RecentSession[] = filtered
          .sort((a, b) => b.completedAt - a.completedAt)
          .slice(0, 10)
          .map(s => {
            let title = 'Session'
            if (s.deckId === '__full__') title = 'Full Review'
            else if (s.deckId === '__weak__') title = 'Weak Topics'
            else if (s.topicId) title = resolveTopicLabel(s.topicId, topicNameMap)
            else if (s.deckId) title = deckMap.get(s.deckId) ?? s.deckId
            else if (s.subtest) title = s.subtest
            return { id: s.id, title, accuracy: s.total > 0 ? Math.round((s.score / s.total) * 100) : 0, completedAt: s.completedAt }
          })

        return { sessionCount, avgAccuracy, streak, weeklyData, topicMastery, recentSessions, isLoading: false }
      }

      const result = await cachedQuery(`analytics:${slug}`, 30_000, fetcher)

      if (isMountedRef.current) {
        setData(result)
      }
    } catch (e) {
      console.error('[useAnalytics] load error:', e)
    } finally {
      loadingRef.current = false
    }
  }, [db, slug])

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  // Subscribe to 'analytics:' prefix — background cache refresh notifies us to reload
  useEffect(() => {
    const unsub = subscribe('analytics:', () => {
      void load()
    })
    return unsub
  }, [load])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  return { ...data, refresh: load }
}
