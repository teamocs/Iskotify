import { useState, useEffect, useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import { InteractionManager } from 'react-native'
import { eq } from 'drizzle-orm'
import { useDb } from './useDb'
import { subjects, topics, flashcards, userProgress, userSettings } from '../db/schema'
import { getTopicCardCounts } from '../services/homeAggregates'
import { cachedQuery, invalidate, subscribe } from '../services/queryCache'

export type Strength = 'New' | 'Weak' | 'Review' | 'Strong'

export interface TopicRow {
  topic: { id: string; name: string; subjectId: string }
  cardCount: number
  lastPracticedAt: number | null
  accuracy: number | null
  strength: Strength
}

export interface PracticeData {
  subjects: Array<{ id: string; name: string }>
  topicRows: TopicRow[]
  recommendedTopics: TopicRow[]
  totalCards: number
  cardCountByTopic: Record<string, number>
  topicIdsByListingSlug: Record<string, string[]>
  refresh: () => Promise<void>
}

// ── Pure function (exported for unit tests) ──────────────────────────────────

function isCorrectAnswer(value: boolean | number): boolean {
  return typeof value === 'boolean' ? value === true : value === 1
}

export function computeStrength(
  topicId: string,
  progress: Array<{ flashcardId: string; correct: boolean | number }>,
  fcList: Array<{ id: string; topicId: string }>,
): Strength {
  const fcIds = new Set(fcList.filter(f => f.topicId === topicId).map(f => f.id))
  const tp = progress.filter(p => fcIds.has(p.flashcardId))
  if (tp.length === 0) return 'New'
  const correct = tp.filter(p => isCorrectAnswer(p.correct)).length
  const acc = correct / tp.length
  if (acc >= 0.8) return 'Strong'
  if (acc >= 0.5) return 'Review'
  return 'Weak'
}

const STRENGTH_PRIORITY: Record<Strength, number> = { New: 0, Weak: 1, Review: 2, Strong: 3 }

// Drop topics that have zero cards in the local flashcards table. A topic record may
// exist (subjects/topics sync in bulk) while its cards never reached this device because
// they aren't tagged with the user's focus-list slugs. Showing such "ghost" topics as
// empty rows in the accordion is confusing — filter them out at the source.
export function filterTopicsWithCards<T extends { id: string }>(
  topicList: T[],
  fcList: Array<{ topicId: string }>,
): T[] {
  const counts = new Map<string, number>()
  for (const fc of fcList) counts.set(fc.topicId, (counts.get(fc.topicId) ?? 0) + 1)
  return topicList.filter(t => (counts.get(t.id) ?? 0) > 0)
}

// ── React hook ───────────────────────────────────────────────────────────────

export function usePracticeData(): PracticeData {
  const db = useDb()
  const [allSubjects, setAllSubjects] = useState<Array<{ id: string; name: string }>>([])
  const [topicRows, setTopicRows] = useState<TopicRow[]>([])
  const [recommendedTopics, setRecommendedTopics] = useState<TopicRow[]>([])
  const [totalCards, setTotalCards] = useState(0)
  const [cardCountByTopic, setCardCountByTopic] = useState<Record<string, number>>({})
  const [topicIdsByListingSlug, setTopicIdsByListingSlug] = useState<Record<string, string[]>>({})
  const isMountedRef = useRef(true)
  const loadingRef = useRef(false)
  const lastLoadRef = useRef(0)

  const load = useCallback(async () => {
    if (Date.now() - lastLoadRef.current < 2000) return
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const settingsRows = await db.select({ selectedListingSlug: userSettings.selectedListingSlug })
        .from(userSettings).where(eq(userSettings.id, 1)).limit(1)
      const slug = settingsRows[0]?.selectedListingSlug ?? ''

      const cacheKey = `practice:data:${slug}`

      const fetcher = async () => {
        const [subjectRows, topicList, fcList, progressList, topicCardCounts] = await Promise.all([
          db.select().from(subjects),
          db.select().from(topics),
          db.select({
            id: flashcards.id,
            topicId: flashcards.topicId,
            listingSlugs: flashcards.listingSlugs,
          }).from(flashcards),
          db.select({
            flashcardId: userProgress.flashcardId,
            correct: userProgress.correct,
            answeredAt: userProgress.answeredAt,
          }).from(userProgress),
          // SQL aggregate for per-topic card counts — replaces JSON.parse loop
          getTopicCardCounts(db, slug || undefined),
        ])

        // Build topicIdsBySlug using SQL aggregate data
        // getTopicCardCounts gives us topic→count for the current slug.
        // For the full topicIdsBySlug map (all slugs), we still need the fcList
        // (this is used for topicIdsByListingSlug which is a multi-slug map).
        // We keep this JS loop for the full slug map only.
        const topicIdsBySlug: Record<string, string[]> = {}
        for (const fc of fcList) {
          try {
            const slugs = JSON.parse(fc.listingSlugs ?? '[]') as string[]
            for (const s of slugs) {
              if (!topicIdsBySlug[s]) topicIdsBySlug[s] = []
              if (!topicIdsBySlug[s]!.includes(fc.topicId)) topicIdsBySlug[s]!.push(fc.topicId)
            }
          } catch {}
        }

        // Build card count map from SQL aggregate
        const countMap: Record<string, number> = {}
        for (const row of topicCardCounts) {
          countMap[row.topicId] = row.cardCount
        }

        // Also compute total count from full fcList (includes all topics)
        const allCountMap: Record<string, number> = {}
        for (const fc of fcList) {
          allCountMap[fc.topicId] = (allCountMap[fc.topicId] ?? 0) + 1
        }

        // Recommended topic IDs from SQL aggregate (those with cards in the slug)
        const recommendedTopicIds = new Set(topicCardCounts.map(r => r.topicId))

        // Drop ghost topics BEFORE anything downstream
        const visibleTopics = filterTopicsWithCards(topicList, fcList)

        const rows: TopicRow[] = visibleTopics.map(topic => {
          const fcIds = new Set(fcList.filter(f => f.topicId === topic.id).map(f => f.id))
          const tp = progressList.filter(p => fcIds.has(p.flashcardId))
          const lastPracticedAt = tp.length > 0 ? Math.max(...tp.map(p => p.answeredAt)) : null
          const cardCount = allCountMap[topic.id] ?? 0
          const correct = tp.filter(p => isCorrectAnswer(p.correct)).length
          const accuracy = tp.length > 0 ? Math.round((correct / tp.length) * 100) : null
          return {
            topic,
            cardCount,
            lastPracticedAt,
            accuracy,
            strength: computeStrength(topic.id, progressList, fcList),
          }
        })

        const recommended = rows
          .filter(r => recommendedTopicIds.has(r.topic.id))
          .sort((a, b) =>
            STRENGTH_PRIORITY[a.strength] - STRENGTH_PRIORITY[b.strength] ||
            b.cardCount - a.cardCount
          )
          .slice(0, 5)

        // Only expose subjects that have non-ghost topics
        const subjectIdsWithCards = new Set(visibleTopics.map(t => t.subjectId))
        const visibleSubjects = subjectRows.filter(s => subjectIdsWithCards.has(s.id))

        return {
          allSubjects: visibleSubjects,
          topicRows: rows,
          recommendedTopics: recommended,
          totalCards: fcList.length,
          cardCountByTopic: allCountMap,
          topicIdsByListingSlug: topicIdsBySlug,
        }
      }

      const result = await cachedQuery(cacheKey, 30_000, fetcher)

      lastLoadRef.current = Date.now()
      if (isMountedRef.current) {
        setAllSubjects(result.allSubjects)
        setTopicRows(result.topicRows)
        setRecommendedTopics(result.recommendedTopics)
        setTotalCards(result.totalCards)
        setCardCountByTopic(result.cardCountByTopic)
        setTopicIdsByListingSlug(result.topicIdsByListingSlug)
      }
    } catch (e) {
      console.error('[usePracticeData] load error:', e)
    } finally {
      loadingRef.current = false
    }
  }, [db])

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  // Subscribe to 'practice:' prefix — background cache refresh notifies us to reload
  useEffect(() => {
    const unsub = subscribe('practice:', () => {
      void load()
    })
    return unsub
  }, [load])

  useFocusEffect(useCallback(() => {
    InteractionManager.runAfterInteractions(() => { void load() })
  }, [load]))

  const refresh = useCallback(async () => {
    invalidate('practice:')
    lastLoadRef.current = 0
    await load()
  }, [load])

  return {
    subjects: allSubjects,
    topicRows,
    recommendedTopics,
    totalCards,
    cardCountByTopic,
    topicIdsByListingSlug,
    refresh,
  }
}
