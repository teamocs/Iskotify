import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { StyleSheet, View, Text, Pressable, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../hooks/useDb'
import { subscribe } from '../../services/queryCache'
import { flashcards as flashcardsTable, topics } from '../../db/schema'
import { buildQuizQuestions, safeParseOptions, type RawCard } from '../../utils/mcDistractors'
import { parseAiOptions } from '../../utils/parseAiOptions'
import { enhanceCardsByIds, type EnhanceProgress } from '../../hooks/useAiEnhancement'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius } from '../../theme/tokens'
import { pickQuestions } from '../../utils/flashcardExam'
import { FlashcardExam } from '../../components/practice/FlashcardExam'
import { WebTopSpacer } from '../../components/ui/WebTopSpacer'
import { useWebContentWidth } from '../../components/ui/webMaxWidth'

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

  const { theme: t, typo } = useTheme()
  // Web-only max-width centering for the chooser scroll content (null on native/sm).
  const webWidth = useWebContentWidth()
  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    loadingTxt: { color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', marginTop: 80, fontSize: typo.md },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl },
    emptyTitle: { fontSize: typo.h3, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', textAlign: 'center', marginBottom: spacing.xs },
    emptySub: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', marginBottom: spacing.xxl },
    chooserContent: { alignItems: 'center' as const, paddingHorizontal: spacing.xxl, paddingTop: spacing.xxxl, paddingBottom: spacing.xxxl },
    icon: { width: 72, height: 72, backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.35)', borderRadius: radius.xl, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
    iconTxt: { fontSize: 40 },
    title: { fontSize: typo.h3, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', textAlign: 'center', marginBottom: spacing.xs },
    sub: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginBottom: spacing.xxl, textAlign: 'center' },
    choiceCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, width: '100%', marginBottom: spacing.md },
    choiceTitle: { fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: spacing.xs / 2 },
    choiceSub: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    ghostBtn: { paddingVertical: spacing.md, width: '100%', alignItems: 'center' },
    ghostBtnTxt: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  }), [t, typo])

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
    setAllQuestions(parsed)
    if (parsed.length > 0) loadedRef.current = true
    setPhase(parsed.length === 0 ? 'empty' : 'chooser')
  }, [db, topicId])

  useEffect(() => { void load() }, [load])

  // Web: if this screen loaded before the fire-and-forget catalog sync delivered
  // cards, it would be stuck on 'empty'. Re-load when the practice cache refreshes
  // (post-sync) — but only while still empty, so an in-progress quiz is untouched.
  useEffect(() => {
    const unsub = subscribe('practice:', () => { if (!loadedRef.current) void load() })
    return unsub
  }, [load])

  // ── Phase: loading ──────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <SafeAreaView style={s.root}>
        <WebTopSpacer />
        <Text style={s.loadingTxt}>Loading quiz…</Text>
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
          <Text style={s.emptyTitle}>No cards found</Text>
          <Text style={s.emptySub}>This topic has no multiple-choice questions.</Text>
          <Pressable accessibilityRole="button" style={s.ghostBtn} onPress={() => router.back()}>
            <Text style={s.ghostBtnTxt}>← Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
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

  function choose(mode: 'quick' | 'full') {
    const q = pickQuestions(allQuestions, mode)
    setExamQuestions(q)
    setPhase('exam')
  }

  return (
    <SafeAreaView style={s.root}>
      <WebTopSpacer />
      <ScrollView contentContainerStyle={[s.chooserContent, webWidth]} showsVerticalScrollIndicator={false}>
        <View style={s.icon}><Text style={s.iconTxt}>🎯</Text></View>
        <Text style={s.title}>{topicName}</Text>
        <Text style={s.sub}>{allQuestions.length} cards available</Text>

        <Pressable accessibilityRole="button" style={s.choiceCard} onPress={() => choose('quick')}>
          <Text style={s.choiceTitle}>Quick (15)</Text>
          <Text style={s.choiceSub}>~15 sampled questions, shuffled</Text>
        </Pressable>

        <Pressable accessibilityRole="button" style={s.choiceCard} onPress={() => choose('full')}>
          <Text style={s.choiceTitle}>Full</Text>
          <Text style={s.choiceSub}>All {Math.min(allQuestions.length, 60)} questions, in order</Text>
        </Pressable>

        <Pressable accessibilityRole="button" style={s.ghostBtn} onPress={() => router.back()}>
          <Text style={s.ghostBtnTxt}>← Back</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}
