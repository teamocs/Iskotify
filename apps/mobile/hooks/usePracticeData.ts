import { useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from './useDb'
import { subjects, topics, flashcards, userProgress, userSettings } from '../db/schema'

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
  selectedSubjectId: string | null
  setSelectedSubjectId: (id: string | null) => void
  totalCards: number
  cardCountByTopic: Record<string, number>
}

// ── Pure function (exported for unit tests) ──────────────────────────────────

export function computeStrength(
  topicId: string,
  progress: Array<{ flashcardId: string; correct: boolean | number }>,
  fcList: Array<{ id: string; topicId: string }>,
): Strength {
  const fcIds = new Set(fcList.filter(f => f.topicId === topicId).map(f => f.id))
  const tp = progress.filter(p => fcIds.has(p.flashcardId))
  if (tp.length === 0) return 'New'
  const correct = tp.filter(p => p.correct === true || p.correct === 1).length
  const acc = correct / tp.length
  if (acc >= 0.8) return 'Strong'
  if (acc >= 0.5) return 'Review'
  return 'Weak'
}

const STRENGTH_PRIORITY: Record<Strength, number> = { New: 0, Weak: 1, Review: 2, Strong: 3 }

// ── React hook ───────────────────────────────────────────────────────────────

export function usePracticeData(): PracticeData {
  const db = useDb()
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null)
  const [allSubjects, setAllSubjects] = useState<Array<{ id: string; name: string }>>([])
  const [topicRows, setTopicRows] = useState<TopicRow[]>([])
  const [recommendedTopics, setRecommendedTopics] = useState<TopicRow[]>([])
  const [totalCards, setTotalCards] = useState(0)
  const [cardCountByTopic, setCardCountByTopic] = useState<Record<string, number>>({})

  useFocusEffect(useCallback(() => {
    let cancelled = false
    async function load() {
      try {
        const [subjectRows, topicList, fcList, progressList, settingsRows] = await Promise.all([
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
          db.select({ selectedListingSlug: userSettings.selectedListingSlug })
            .from(userSettings).where(eq(userSettings.id, 1)).limit(1),
        ])

        const slug = settingsRows[0]?.selectedListingSlug ?? ''

        // Which topic IDs are tagged for the user's listing
        const recommendedTopicIds = new Set<string>()
        if (slug) {
          for (const fc of fcList) {
            try {
              const slugs = JSON.parse(fc.listingSlugs ?? '[]') as string[]
              if (slugs.includes(slug)) recommendedTopicIds.add(fc.topicId)
            } catch {}
          }
        }

        const filteredTopics = selectedSubjectId
          ? topicList.filter(t => t.subjectId === selectedSubjectId)
          : topicList

        const rows: TopicRow[] = filteredTopics.map(topic => {
          const fcIds = new Set(fcList.filter(f => f.topicId === topic.id).map(f => f.id))
          const tp = progressList.filter(p => fcIds.has(p.flashcardId))
          const lastPracticedAt = tp.length > 0 ? Math.max(...tp.map(p => p.answeredAt)) : null
          const cardCount = fcList.filter(f => f.topicId === topic.id).length
          const correct = tp.filter(p => p.correct === true || p.correct === 1).length
          const accuracy = tp.length > 0 ? Math.round((correct / tp.length) * 100) : null
          return {
            topic,
            cardCount,
            lastPracticedAt,
            accuracy,
            strength: computeStrength(topic.id, progressList, fcList),
          }
        })

        // Recommended: topics matching the listing, sorted New→Weak→Review→Strong
        const recommended = rows
          .filter(r => recommendedTopicIds.has(r.topic.id))
          .sort((a, b) =>
            STRENGTH_PRIORITY[a.strength] - STRENGTH_PRIORITY[b.strength] ||
            b.cardCount - a.cardCount
          )
          .slice(0, 5)

        const countMap: Record<string, number> = {}
        for (const fc of fcList) {
          countMap[fc.topicId] = (countMap[fc.topicId] ?? 0) + 1
        }

        if (!cancelled) {
          setAllSubjects(subjectRows)
          setTopicRows(rows)
          setRecommendedTopics(recommended)
          setTotalCards(fcList.length)
          setCardCountByTopic(countMap)
        }
      } catch (e) {
        console.error('[usePracticeData] load error:', e)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [db, selectedSubjectId]))

  return { subjects: allSubjects, topicRows, recommendedTopics, selectedSubjectId, setSelectedSubjectId, totalCards, cardCountByTopic }
}
