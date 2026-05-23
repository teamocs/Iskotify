import {
  createContext, useCallback, useContext, useEffect,
  useMemo, useRef, useState,
  type ReactNode,
} from 'react'
import { AppState, InteractionManager, type AppStateStatus } from 'react-native'
import { useDb } from '../hooks/useDb'
import { useHomeStats, type HomeStats } from '../hooks/useHomeStats'
import {
  modelExists, runCoachInference, releaseContextIfIdle,
} from '../services/llm'
import {
  buildCoachPrompt, computeContextHash, COACH_CATEGORIES,
  type CoachCategory, type CoachContext,
} from '../services/coachPrompts'
import { pickTemplate } from '../services/coachTemplates'
import {
  loadFreshPhrases, pruneStalePhrases, insertPhrase,
  markConsumed, gcOldConsumed, getAcquiredRequirementIndices,
  type QueuedPhrase,
} from '../services/coachQueue'
import { listings as listingsTable } from '../db/schema'
import { eq } from 'drizzle-orm'

const GENERATION_DELAY_MS = 800
const IDLE_RELEASE_CHECK_MS = 60_000
const CONSUMED_GC_THRESHOLD_MS = 24 * 60 * 60 * 1000

interface CoachState {
  queue: QueuedPhrase[]
  ringIndex: number
  isReady: boolean
}

interface CoachContextValue {
  stats: HomeStats
  ringIndex: number
  nextPhrase: () => { id: number | null; text: string }
}

const Ctx = createContext<CoachContextValue | null>(null)

async function buildCoachContextFromStats(
  db: ReturnType<typeof useDb>,
  stats: HomeStats,
): Promise<CoachContext> {
  let acquiredCount = 0
  let totalRequirements = 0
  let remainingRequirements: string[] = []

  const focused = stats.focusedListings[0]
  if (focused) {
    const [row] = await db
      .select({ requirements: listingsTable.requirements })
      .from(listingsTable)
      .where(eq(listingsTable.slug, focused.slug))
      .limit(1)
    if (row) {
      let reqs: string[] = []
      try {
        reqs = JSON.parse(row.requirements) as string[]
      } catch { reqs = [] }
      totalRequirements = reqs.length
      if (totalRequirements > 0) {
        const acquiredIdx = await getAcquiredRequirementIndices(db, focused.slug)
        const acquiredSet = new Set(acquiredIdx)
        acquiredCount = acquiredSet.size
        remainingRequirements = reqs.filter((_, i) => !acquiredSet.has(i))
      }
    }
  }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const practicedToday = stats.practiceDayIndices
    .some(d => d >= Math.floor(todayStart.getTime() / 86400000))

  return {
    ...stats,
    acquiredCount,
    totalRequirements,
    remainingRequirements,
    practicedToday,
  }
}

