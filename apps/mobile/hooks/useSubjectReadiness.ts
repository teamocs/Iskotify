import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useDb } from './useDb'
import { usePracticeData } from './usePracticeData'
import { useFocusEffect } from 'expo-router'
import { cachedQuery, invalidate, subscribe } from '../services/queryCache'
import { getSubjectRecentAccuracy } from '../services/homeAggregates'
import { subjectPreparedness, type SubjectPreparednessEntry } from '../utils/subjectPreparedness'

const CACHE_KEY = 'home:sessionReadiness'

export interface SubjectReadiness {
  /** Per-subject readiness 0–100 (null = not started), lowest (most in need) first. */
  entries: SubjectPreparednessEntry[]
  loading: boolean
  error: boolean
  refresh: () => Promise<void>
}

/**
 * Readiness by subject for Progress (moved from Today in redesign M2).
 * Weighted recent accuracy per subject (the latest 60 answered questions,
 * minimum 10 — see homeAggregates.getSubjectRecentAccuracy); a subject without
 * enough practice is null ("Not started"). Cached under a 'home:' key so a
 * finished session's invalidate('home:') refreshes it.
 */
export function useSubjectReadiness(): SubjectReadiness {
  const db = useDb()
  const { subjects, topicRows } = usePracticeData()
  const [subjectPct, setSubjectPct] = useState(() => new Map<string, number>())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const mounted = useRef(true)

  const load = useCallback(async () => {
    try {
      const rows = await cachedQuery(CACHE_KEY, 30_000, () => getSubjectRecentAccuracy(db))
      if (!mounted.current) return
      setSubjectPct(new Map(rows.map(r => [r.subject, r.pct])))
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

  // Progress stays mounted across tab switches: reload when a finished
  // session invalidates 'home:' and whenever the tab regains focus.
  useEffect(() => subscribe('home:', () => { void load() }), [load])
  useFocusEffect(useCallback(() => { void load() }, [load]))

  const refresh = useCallback(async () => {
    invalidate(CACHE_KEY)
    await load()
  }, [load])

  const entries = useMemo(
    () => subjectPreparedness(topicRows, subjects, subjectPct),
    [topicRows, subjects, subjectPct],
  )

  return { entries, loading, error, refresh }
}
