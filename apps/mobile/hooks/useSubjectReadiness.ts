import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useDb } from './useDb'
import { usePracticeData } from './usePracticeData'
import { cachedQuery, invalidate } from '../services/queryCache'
import { getTopicBestSessionPercentages, getSubjectSessionPercentages } from '../services/homeAggregates'
import { subjectPreparedness, type SubjectPreparednessEntry } from '../utils/subjectPreparedness'

const CACHE_KEY = 'home:sessionReadiness'

export interface SubjectReadiness {
  /** Per-subject readiness 0–100, lowest (most in need) first. */
  entries: SubjectPreparednessEntry[]
  loading: boolean
  error: boolean
  refresh: () => Promise<void>
}

/**
 * Readiness by subject for Progress (moved from Today in redesign M2).
 * SESSION-based: per-topic review bests + subject-level mock bests
 * (subtest == subject name), never a flashcard-accuracy fallback. Cached
 * under a 'home:' key so a finished session's invalidate('home:') refreshes it.
 */
export function useSubjectReadiness(): SubjectReadiness {
  const db = useDb()
  const { subjects, topicRows } = usePracticeData()
  const [maps, setMaps] = useState(() => ({ perTopic: new Map<string, number>(), subject: new Map<string, number>() }))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const mounted = useRef(true)

  const load = useCallback(async () => {
    try {
      const data = await cachedQuery(CACHE_KEY, 30_000, async () => {
        const [topicBest, subjectBest] = await Promise.all([
          getTopicBestSessionPercentages(db),
          getSubjectSessionPercentages(db),
        ])
        return { topicBest, subjectBest }
      })
      if (!mounted.current) return
      setMaps({
        perTopic: new Map(data.topicBest.map(r => [r.topicId, r.bestPct])),
        subject: new Map(data.subjectBest.map(r => [r.subject, r.bestPct])),
      })
      setError(false)
    } catch (e) {
      console.warn('[useSubjectReadiness] load failed:', e)
      if (mounted.current) setError(true)
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [db])

  useEffect(() => {
    mounted.current = true
    void load()
    return () => { mounted.current = false }
  }, [load])

  const refresh = useCallback(async () => {
    invalidate(CACHE_KEY)
    await load()
  }, [load])

  const entries = useMemo(
    () => subjectPreparedness(topicRows, subjects, maps.perTopic, maps.subject),
    [topicRows, subjects, maps],
  )

  return { entries, loading, error, refresh }
}
