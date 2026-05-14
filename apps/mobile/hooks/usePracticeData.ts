import { useState, useEffect } from 'react'
import { useDb } from './useDb'
import { subjects, topics, flashcards, userProgress } from '../db/schema'

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
  selectedSubjectId: string | null
  setSelectedSubjectId: (id: string | null) => void
  totalCards: number
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

// ── React hook ───────────────────────────────────────────────────────────────

export function usePracticeData(): PracticeData {
  const db = useDb()
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null)
  const [allSubjects, setAllSubjects] = useState<Array<{ id: string; name: string }>>([])
  const [topicRows, setTopicRows] = useState<TopicRow[]>([])
  const [totalCards, setTotalCards] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [subjectRows, topicList, fcList, progressList] = await Promise.all([
          db.select().from(subjects),
          db.select().from(topics),
          db.select({ id: flashcards.id, topicId: flashcards.topicId }).from(flashcards),
          db.select({
            flashcardId: userProgress.flashcardId,
            correct: userProgress.correct,
            answeredAt: userProgress.answeredAt,
          }).from(userProgress),
        ])

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

        if (!cancelled) {
          setAllSubjects(subjectRows)
          setTopicRows(rows)
          setTotalCards(fcList.length)
        }
      } catch (e) {
        console.error('[usePracticeData] load error:', e)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [db, selectedSubjectId])

  return { subjects: allSubjects, topicRows, selectedSubjectId, setSelectedSubjectId, totalCards }
}
