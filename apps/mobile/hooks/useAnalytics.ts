import { useState, useEffect, useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import { useDb } from './useDb'
import { practiceSessions, topics, savedDecks } from '../db/schema'

export interface WeeklyBar {
  dayLabel: string
  accuracy: number | null
  sessionCount: number
}

export interface TopicMastery {
  label: string
  accuracy: number
  sessionCount: number
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

export function computeStreak(sessions: { completedAt: number }[]): number {
  if (sessions.length === 0) return 0
  const dayMs = 86_400_000
  const days = new Set(sessions.map(s => Math.floor(s.completedAt / dayMs)))
  const todayDay = Math.floor(Date.now() / dayMs)
  let streak = 0
  let cursor = todayDay
  while (days.has(cursor)) { streak++; cursor-- }
  return streak
}

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
      const [allSessions, topicRows, deckRows] = await Promise.all([
        db.select().from(practiceSessions),
        db.select({ id: topics.id, name: topics.name }).from(topics),
        db.select({ id: savedDecks.id, name: savedDecks.name }).from(savedDecks),
      ])

      const filtered = slug === 'overall'
        ? allSessions
        : allSessions.filter(s => s.listingSlug === slug)

      const sessionCount = filtered.length
      const withScore = filtered.filter(s => s.total > 0)
      const avgAccuracy = withScore.length > 0
        ? Math.round(withScore.reduce((sum, s) => sum + (s.score / s.total) * 100, 0) / withScore.length)
        : null

      const streak = computeStreak(filtered)
      const weeklyData = computeWeeklyData(filtered)

      const topicMap = new Map(topicRows.map(t => [t.id, t.name]))
      const deckMap = new Map(deckRows.map(d => [d.id, d.name]))

      const grouped: Record<string, { score: number; total: number; count: number }> = {}
      for (const s of filtered) {
        const key = s.topicId || s.deckId
        if (!key || key === '__full__' || key === '__weak__') continue
        if (!grouped[key]) grouped[key] = { score: 0, total: 0, count: 0 }
        grouped[key]!.score += s.score
        grouped[key]!.total += s.total
        grouped[key]!.count += 1
      }
      const topicMastery: TopicMastery[] = Object.entries(grouped)
        .filter(([, v]) => v.total > 0)
        .map(([key, v]) => ({
          label: topicMap.get(key) ?? deckMap.get(key) ?? key,
          accuracy: Math.round((v.score / v.total) * 100),
          sessionCount: v.count,
        }))
        .sort((a, b) => b.sessionCount - a.sessionCount)
        .slice(0, 5)

      const recentSessions: RecentSession[] = filtered
        .sort((a, b) => b.completedAt - a.completedAt)
        .slice(0, 10)
        .map(s => {
          let title = 'Session'
          if (s.deckId === '__full__') title = 'Full Review'
          else if (s.deckId === '__weak__') title = 'Weak Topics'
          else if (s.topicId) title = topicMap.get(s.topicId) ?? s.topicId
          else if (s.deckId) title = deckMap.get(s.deckId) ?? s.deckId
          return { id: s.id, title, accuracy: s.total > 0 ? Math.round((s.score / s.total) * 100) : 0, completedAt: s.completedAt }
        })

      if (isMountedRef.current) {
        setData({ sessionCount, avgAccuracy, streak, weeklyData, topicMastery, recentSessions, isLoading: false })
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

  useFocusEffect(useCallback(() => { void load() }, [load]))

  return { ...data, refresh: load }
}
