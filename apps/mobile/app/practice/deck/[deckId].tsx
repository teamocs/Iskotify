import { useState, useEffect, useMemo } from 'react'
import { StyleSheet, View, Text, Pressable, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { inArray, eq } from 'drizzle-orm'
import { useDb } from '../../../hooks/useDb'
import { savedDecks as savedDecksTable, flashcards as flashcardsTable } from '../../../db/schema'
import { parseTopicIds } from '../../../hooks/useSavedDecks'
import { buildQuizQuestions, safeParseOptions, type RawCard } from '../../../utils/mcDistractors'
import { parseAiOptions } from '../../../utils/parseAiOptions'
import { enhanceCardsByIds, type EnhanceProgress } from '../../../hooks/useAiEnhancement'
import { useTheme } from '../../../theme/ThemeContext'
import { pickQuestions } from '../../../utils/flashcardExam'
import { FlashcardExam } from '../../../components/practice/FlashcardExam'

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
  const { theme: t, typo } = useTheme()

  const [deckName, setDeckName] = useState('')
  const [allQuestions, setAllQuestions] = useState<ReturnType<typeof buildQuizQuestions>>([])
  const [phase, setPhase] = useState<Phase>('loading')
  const [examQuestions, setExamQuestions] = useState<ReturnType<typeof buildQuizQuestions>>([])
  const [enhanceProgress, setEnhanceProgress] = useState<EnhanceProgress>({ done: 0, total: 0 })

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    loadingTxt: { color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', marginTop: 80, fontSize: typo.md },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
    emptyTitle: { fontSize: typo.h3, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', textAlign: 'center', marginBottom: 6 },
    emptySub: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', marginBottom: 24 },
    chooserContent: { alignItems: 'center' as const, paddingHorizontal: 28, paddingTop: 48, paddingBottom: 40 },
    icon: { width: 72, height: 72, backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.35)', borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
    iconTxt: { fontSize: 40 },
    title: { fontSize: typo.h3, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', textAlign: 'center', marginBottom: 6 },
    sub: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginBottom: 28, textAlign: 'center' },
    choiceCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 18, padding: 18, width: '100%', marginBottom: 12 },
    choiceTitle: { fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 2 },
    choiceSub: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    ghostBtn: { paddingVertical: 12, width: '100%', alignItems: 'center' },
    ghostBtnTxt: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  }), [t, typo])

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
      }))
      const parsed = buildQuizQuestions(shuffle(rawCards))
      setAllQuestions(parsed)
      setPhase(parsed.length === 0 ? 'empty' : 'chooser')
    }
    void load()
  }, [db, deckId])

  // ── Phase: loading ────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <SafeAreaView style={s.root}>
        <Text style={s.loadingTxt}>Loading deck…</Text>
      </SafeAreaView>
    )
  }

  if (phase === 'enhancing') {
    const pct = enhanceProgress.total > 0
      ? Math.round((enhanceProgress.done / enhanceProgress.total) * 100)
      : 0
    return (
      <SafeAreaView style={s.root}>
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
        <View style={s.emptyWrap}>
          <Text style={s.emptyTitle}>No MCQ cards</Text>
          <Text style={s.emptySub}>This deck has no multiple-choice questions.</Text>
          <Pressable style={s.ghostBtn} onPress={() => router.back()}>
            <Text style={s.ghostBtnTxt}>← Back to Decks</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  // ── Phase: exam ───────────────────────────────────────────────────────────────

  if (phase === 'exam') {
    return (
      <FlashcardExam
        title={deckName}
        questions={examQuestions}
        listingSlug={listingSlug}
        onExit={() => router.back()}
      />
    )
  }

  // ── Phase: chooser ────────────────────────────────────────────────────────────

  function choose(mode: 'quick' | 'full') {
    const q = pickQuestions(allQuestions, mode)
    setExamQuestions(q)
    setPhase('exam')
  }

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.chooserContent} showsVerticalScrollIndicator={false}>
        <View style={s.icon}><Text style={s.iconTxt}>🎯</Text></View>
        <Text style={s.title}>{deckName}</Text>
        <Text style={s.sub}>{allQuestions.length} cards available</Text>

        <Pressable style={s.choiceCard} onPress={() => choose('quick')}>
          <Text style={s.choiceTitle}>Quick (15)</Text>
          <Text style={s.choiceSub}>~15 sampled questions, shuffled</Text>
        </Pressable>

        <Pressable style={s.choiceCard} onPress={() => choose('full')}>
          <Text style={s.choiceTitle}>Full</Text>
          <Text style={s.choiceSub}>All {Math.min(allQuestions.length, 60)} questions, in order</Text>
        </Pressable>

        <Pressable style={s.ghostBtn} onPress={() => router.back()}>
          <Text style={s.ghostBtnTxt}>← Back</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}
