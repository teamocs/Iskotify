import { useState, useEffect, useMemo } from 'react'
import { StyleSheet, View, Text, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { inArray } from 'drizzle-orm'
import { useDb } from '../../../hooks/useDb'
import { flashcards as flashcardsTable } from '../../../db/schema'
import { buildQuizQuestions, safeParseOptions, type RawCard } from '../../../utils/mcDistractors'
import { parseAiOptions } from '../../../utils/parseAiOptions'
import { enhanceCardsByIds, type EnhanceProgress } from '../../../hooks/useAiEnhancement'
import { useTheme } from '../../../theme/ThemeContext'
import { spacing, radius } from '../../../theme/tokens'
import { pickQuestions } from '../../../utils/flashcardExam'
import { getDueFlashcards } from '../../../services/srsAggregates'
import { FlashcardExam } from '../../../components/practice/FlashcardExam'
import { WebTopSpacer } from '../../../components/ui/WebTopSpacer'

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
  const { theme: t, typo } = useTheme()

  const [phase, setPhase] = useState<Phase>('loading')
  const [examQuestions, setExamQuestions] = useState<ReturnType<typeof buildQuizQuestions>>([])
  const [enhanceProgress, setEnhanceProgress] = useState<EnhanceProgress>({ done: 0, total: 0 })

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    loadingTxt: { color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', marginTop: 80, fontSize: typo.md },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxxl },
    icon: { width: 72, height: 72, backgroundColor: t.warningSurface, borderWidth: 1, borderColor: 'rgba(251,191,36,0.35)', borderRadius: radius.xl, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
    iconTxt: { fontSize: 36 },
    emptyTitle: { fontSize: typo.h3, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', textAlign: 'center', marginBottom: spacing.xs },
    emptySub: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', marginBottom: spacing.xxl },
    ghostBtn: { paddingVertical: spacing.md, alignItems: 'center' },
    ghostBtnTxt: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  }), [t, typo])

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
      setExamQuestions(ordered)
      setPhase(ordered.length === 0 ? 'empty' : 'exam')
    }
    void load()
  }, [db])

  if (phase === 'loading') {
    return (
      <SafeAreaView style={s.root}>
        <WebTopSpacer />
        <Text style={s.loadingTxt}>Loading due cards…</Text>
      </SafeAreaView>
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
          <View style={s.icon}><Text style={s.iconTxt}>🎉</Text></View>
          <Text style={s.emptyTitle}>All caught up!</Text>
          <Text style={s.emptySub}>No cards are due for review right now.</Text>
          <Pressable accessibilityRole="button" style={s.ghostBtn} onPress={() => router.back()}>
            <Text style={s.ghostBtnTxt}>← Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <FlashcardExam
      title="Due Today"
      questions={examQuestions}
      deckId="__due__"
      onExit={() => router.back()}
    />
  )
}
