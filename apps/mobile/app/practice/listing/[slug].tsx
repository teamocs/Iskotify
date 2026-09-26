import { useState, useEffect, useMemo } from 'react'
import { useLocalSearchParams, router } from 'expo-router'
import { useDb } from '../../../hooks/useDb'
import { flashcards as flashcardsTable, userProgress, listings as listingsTable } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { buildQuizQuestions, safeParseOptions, type RawCard } from '../../../utils/mcDistractors'
import { prefetchSessionImages } from '../../../utils/prefetchQuestionImages'
import { parseAiOptions } from '../../../utils/parseAiOptions'
import { enhanceCardsByIds, type EnhanceProgress } from '../../../hooks/useAiEnhancement'
import { useTheme } from '../../../theme/ThemeContext'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Bulb2Outlined } from '@lineiconshq/free-icons'
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

export default function ListingQuizScreen() {
  // `mode` here is the card-set filter (all vs weak topics) — separate from Quick/Full size
  const { slug, mode } = useLocalSearchParams<{ slug: string; mode?: string }>()
  const db = useDb()
  const { theme: t } = useTheme()

  const [listingTitle, setListingTitle] = useState('')
  const [allQuestions, setAllQuestions] = useState<ReturnType<typeof buildQuizQuestions>>([])
  const [phase, setPhase] = useState<Phase>('loading')
  const [examQuestions, setExamQuestions] = useState<ReturnType<typeof buildQuizQuestions>>([])
  const [enhanceProgress, setEnhanceProgress] = useState<EnhanceProgress>({ done: 0, total: 0 })
  // Task H: due-today option — flashcardId → dueAt for cards in this pool that are due now.
  const [dueAtById, setDueAtById] = useState<Record<string, number>>({})

  // Task H bugfix: see the identical comment in app/practice/[topicId].tsx —
  // count and served set both come from the SAME deduped-by-stem pool so the
  // "Due today" badge can never promise more cards than the exam delivers.
  // (Hooks must run unconditionally, so these live up here, not in the
  // phase-gated chooser JSX below.)
  const dedupedQuestions = useMemo(() => dedupeByStem(allQuestions), [allQuestions])
  const dueQuestions = useMemo(() => pickQuestions(allQuestions, 'due', dueAtById), [allQuestions, dueAtById])

  const modeLabel = mode === 'weak' ? 'Weak topics' : 'Full review'


  // ── Data loading ──────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      async function fetchAllCards() {
        return db.select({
          id: flashcardsTable.id,
          topicId: flashcardsTable.topicId,
          question: flashcardsTable.question,
          answer: flashcardsTable.answer,
          explanation: flashcardsTable.explanation,
          listingSlugs: flashcardsTable.listingSlugs,
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
        }).from(flashcardsTable)
      }

      const [listingRows, initialCards, progress] = await Promise.all([
        db.select({ title: listingsTable.title }).from(listingsTable).where(eq(listingsTable.slug, slug)).limit(1),
        fetchAllCards(),
        db.select({ flashcardId: userProgress.flashcardId, correct: userProgress.correct }).from(userProgress),
      ])

      setListingTitle(listingRows[0]?.title ?? slug)

      // Filter cards belonging to this listing
      function filterToListing(rows: typeof initialCards) {
        return rows.filter(card => {
          try { return (JSON.parse(card.listingSlugs ?? '[]') as string[]).includes(slug) }
          catch { return false }
        })
      }

      let allCards = initialCards
      let matching = filterToListing(allCards)

      // On-demand LLM enhancement of unenhanced cards in this listing before quiz starts.
      const unenhancedIds = matching
        .filter(r => r.aiEnhancedAt == null && safeParseOptions(r.options).length !== 4)
        .map(r => r.id)
      if (unenhancedIds.length > 0) {
        setEnhanceProgress({ done: 0, total: unenhancedIds.length })
        setPhase('enhancing')
        await enhanceCardsByIds(db, unenhancedIds, p => setEnhanceProgress(p))
        allCards = await fetchAllCards()
        matching = filterToListing(allCards)
      }

      // mode=weak: filter to cards from topics with <60% accuracy.
      // This controls WHICH cards are included; Quick/Full below controls HOW MANY.
      let filtered = matching
      if (mode === 'weak') {
        const fcByTopic: Record<string, string[]> = {}
        for (const c of matching) {
          if (!fcByTopic[c.topicId]) fcByTopic[c.topicId] = []
          fcByTopic[c.topicId]!.push(c.id)
        }
        const weakTopicIds = new Set<string>()
        for (const [topicId, fcIds] of Object.entries(fcByTopic)) {
          const tp = progress.filter(p => fcIds.includes(p.flashcardId))
          if (tp.length === 0) continue
          const correct = tp.filter(p => p.correct === true || (p.correct as unknown as number) === 1).length
          if (correct / tp.length < 0.6) weakTopicIds.add(topicId)
        }
        filtered = matching.filter(c => weakTopicIds.has(c.topicId))
      }

      const rawCards: RawCard[] = (shuffle(filtered) as typeof filtered).map(row => ({
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
      prefetchSessionImages(parsed) // fire-and-forget; never blocks session start
      setAllQuestions(parsed)
      setPhase(parsed.length === 0 ? 'empty' : 'chooser')

      // Task H: which of this pool's cards are due right now.
      try {
        const ids = parsed.map(q => q.id).filter((id): id is string => id != null)
        const due = await getDueFlashcards(db, Date.now(), ids)
        setDueAtById(Object.fromEntries(due.map(r => [r.flashcardId, r.dueAt])))
      } catch (e) {
        console.warn('[practice/listing] due lookup failed:', e)
      }
    }
    void load()
  }, [db, slug, mode])

  // ── Phase: loading / preparing / empty ─────────────────────────────────────

  if (phase === 'loading') return <SessionLoading label="Loading cards" />

  if (phase === 'enhancing') return <SessionPreparing done={enhanceProgress.done} total={enhanceProgress.total} />

  if (phase === 'empty') {
    return mode === 'weak' ? (
      <SessionEmpty
        title="No weak topics yet"
        body="Keep practising. Topics under 60% show up here so you can drill them."
        icon={<Lineicons icon={Bulb2Outlined} size={24} color={t.textSecondary} />}
      />
    ) : (
      <SessionEmpty title="No cards for this listing yet" body="No flashcards are tagged to this listing yet. They arrive with each sync." />
    )
  }

  // ── Phase: exam ────────────────────────────────────────────────────────────────

  if (phase === 'exam') {
    return (
      <FlashcardExam
        title={`${modeLabel} · ${listingTitle}`}
        questions={examQuestions}
        listingSlug={slug}
        onExit={() => router.back()}
      />
    )
  }

  // ── Phase: chooser ─────────────────────────────────────────────────────────────
  // Quick/Full controls the SIZE of the question set drawn from the already-filtered
  // card pool (which for mode=weak has already been narrowed to weak topics).

  function choose(size: 'quick' | 'full' | 'due') {
    const q = size === 'due' ? dueQuestions : pickQuestions(allQuestions, size)
    setExamQuestions(q)
    setPhase('exam')
  }

  return (
    <FlashcardModeChooser
      title={modeLabel}
      noun="set"
      context={listingTitle}
      total={dedupedQuestions.length}
      dueCount={dueQuestions.length}
      fallbackHref="/practice"
      onChoose={choose}
    />
  )
}