export function AiCoachProvider({ children }: { children: ReactNode }) {
  const db = useDb()
  const stats = useHomeStats()
  const [state, setState] = useState<CoachState>({
    queue: [], ringIndex: 0, isReady: false,
  })
  const isMountedRef = useRef(true)
  const ringIndexRef = useRef(0)
  const ctxRef = useRef<CoachContext | null>(null)
  const hashRef = useRef<string>('')
  const generatingPromiseRef = useRef<Promise<void> | null>(null)
  const pendingRefillRef = useRef<Set<CoachCategory>>(new Set())

  // ── Initial load + staggered generation ─────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true
    let cancelled = false

    void (async () => {
      try {
        const ctx = await buildCoachContextFromStats(db, stats)
        const hash = computeContextHash(ctx)
        ctxRef.current = ctx
        hashRef.current = hash

        await pruneStalePhrases(db, hash)
        await gcOldConsumed(db, CONSUMED_GC_THRESHOLD_MS)
        const rows = await loadFreshPhrases(db, hash)

        if (!cancelled && isMountedRef.current) {
          setState(s => ({ ...s, queue: rows, isReady: true }))
        }

        if (!(await modelExists())) return
        scheduleBatchGeneration(ctx, hash)
      } catch (e) {
        console.warn('[AiCoachProvider] init failed:', e)
        if (!cancelled && isMountedRef.current) {
          setState(s => ({ ...s, isReady: true }))
        }
      }
    })()

    return () => {
      cancelled = true
      isMountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db])

  // ── AppState: release context after background idle ────────────────────────
  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout> | null = null

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = setTimeout(() => {
          void releaseContextIfIdle()
        }, IDLE_RELEASE_CHECK_MS)
      } else if (next === 'active') {
        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
      }
    })

    return () => {
      sub.remove()
      if (idleTimer) clearTimeout(idleTimer)
    }
  }, [])

  // ── Background generation scheduler ────────────────────────────────────────
  const generateOne = useCallback(async (
    categoryIdx: number,
    ctx: CoachContext,
    hash: string,
  ): Promise<void> => {
    if (categoryIdx >= COACH_CATEGORIES.length) return

    // Chain off the previous in-flight generation (no busy-wait)
    const prev = generatingPromiseRef.current ?? Promise.resolve()
    const next = prev.then(() => new Promise<void>((resolve) => {
      InteractionManager.runAfterInteractions(() => {
        void (async () => {
          try {
            const category = COACH_CATEGORIES[categoryIdx]!
            pendingRefillRef.current.delete(category)
            const prompt = buildCoachPrompt(category, ctx)
            if (prompt === null) {
              resolve()
              // Move to next category eagerly (no LLM work needed)
              void generateOne(categoryIdx + 1, ctx, hash)
              return
            }

            const phrase = await runCoachInference(prompt)
            if (phrase && isMountedRef.current && hashRef.current === hash) {
              await insertPhrase(db, category, phrase, hash)
              const rows = await loadFreshPhrases(db, hash)
              if (isMountedRef.current && hashRef.current === hash) {
                setState(s => ({ ...s, queue: rows }))
              }
            }
          } catch (e) {
            console.warn('[AiCoachProvider] generation error:', e)
          } finally {
            resolve()
            // Schedule next category with a small delay so we don't hammer the LLM
            setTimeout(() => void generateOne(categoryIdx + 1, ctx, hash), GENERATION_DELAY_MS)
          }
        })()
      })
    }))

    generatingPromiseRef.current = next
    return next
  }, [db])

  const scheduleBatchGeneration = useCallback((ctx: CoachContext, hash: string) => {
    for (const cat of COACH_CATEGORIES) pendingRefillRef.current.add(cat)
    void generateOne(0, ctx, hash)
  }, [generateOne])

  // ── Refill a single category after consumption ─────────────────────────────
  const refillCategory = useCallback((category: CoachCategory) => {
    const ctx = ctxRef.current
    const hash = hashRef.current
    if (!ctx || !hash) return
    if (pendingRefillRef.current.has(category)) return  // already queued
    const idx = COACH_CATEGORIES.indexOf(category)
    if (idx < 0) return
    pendingRefillRef.current.add(category)
    setTimeout(() => void generateOne(idx, ctx, hash), GENERATION_DELAY_MS)
  }, [generateOne])

  // ── Tap handler: consume next phrase ───────────────────────────────────────
  const nextPhrase = useCallback((): { id: number | null; text: string } => {
    // Atomic read-and-increment via ref — prevents rapid-tap stale closure bug
    const currentIdx = ringIndexRef.current
    ringIndexRef.current = currentIdx + 1

    const head = state.queue[0]
    if (head) {
      setState(s => ({ ...s, queue: s.queue.slice(1), ringIndex: currentIdx + 1 }))
      void markConsumed(db, head.id).catch(e =>
        console.warn('[AiCoachProvider] markConsumed failed:', e))
      refillCategory(head.category)
      return { id: head.id, text: head.text }
    }

    setState(s => ({ ...s, ringIndex: currentIdx + 1 }))
    return { id: null, text: pickTemplate(stats, currentIdx) }
  }, [state.queue, db, stats, refillCategory])

  const value = useMemo<CoachContextValue>(() => ({
    stats,
    ringIndex: state.ringIndex,
    nextPhrase,
  }), [stats, state.ringIndex, nextPhrase])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCoachContext(): CoachContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useCoachContext must be used within AiCoachProvider')
  return v
}
