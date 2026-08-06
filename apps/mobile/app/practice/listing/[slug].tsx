import { useState, useEffect, useMemo } from 'react'
import { StyleSheet, View, Text, Pressable, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { useDb } from '../../../hooks/useDb'
import { flashcards as flashcardsTable, userProgress, listings as listingsTable } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { buildQuizQuestions, safeParseOptions, type RawCard } from '../../../utils/mcDistractors'
import { parseAiOptions } from '../../../utils/parseAiOptions'
import { enhanceCardsByIds, type EnhanceProgress } from '../../../hooks/useAiEnhancement'
import { useTheme } from '../../../theme/ThemeContext'
import { spacing, radius } from '../../../theme/tokens'
import { pickQuestions, dedupeByStem } from '../../../utils/flashcardExam'
import { getDueFlashcards } from '../../../services/srsAggregates'
import { FlashcardExam } from '../../../components/practice/FlashcardExam'
import { WebTopSpacer } from '../../../components/ui/WebTopSpacer'
import { useWebContentWidth } from '../../../components/ui/webMaxWidth'

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
  const { theme: t, typo } = useTheme()
  // Web-only max-width centering for the chooser scroll content (null on native/sm).
  const webWidth = useWebContentWidth()

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

  const modeLabel = mode === 'weak' ? 'Weak Topics' : 'Full Review'

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    loadingTxt: { color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', marginTop: 80, fontSize: typo.md },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxxl },
    emptyTitle: { fontSize: typo.h3, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', textAlign: 'center', marginBottom: spacing.xs },
    emptySub: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', marginBottom: spacing.xxl },
    chooserContent: { alignItems: 'center' as const, paddingHorizontal: spacing.xxxl, paddingTop: 48, paddingBottom: spacing.xxxl },
    icon: { width: 72, height: 72, backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.35)', borderRadius: radius.xl, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
    iconTxt: { fontSize: 36 },
    title: { fontSize: typo.h3, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', textAlign: 'center', marginBottom: spacing.xs },
    sub: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', marginBottom: 2, textAlign: 'center' },
    sub2: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginBottom: spacing.xxl, textAlign: 'center' },
    choiceCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, width: '100%', marginBottom: spacing.md },
    choiceTitle: { fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 2 },
    choiceSub: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    // "Due today" chooser option (Task H) — warning-toned, same convention as
    // the practice-tab "Review due cards" row.
    dueChoiceCard: { backgroundColor: t.warningSurface, borderColor: 'rgba(251,191,36,0.35)' },
    dueChoiceTitle: { color: t.warning },
    ghostBtn: { paddingVertical: spacing.md, width: '100%', alignItems: 'center' },
    ghostBtnTxt: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  }), [t, typo])

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

  // ── Phase: loading ────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <SafeAreaView style={s.root}><WebTopSpacer /><Text style={s.loadingTxt}>Loading…</Text></SafeAreaView>
    )
  }

  if (phase === 'enhancing') {
    const pct = enhanceProgress.total > 0
      ? Math.round((enhanceProgress.done / enhanceProgress.total) * 100)
      : 0
    return (
      <SafeAreaView style={s.root}>
        <WebTopSpacer />
        <Text style={s.loadingTxt}>Preparing quiz options…</Text>
        <Text style={[s.loadingTxt, { marginTop: 8, fontSize: typo.sm }]}>
          {enhanceProgress.done} / {enhanceProgress.total} cards · {pct}%
        </Text>
        <Text style={[s.loadingTxt, { marginTop: 16, fontSize: typo.xs, paddingHorizontal: 32 }]}>
          Using the on-device AI to generate multiple-choice options. This runs only the first time you practice each card.
        </Text>
      </SafeAreaView>
    )
  }

  if (phase === 'empty') {
    return (
      <SafeAreaView style={s.root}>
        <WebTopSpacer />
        <View style={s.emptyWrap}>
          <Text style={s.emptyTitle}>{mode === 'weak' ? 'No weak topics yet!' : 'No cards found'}</Text>
          <Text style={s.emptySub}>{mode === 'weak' ? 'Keep practicing to identify weak topics.' : 'No flashcards are tagged to this listing yet.'}</Text>
          <Pressable style={s.ghostBtn} onPress={() => router.back()}>
            <Text style={s.ghostBtnTxt}>← Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
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

  const dueCount = dueQuestions.length

  return (
    <SafeAreaView style={s.root}>
      <WebTopSpacer />
      <ScrollView contentContainerStyle={[s.chooserContent, webWidth]} showsVerticalScrollIndicator={false}>
        <View style={s.icon}><Text style={s.iconTxt}>{mode === 'weak' ? '⚠️' : '⚡'}</Text></View>
        <Text style={s.title}>{modeLabel}</Text>
        <Text style={s.sub}>{listingTitle}</Text>
        <Text style={s.sub2}>{dedupedQuestions.length} cards available</Text>

        {dueCount > 0 ? (
          <Pressable style={[s.choiceCard, s.dueChoiceCard]} onPress={() => choose('due')}>
            <Text style={[s.choiceTitle, s.dueChoiceTitle]}>Due today ({dueCount})</Text>
            <Text style={s.choiceSub}>Cards scheduled for review, most overdue first</Text>
          </Pressable>
        ) : null}

        <Pressable style={s.choiceCard} onPress={() => choose('quick')}>
          <Text style={s.choiceTitle}>Quick (15)</Text>
          <Text style={s.choiceSub}>~15 sampled questions, shuffled</Text>
        </Pressable>

        <Pressable style={s.choiceCard} onPress={() => choose('full')}>
          <Text style={s.choiceTitle}>Full</Text>
          <Text style={s.choiceSub}>All {Math.min(dedupedQuestions.length, 60)} questions, in order</Text>
        </Pressable>

        <Pressable style={s.ghostBtn} onPress={() => router.back()}>
          <Text style={s.ghostBtnTxt}>← Back</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}
