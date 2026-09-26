import { useState, useEffect, useMemo } from 'react'
import { useLocalSearchParams, router } from 'expo-router'
import { inArray, eq } from 'drizzle-orm'
import { useDb } from '../../../hooks/useDb'
import { savedDecks as savedDecksTable, flashcards as flashcardsTable } from '../../../db/schema'
import { parseTopicIds } from '../../../hooks/useSavedDecks'
import { buildQuizQuestions, safeParseOptions, type RawCard } from '../../../utils/mcDistractors'
import { prefetchSessionImages } from '../../../utils/prefetchQuestionImages'
import { parseAiOptions } from '../../../utils/parseAiOptions'
import { enhanceCardsByIds, type EnhanceProgress } from '../../../hooks/useAiEnhancement'
import { pickQuestions, dedupeByStem } from '../../../utils/flashcardExam'
import { getDueFlashcards } from '../../../services/srsAggregates'
import { FlashcardExam } from '../../../components/practice/FlashcardExam'
import { FlashcardModeChooser } from '../../../components/practice/SessionChooser'
import { SessionEmpty, SessionLoading, SessionPreparing } from '../../../components/practice/SessionStates'

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

export default function DeckQuizScreen() {
  const { deckId, listingSlug } = useLocalSearchParams<{ deckId: string; listingSlug?: string }>()
  const db = useDb()

  const [deckName, setDeckName] = useState('')
  const [allQuestions, setAllQuestions] = useState<ReturnType<typeof buildQuizQuestions>>([])
  const [phase, setPhase] = useState<Phase>('loading')
  const [examQuestions, setExamQuestions] = useState<ReturnType<typeof buildQuizQuestions>>([])
  const [enhanceProgress, setEnhanceProgress] = useState<EnhanceProgress>({ done: 0, total: 0 })
  // Task H: due-today option — flashcardId → dueAt for cards in this deck that are due now.
  const [dueAtById, setDueAtById] = useState<Record<string, number>>({})

  // Task H bugfix: see the identical comment in app/practice/[topicId].tsx —
  // count and served set both come from the SAME deduped-by-stem pool so the
  // "Due today" badge can never promise more cards than the exam delivers.
  // (Hooks must run unconditionally, so these live up here, not in the
  // phase-gated chooser JSX below.)
  const dedupedQuestions = useMemo(() => dedupeByStem(allQuestions), [allQuestions])
  const dueQuestions = useMemo(() => pickQuestions(allQuestions, 'due', dueAtById), [allQuestions, dueAtById])


  // ── Data loading ─────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const deckRows = await db.select().from(savedDecksTable).where(eq(savedDecksTable.id, deckId)).limit(1)
      const deck = deckRows[0]
      if (!deck) { setPhase('empty'); return }

      setDeckName(deck.name)
      const topicIds = parseTopicIds(deck.topicIds)
      if (topicIds.length === 0) { setPhase('empty'); return }

      async function fetchCards() {
        return db
          .select({
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
          })
          .from(flashcardsTable)
          .where(inArray(flashcardsTable.topicId, topicIds))
      }

      let cardRows = await fetchCards()

      // On-demand LLM enhancement of unenhanced cards before quiz starts.
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
      setPhase(parsed.length === 0 ? 'empty' : 'chooser')

      // Task H: which of this deck's cards are due right now.
      try {
        const ids = parsed.map(q => q.id).filter((id): id is string => id != null)
        const due = await getDueFlashcards(db, Date.now(), ids)
        setDueAtById(Object.fromEntries(due.map(r => [r.flashcardId, r.dueAt])))
      } catch (e) {
        console.warn('[practice/deck] due lookup failed:', e)
      }
    }
    void load()
  }, [db, deckId])

  // ── Phase: loading / preparing / empty ─────────────────────────────────────

  if (phase === 'loading') return <SessionLoading label="Loading deck" />

  if (phase === 'enhancing') return <SessionPreparing done={enhanceProgress.done} total={enhanceProgress.total} />

  if (phase === 'empty') {
    return (
      <SessionEmpty
        title="This deck has no questions yet"
        body="Add topics with multiple-choice cards to this deck, or practise a topic directly."
      />
    )
  }

  // ── Phase: exam ───────────────────────────────────────────────────────────────

  if (phase === 'exam') {
    return (
      <FlashcardExam
        title={deckName}
        questions={examQuestions}
        listingSlug={listingSlug}
        deckId={deckId}
        onExit={() => router.back()}
      />
    )
  }

  // ── Phase: chooser ────────────────────────────────────────────────────────────

  function choose(mode: 'quick' | 'full' | 'due') {
    const q = mode === 'due' ? dueQuestions : pickQuestions(allQuestions, mode)
    setExamQuestions(q)
    setPhase('exam')
  }

  return (
    <FlashcardModeChooser
      title={deckName}
      noun="deck"
      total={dedupedQuestions.length}
      dueCount={dueQuestions.length}
      fallbackHref="/practice"
      onChoose={choose}
    />
  )
}
