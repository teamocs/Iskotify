import { useState, useEffect } from 'react'
import { router } from 'expo-router'
import { inArray } from 'drizzle-orm'
import { useDb } from '../../../hooks/useDb'
import { flashcards as flashcardsTable } from '../../../db/schema'
import { buildQuizQuestions, safeParseOptions, type RawCard } from '../../../utils/mcDistractors'
import { prefetchSessionImages } from '../../../utils/prefetchQuestionImages'
import { parseAiOptions } from '../../../utils/parseAiOptions'
import { enhanceCardsByIds, type EnhanceProgress } from '../../../hooks/useAiEnhancement'
import { useTheme } from '../../../theme/ThemeContext'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { CheckCircle1Outlined } from '@lineiconshq/free-icons'
import { pickQuestions } from '../../../utils/flashcardExam'
import { getDueFlashcards } from '../../../services/srsAggregates'
import { FlashcardExam } from '../../../components/practice/FlashcardExam'
import { SessionEmpty, SessionLoading, SessionPreparing } from '../../../components/practice/SessionStates'

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'loading' | 'enhancing' | 'exam' | 'empty'

// ── Screen ────────────────────────────────────────────────────────────────────

/**
 * DueReviewScreen (Task H) — the destination for the practice tab's "Review
 * due cards" row. Unlike the topic/deck/listing choosers (which offer
 * Quick/Full/Due as sibling options on an already-scoped card pool), this
 * screen IS the due queue: it draws from every published flashcard, so it
 * skips straight to the exam instead of showing a redundant chooser step —
 * the tab row already told the student how many cards ("N cards ready").
 *
 * deckId is the '__due__' sentinel (see hooks/useAnalytics.ts's
 * computeTopicMastery / recentSessions title mapping) so these sessions don't
 * get attributed to a real deck/topic in analytics, mirroring the existing
 * '__full__'/'__weak__' sentinels.
 */
export default function DueReviewScreen() {
  const db = useDb()
  const { theme: t } = useTheme()

  const [phase, setPhase] = useState<Phase>('loading')
  const [examQuestions, setExamQuestions] = useState<ReturnType<typeof buildQuizQuestions>>([])
  const [enhanceProgress, setEnhanceProgress] = useState<EnhanceProgress>({ done: 0, total: 0 })


  useEffect(() => {
    async function load() {
      const dueRows = await getDueFlashcards(db, Date.now())
      if (dueRows.length === 0) { setPhase('empty'); return }
      const dueAtById = Object.fromEntries(dueRows.map(r => [r.flashcardId, r.dueAt]))
      const ids = dueRows.map(r => r.flashcardId)

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
        }).from(flashcardsTable).where(inArray(flashcardsTable.id, ids))
      }

      let cardRows = await fetchCards()

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
      const parsed = buildQuizQuestions(rawCards)
      const ordered = pickQuestions(parsed, 'due', dueAtById)
      prefetchSessionImages(ordered) // fire-and-forget; never blocks session start
      setExamQuestions(ordered)
      setPhase(ordered.length === 0 ? 'empty' : 'exam')
    }
    void load()
  }, [db])

  if (phase === 'loading') return <SessionLoading label="Loading due cards" />

  if (phase === 'enhancing') return <SessionPreparing done={enhanceProgress.done} total={enhanceProgress.total} />

  if (phase === 'empty') {
    return (
      <SessionEmpty
        title="All caught up"
        body="No cards are due for review right now. Come back tomorrow, or practise a topic."
        icon={<Lineicons icon={CheckCircle1Outlined} size={24} color={t.textSecondary} />}
      />
    )
  }

  return (
    <FlashcardExam
      title="Due today"
      questions={examQuestions}
      deckId="__due__"
      onExit={() => router.back()}
    />
  )
}
