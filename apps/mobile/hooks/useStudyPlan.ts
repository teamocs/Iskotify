import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useFocusEffect } from 'expo-router'
import { InteractionManager } from 'react-native'
import { useDb } from './useDb'
import { subscribe } from '../services/queryCache'
import {
  gatherPlanInputs, getPlanItemsForDate, persistPlanItems, markPlanItemDone,
} from '../services/studyPlan'
import { generateStudyPlan, formatPlanDate, type StudyPlanItemKind } from '../utils/studyPlan'

export interface StudyPlanItem {
  id: number
  kind: StudyPlanItemKind
  refId: string
  targetCount: number
  completedAt: number | null
}

export interface UseStudyPlanResult {
  items: StudyPlanItem[]
  loading: boolean
  /** Items exist for today AND every one is completed. */
  allDone: boolean
  /** Rough size of tomorrow's plan, shown in the all-caught-up state. 0 when unknown/none. */
  tomorrowItemCount: number
  markComplete: (id: number) => Promise<void>
  refresh: () => Promise<void>
}

const EMPTY_ITEMS: StudyPlanItem[] = []

/**
 * useStudyPlan (Task I) — generates/loads today's "Today's Plan" items,
 * idempotently per calendar day: if study_plan_items already has rows for
 * today's planDate, they're loaded as-is; otherwise a fresh plan is generated
 * via utils/studyPlan.ts's generateStudyPlan() (fed by
 * services/studyPlan.ts's gatherPlanInputs) and persisted.
 *
 * Completion has two paths:
 *   - Manual check-off via markComplete() (optimistic, reconciled on failure).
 *   - Automatic: hooks/useRecordSession.ts and hooks/useRecordSrs.ts call
 *     services/studyPlan.ts's markPlanItemsDoneForSession /
 *     markPlanItemsDoneForSrsReview as fire-and-forget bookkeeping after a
 *     real session/review commits. Those writes invalidate the 'home:'
 *     cache prefix, which this hook is subscribed to, so a session completed
 *     from any screen refreshes the fold without a manual re-open.
 */
export function useStudyPlan(): UseStudyPlanResult {
  const db = useDb()
  const [items, setItems] = useState<StudyPlanItem[]>(EMPTY_ITEMS)
  const [loading, setLoading] = useState(true)
  const [tomorrowItemCount, setTomorrowItemCount] = useState(0)
  const isMountedRef = useRef(true)
  const generatingRef = useRef(false)

  const load = useCallback(async () => {
    if (generatingRef.current) return
    generatingRef.current = true
    try {
      const now = Date.now()
      const today = new Date(now)
      const planDate = formatPlanDate(today)

      let rows = await getPlanItemsForDate(db, planDate)

      if (rows.length === 0) {
        const input = await gatherPlanInputs(db, today)
        const drafts = generateStudyPlan(input)
        rows = await persistPlanItems(db, planDate, drafts, now)

        if (drafts.length === 0) {
          // All caught up today — preview tomorrow's rough size (approximate:
          // reuses today's due-SRS/weak-topic signals against tomorrow's
          // date; never persisted, purely a "N more tomorrow" hint).
          const tomorrow = new Date(now + 86_400_000)
          const tomorrowDraft = generateStudyPlan({ ...input, today: tomorrow })
          if (isMountedRef.current) setTomorrowItemCount(tomorrowDraft.length)
        } else if (isMountedRef.current) {
          setTomorrowItemCount(0)
        }
      } else if (isMountedRef.current) {
        setTomorrowItemCount(0)
      }

      if (isMountedRef.current) {
        setItems(rows.map(r => ({
          id: r.id, kind: r.kind, refId: r.refId, targetCount: r.targetCount, completedAt: r.completedAt,
        })))
        setLoading(false)
      }
    } catch (e) {
      console.error('[useStudyPlan] load error:', e)
      if (isMountedRef.current) setLoading(false)
    } finally {
      generatingRef.current = false
    }
  }, [db])

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  // A completed session/review elsewhere invalidates 'home:' (see
  // hooks/useRecordSession.ts / useRecordSrs.ts) — reload so the fold
  // reflects the new completedAt without the user reopening the screen.
  useEffect(() => {
    const unsub = subscribe('home:', () => { void load() })
    return unsub
  }, [load])

  useFocusEffect(useCallback(() => {
    InteractionManager.runAfterInteractions(() => { void load() })
  }, [load]))

  const markComplete = useCallback(async (id: number) => {
    const completedAt = Date.now()
    setItems(prev => prev.map(it => (it.id === id && it.completedAt == null) ? { ...it, completedAt } : it))
    try {
      await markPlanItemDone(db, id, completedAt)
    } catch (e) {
      console.error('[useStudyPlan] markComplete error:', e)
      await load() // resync with the DB on failure rather than trust the optimistic update
    }
  }, [db, load])

  const allDone = items.length > 0 && items.every(i => i.completedAt != null)

  return useMemo(() => ({
    items, loading, allDone, tomorrowItemCount, markComplete, refresh: load,
  }), [items, loading, allDone, tomorrowItemCount, markComplete, load])
}
