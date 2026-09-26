import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../hooks/useDb'
import { subscribe } from '../../services/queryCache'
import { flashcards as flashcardsTable, topics } from '../../db/schema'
import { buildQuizQuestions, safeParseOptions, type RawCard } from '../../utils/mcDistractors'
import { prefetchSessionImages } from '../../utils/prefetchQuestionImages'
import { parseAiOptions } from '../../utils/parseAiOptions'
import { enhanceCardsByIds, type EnhanceProgress } from '../../hooks/useAiEnhancement'
import { pickQuestions, dedupeByStem } from '../../utils/flashcardExam'
import { getDueFlashcards } from '../../services/srsAggregates'
import { FlashcardExam } from '../../components/practice/FlashcardExam'
import { FlashcardModeChooser } from '../../components/practice/SessionChooser'
import { SessionEmpty, SessionLoading, SessionPreparing } from '../../components/practice/SessionStates'

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'loading' | 'enhancing' | 'chooser' | 'exam' | 'empty'

// ── Helpers ───────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i] as T; a[i] = a[j] as T; a[j] = tmp
  }
  return a
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function QuizScreen() {
  const { topicId, listingSlug } = useLocalSearchParams<{ topicId: string; listingSlug?: string }>()
  const db = useDb()

  const [topicName, setTopicName] = useState('')
  const [allQuestions, setAllQuestions] = useState<ReturnType<typeof buildQuizQuestions>>([])
  const [phase, setPhase] = useState<Phase>('loading')
  const [examQuestions, setExamQuestions] = useState<ReturnType<typeof buildQuizQuestions>>([])
  const [enhanceProgress, setEnhanceProgress] = useState<EnhanceProgress>({ done: 0, total: 0 })
  // Task H: due-today option — flashcardId → dueAt for cards in this topic that are due now.
  const [dueAtById, setDueAtById] = useState<Record<string, number>>({})

  // Task H bugfix: dedupedQuestions/dueQuestions are the SAME deduped-by-stem
  // pool pickQuestions itself would produce — every count shown below is that
  // pool's .length (not the pre-dedup allQuestions.length), and the "Due
  // today" button hands the exam this exact dueQuestions array rather than
  // recomputing it, so the badge can never promise more than what gets served.
  // (Hooks must run unconditionally, so these live up here — before the
  // phase-gated early returns below — not down in the chooser JSX.)
  const dedupedQuestions = useMemo(() => dedupeByStem(allQuestions), [allQuestions])
  const dueQuestions = useMemo(() => pickQuestions(allQuestions, 'due', dueAtById), [allQuestions, dueAtById])


  // ── Data loading ────────────────────────────────────────────────────────────

  const loadedRef = useRef(false)

  const load = useCallback(async () => {
    const topicRows = await db.select({ name: topics.name }).from(topics).where(eq(topics.id, topicId)).limit(1)
    setTopicName(topicRows[0]?.name ?? 'Quiz')

    async function fetchCards() {
      return db.select({
        id: flashcardsTable.id,
        question: flashcardsTable.question,
        answer: flashcardsTable.answer,
        explanation: flashcardsTable.explanation,
        options: flashcardsTable.options,
        correctAnswerIndex: flashcardsTable.correctAnswerIndex,
        aiOptions: flashcardsTable.aiOptions,
        aiCorrectIndex: flashcardsTable.aiCorrectIndex,
        aiExplanation: flashcardsTable.aiExplanation,
        aiEnhancedAt: flashcardsTable.aiEnhancedAt,
        optionExplanations: flashcardsTable.optionExplanations,
        strategyTip: flashcardsTable.strategyTip,
        imageUrl: flashcardsTable.imageUrl,
        imageAlt: flashcardsTable.imageAlt,
        imageWidth: flashcardsTable.imageWidth,
        imageHeight: flashcardsTable.imageHeight,
      }).from(flashcardsTable).where(eq(flashcardsTable.topicId, topicId))
    }

    let cardRows = await fetchCards()

    // On-demand LLM enhancement: any card in this session that doesn't yet
    // have AI-generated MC distractors gets enhanced now.
    const unenhancedIds = cardRows
      .filter(r => r.aiEnhancedAt == null && safeParseOptions(r.options).length !== 4)
      .map(r => r.id)
    if (unenhancedIds.length > 0) {
      setEnhanceProgress({ done: 0, total: unenhancedIds.length })
      setPhase('enhancing')
      await enhanceCardsByIds(db, unenhancedIds, p => setEnhanceProgress(p))
      cardRows = await fetchCards()
    }

    const rawCards: RawCard[] = cardRows.map(row => ({
      ...row,
      options: safeParseOptions(row.options),
      correctAnswerIndex: row.correctAnswerIndex ?? undefined,
      aiOptions: parseAiOptions(row.aiOptions),
      aiCorrectIndex: row.aiCorrectIndex ?? null,
      aiExplanation: row.aiExplanation ?? null,
      optionExplanations: safeParseOptions(row.optionExplanations) as (string | null)[],
      strategyTip: row.strategyTip ?? null,
    }))
    const parsed = buildQuizQuestions(shuffle(rawCards))
    prefetchSessionImages(parsed) // fire-and-forget; never blocks session start
    setAllQuestions(parsed)
    if (parsed.length > 0) loadedRef.current = true
    setPhase(parsed.length === 0 ? 'empty' : 'chooser')

    // Task H: which of this topic's cards are due right now.
    try {
      const ids = parsed.map(q => q.id).filter((id): id is string => id != null)
      const due = await getDueFlashcards(db, Date.now(), ids)
      setDueAtById(Object.fromEntries(due.map(r => [r.flashcardId, r.dueAt])))
    } catch (e) {
      console.warn('[practice/topic] due lookup failed:', e)
    }
  }, [db, topicId])

  useEffect(() => { void load() }, [load])

  // Web: if this screen loaded before the fire-and-forget catalog sync delivered
  // cards, it would be stuck on 'empty'. Re-load when the practice cache refreshes
  // (post-sync) — but only while still empty, so an in-progress quiz is untouched.
  useEffect(() => {
    const unsub = subscribe('practice:', () => { if (!loadedRef.current) void load() })
    return unsub
  }, [load])

  // ── Phase: loading / preparing / empty ─────────────────────────────────────

  if (phase === 'loading') return <SessionLoading label="Loading quiz" />

  if (phase === 'enhancing') return <SessionPreparing done={enhanceProgress.done} total={enhanceProgress.total} />

  if (phase === 'empty') {
    return (
      <SessionEmpty
        title="No questions in this topic yet"
        body="New questions arrive with each sync. Try another topic in the meantime."
      />
    )
  }

  // ── Phase: exam ─────────────────────────────────────────────────────────────

  if (phase === 'exam') {
    return (
      <FlashcardExam
        title={topicName}
        questions={examQuestions}
        listingSlug={listingSlug}
        topicId={topicId}
        onExit={() => router.back()}
      />
    )
  }

  // ── Phase: chooser ──────────────────────────────────────────────────────────

  function choose(mode: 'quick' | 'full' | 'due') {
    const q = mode === 'due' ? dueQuestions : pickQuestions(allQuestions, mode)
    setExamQuestions(q)
    setPhase('exam')
  }

  return (
    <FlashcardModeChooser
      title={topicName}
      noun="topic"
      total={dedupedQuestions.length}
      dueCount={dueQuestions.length}
      fallbackHref="/practice"
      onChoose={choose}
    />
  )
}
