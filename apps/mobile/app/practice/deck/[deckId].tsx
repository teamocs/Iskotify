import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Animated } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { inArray, eq } from 'drizzle-orm'
import { useDb } from '../../../hooks/useDb'
import { savedDecks as savedDecksTable, flashcards as flashcardsTable, userProgress } from '../../../db/schema'
import { parseTopicIds } from '../../../hooks/useSavedDecks'
import { useRecordSession } from '../../../hooks/useRecordSession'
import { buildQuizQuestions, type QuizQuestion, type RawCard } from '../../../utils/mcDistractors'
import { parseAiOptions } from '../../../utils/parseAiOptions'
import { enhanceCardsByIds, type EnhanceProgress } from '../../../hooks/useAiEnhancement'
import { useTheme } from '../../../theme/ThemeContext'
import { StatusBar } from 'expo-status-bar'
import { useFocusModePref } from '../../../hooks/useFocusModePref'
import { useFocusMode } from '../../../hooks/useFocusMode'
import { FocusModeToggle } from '../../../components/FocusModeToggle'
import { SessionPausedOverlay } from '../../../components/SessionPausedOverlay'

// ── Constants ────────────────────────────────────────────────────────────────

const TIMER_OPTIONS = [20, 30, 45, 60] as const
const MIN_QUESTIONS = 20
const QUESTION_STEP = 10
const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserAnswer {
  flashcardId: string
  selectedIndex: number | null
  correct: boolean
}

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

type Phase = 'loading' | 'enhancing' | 'ready' | 'quiz' | 'results'

export default function DeckQuizScreen() {
  const { deckId, listingSlug } = useLocalSearchParams<{ deckId: string; listingSlug?: string }>()
  const db = useDb()
  const { theme: t, typo } = useTheme()
  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    loadingTxt: { color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', marginTop: 80, fontSize: typo.md },
    readyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
    configCard: {
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 18,
      padding: 14,
      width: '100%',
      gap: 14,
      marginBottom: 20,
    },
    configRow: { gap: 6 },
    configLabel: {
      fontSize: typo.xs,
      fontWeight: '700',
      color: t.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      fontFamily: 'Lexend_600SemiBold',
    },
    configChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    configChip: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface2,
    },
    configChipOn: { borderColor: t.accent, backgroundColor: t.accentSurface },
    configChipTxt: {
      fontSize: typo.sm,
      fontWeight: '600',
      color: t.textTertiary,
      fontFamily: 'Lexend_600SemiBold',
    },
    configChipTxtOn: { color: t.accentText },
    readyContent: {
      alignItems: 'center' as const,
      paddingHorizontal: 28,
      paddingTop: 48,
      paddingBottom: 40,
    },
    readyIcon: { width: 72, height: 72, backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.35)', borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
    readyTitle: { fontSize: typo.h3, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', textAlign: 'center', marginBottom: 6 },
    readySub: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginBottom: 24, textAlign: 'center' },
    rulesCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 18, padding: 16, width: '100%', gap: 10, marginBottom: 28 },
    ruleItem: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: 18 },
    startBtn: { backgroundColor: 'rgba(128,0,0,0.85)', borderRadius: 18, paddingVertical: 15, paddingHorizontal: 40, alignItems: 'center', width: '100%', marginBottom: 10 },
    startBtnTxt: { fontSize: typo.md, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
    ghostBtn: { paddingVertical: 12, width: '100%', alignItems: 'center' },
    ghostBtnTxt: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, gap: 8 },
    backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    backArrow: { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
    topBarTitle: { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    qCounter: { fontSize: typo.sm, fontWeight: '700', color: t.accentText, fontFamily: 'Lexend_600SemiBold' },
    retryLink: { fontSize: typo.sm, fontWeight: '600', color: t.accentText, fontFamily: 'Lexend_600SemiBold' },
    dotsRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 14, marginBottom: 8, flexWrap: 'wrap' },
    progressDot: { height: 4, flex: 1, borderRadius: 2, backgroundColor: t.border },
    dotDone: { backgroundColor: 'rgba(128,0,0,0.60)' },
    dotCurrent: { backgroundColor: t.accentText },
    timerBg: { marginHorizontal: 14, height: 5, backgroundColor: t.surface2, borderRadius: 99, overflow: 'hidden' },
    timerFill: { height: 5, borderRadius: 99 },
    timerLabelRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 14, marginTop: 4, marginBottom: 4 },
    timerLabel: { fontSize: typo.sm, fontWeight: '700', color: t.textTertiary, fontFamily: 'Lexend_600SemiBold' },
    timerLabelUrgent: { color: '#f87171' },
    quizScroll: { paddingHorizontal: 14, paddingBottom: 40 },
    questionCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 22, padding: 18, marginBottom: 14 },
    questionMeta: { fontSize: typo.xs, letterSpacing: 1, textTransform: 'uppercase', color: t.textTertiary, marginBottom: 10, fontFamily: 'Lexend_600SemiBold' },
    questionText: { fontSize: typo.lg, fontWeight: '600', color: t.textPrimary, lineHeight: 24, fontFamily: 'Outfit_600SemiBold', marginBottom: 12 },
    optionsWrap: { gap: 9 },
    optionBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surface, borderWidth: 1.5, borderColor: t.border, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 14 },
    optionBtnSelected: { backgroundColor: t.accentSurface, borderColor: t.accent },
    optionLetterBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    optionLetterBoxOn: { backgroundColor: t.accent },
    optionLetter: { fontSize: typo.sm, fontWeight: '700', color: t.textSecondary, fontFamily: 'Outfit_700Bold' },
    optionLetterOn: { color: '#fff' },
    optionText: { flex: 1, fontSize: typo.md, color: t.textPrimary, fontFamily: 'Lexend_400Regular', lineHeight: 19 },
    optionTextOn: { color: t.textPrimary, fontFamily: 'Lexend_600SemiBold' },
    noPeekRow: { alignItems: 'center', marginTop: 20 },
    noPeekTxt: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    resultsScroll: { paddingHorizontal: 14, paddingBottom: 24 },
    scoreCard: { borderRadius: 24, padding: 22, marginBottom: 20, borderWidth: 1, alignItems: 'center' },
    scoreCardPass: { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.25)' },
    scoreCardFail: { backgroundColor: 'rgba(239,68,68,0.07)', borderColor: 'rgba(239,68,68,0.20)' },
    scorePct: { fontSize: typo.display, fontWeight: '700', fontFamily: 'Outfit_700Bold', letterSpacing: -2, marginBottom: 4 },
    scoreVerdict: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 2 },
    scoreTopic: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginBottom: 20 },
    scoreCounts: { flexDirection: 'row', gap: 20, alignItems: 'center' },
    scoreCount: { alignItems: 'center' },
    scoreNum: { fontSize: typo.h2, fontWeight: '700', fontFamily: 'Outfit_700Bold' },
    scoreLbl: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textTransform: 'uppercase', letterSpacing: 0.5 },
    scoreDivider: { width: 1, height: 32, backgroundColor: t.border },
    reviewHeader: { fontSize: typo.sm, fontWeight: '700', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Lexend_600SemiBold', marginBottom: 10 },
    reviewCard: { borderRadius: 20, borderWidth: 1, padding: 14, marginBottom: 12 },
    reviewCardOk: { backgroundColor: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.18)' },
    reviewCardBad: { backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.18)' },
    reviewQHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    reviewQBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
    reviewQBadgeOk: { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.30)' },
    reviewQBadgeBad: { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.30)' },
    reviewQBadgeTxt: { fontSize: typo.xs, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
    timeoutBadge: { backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.30)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
    timeoutTxt: { fontSize: typo.xs, fontWeight: '600', color: '#fbbf24', fontFamily: 'Lexend_600SemiBold' },
    reviewStem: { fontSize: typo.md, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold', lineHeight: 20, marginBottom: 12 },
    reviewOptions: { gap: 6, marginBottom: 10 },
    reviewOpt: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.surface, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 10, borderWidth: 1, borderColor: 'transparent' },
    reviewOptCorrect: { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.35)' },
    reviewOptWrong: { backgroundColor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.30)' },
    reviewOptLetter: { width: 22, height: 22, borderRadius: 6, backgroundColor: t.surface2, textAlign: 'center', lineHeight: 22, fontSize: typo.xs, fontWeight: '700', fontFamily: 'Outfit_700Bold', color: t.textTertiary },
    reviewOptTxt: { flex: 1, fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: 17 },
    correctMark: { fontSize: typo.md, color: '#4ade80', fontWeight: '700' },
    wrongMark: { fontSize: typo.md, color: '#f87171', fontWeight: '700' },
    explainBox: { backgroundColor: t.surfaceSubtle, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: t.border },
    explainLabel: { fontSize: typo.xs, fontWeight: '700', color: t.textTertiary, fontFamily: 'Lexend_600SemiBold', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
    explainTxt: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: 17 },
  }), [t, typo])

  const [deckName, setDeckName] = useState('')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [phase, setPhase] = useState<Phase>('loading')
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<UserAnswer[]>([])
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [timeLeft, setTimeLeft] = useState(20)
  const [cardCount, setCardCount] = useState(MIN_QUESTIONS)
  const [timerSecs, setTimerSecs] = useState(20)
  const [enhanceProgress, setEnhanceProgress] = useState<EnhanceProgress>({ done: 0, total: 0 })

  const { recordSession } = useRecordSession()
  const startTimeRef = useRef(0)

  const { enabled: focusEnabled, setEnabled: setFocusEnabled } = useFocusModePref()

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeLeftRef = useRef(20)
  const advanceRef = useRef<(sel: number | null) => void>(() => {})
  const allQuestionsRef = useRef<QuizQuestion[]>([])
  const timerSecsRef = useRef(20)
  const cardCountRef = useRef(MIN_QUESTIONS)

  const timerProgress = useRef(new Animated.Value(1)).current
  const timerAnimRef = useRef<Animated.CompositeAnimation | null>(null)

  // ── Data loading ─────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const deckRows = await db.select().from(savedDecksTable).where(eq(savedDecksTable.id, deckId)).limit(1)
      const deck = deckRows[0]
      if (!deck) { setPhase('results'); return }

      setDeckName(deck.name)
      const topicIds = parseTopicIds(deck.topicIds)
      if (topicIds.length === 0) { setPhase('results'); return }

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
        .filter(r => r.aiEnhancedAt == null && (!r.options || JSON.parse(r.options || '[]').length !== 4))
        .map(r => r.id)
      if (unenhancedIds.length > 0) {
        setEnhanceProgress({ done: 0, total: unenhancedIds.length })
        setPhase('enhancing')
        await enhanceCardsByIds(db, unenhancedIds, p => setEnhanceProgress(p))
        cardRows = await fetchCards()
      }

      const rawCards: RawCard[] = cardRows.map(row => ({
        ...row,
        options: JSON.parse(row.options) as string[],
        correctAnswerIndex: row.correctAnswerIndex ?? undefined,
        aiOptions: parseAiOptions(row.aiOptions),
        aiCorrectIndex: row.aiCorrectIndex ?? null,
        aiExplanation: row.aiExplanation ?? null,
      }))
      const parsed = buildQuizQuestions(shuffle(rawCards))
      allQuestionsRef.current = parsed
      const initialCount = Math.min(MIN_QUESTIONS, parsed.length)
      setCardCount(initialCount > 0 ? initialCount : parsed.length)
      setQuestions(parsed)
      setPhase(parsed.length === 0 ? 'results' : 'ready')
    }
    void load()
  }, [db, deckId])

  // Cleanup on unmount
  useEffect(() => () => { stopTimer() }, [])

  useEffect(() => { timerSecsRef.current = timerSecs }, [timerSecs])
  useEffect(() => { cardCountRef.current = cardCount }, [cardCount])

  // ── Timer ────────────────────────────────────────────────────────────────────

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    timerAnimRef.current?.stop()
  }

  function pauseTimer() {
    stopTimer()
  }

  function resumeTimer() {
    const secs = timeLeftRef.current
    if (secs <= 0) return
    stopTimer()
    timerProgress.setValue(secs / timerSecsRef.current)
    timerAnimRef.current = Animated.timing(timerProgress, {
      toValue: 0,
      duration: secs * 1000,
      useNativeDriver: false,
    })
    timerAnimRef.current.start()
    timerRef.current = setInterval(() => {
      timeLeftRef.current -= 1
      setTimeLeft(timeLeftRef.current)
      if (timeLeftRef.current <= 0) {
        stopTimer()
        advanceRef.current(null)
      }
    }, 1000)
  }

  const focusMode = useFocusMode({
    enabled: focusEnabled,
    active: phase === 'quiz',
    onTimerPause: pauseTimer,
    onTimerResume: resumeTimer,
    onExitConfirmed: () => router.back(),
  })

  function startTimer() {
    const secs = timerSecsRef.current
    stopTimer()
    timeLeftRef.current = secs
    setTimeLeft(secs)

    timerProgress.setValue(1)
    timerAnimRef.current = Animated.timing(timerProgress, {
      toValue: 0,
      duration: secs * 1000,
      useNativeDriver: false,
    })
    timerAnimRef.current.start()

    timerRef.current = setInterval(() => {
      timeLeftRef.current -= 1
      setTimeLeft(timeLeftRef.current)
      if (timeLeftRef.current <= 0) {
        stopTimer()
        advanceRef.current(null)
      }
    }, 1000)
  }

  // ── Advance ──────────────────────────────────────────────────────────────────

  const advance = useCallback((sel: number | null) => {
    const q = questions[currentIdx]
    if (!q) return
    const correct = sel !== null && sel === q.answerIndex
    const newAnswers: UserAnswer[] = [...answers, { flashcardId: q.id, selectedIndex: sel, correct }]

    if (currentIdx === questions.length - 1) {
      const now = Date.now()
      void db.transaction(async (tx) => {
        for (const a of newAnswers) {
          await tx.insert(userProgress)
            .values({ flashcardId: a.flashcardId, correct: a.correct, answeredAt: now })
        }
      }).catch(e => console.warn('[deck-quiz] save progress error:', e))
      void recordSession({
        listingSlug: listingSlug ?? '',
        topicId: '',
        deckId,
        score: newAnswers.filter(a => a.correct).length,
        total: newAnswers.length,
        startTime: startTimeRef.current,
      })
      setAnswers(newAnswers)
      setPhase('results')
    } else {
      setAnswers(newAnswers)
      setCurrentIdx(i => i + 1)
      setSelectedIdx(null)
      startTimer()
    }
  }, [questions, currentIdx, answers, db, recordSession, listingSlug, deckId])

  useEffect(() => { advanceRef.current = advance })

  // ── User interaction ──────────────────────────────────────────────────────────

  function handleSelect(idx: number) {
    if (selectedIdx !== null) return
    stopTimer()
    setSelectedIdx(idx)
    setTimeout(() => advance(idx), 650)
  }

  function startQuiz() {
    if (allQuestionsRef.current.length === 0) return
    const sliced = shuffle([...allQuestionsRef.current]).slice(0, cardCountRef.current)
    startTimeRef.current = Date.now()
    setCurrentIdx(0)
    setAnswers([])
    setSelectedIdx(null)
    setQuestions(sliced)
    setPhase('quiz')
    setTimeout(() => startTimer(), 50)
  }

  function handlePlayAgain() {
    startQuiz()
  }

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

  // ── Phase: ready ──────────────────────────────────────────────────────────────

  if (phase === 'ready') {
    const cardOpts: number[] = []
    for (let n = MIN_QUESTIONS; n <= questions.length; n += QUESTION_STEP) cardOpts.push(n)
    if (cardOpts.length === 0 && questions.length > 0) cardOpts.push(questions.length)

    return (
      <SafeAreaView style={s.root}>
        <ScrollView
          contentContainerStyle={s.readyContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.readyIcon}><Text style={{ fontSize: 40 }}>🎯</Text></View>
          <Text style={s.readyTitle}>{deckName}</Text>
          <Text style={s.readySub}>{questions.length} cards available</Text>

          <View style={s.configCard}>
            <View style={s.configRow}>
              <Text style={s.configLabel}>Cards</Text>
              <View style={s.configChipsRow}>
                {cardOpts.map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[s.configChip, cardCount === n && s.configChipOn]}
                    onPress={() => setCardCount(n)}
                  >
                    <Text style={[s.configChipTxt, cardCount === n && s.configChipTxtOn]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={s.configRow}>
              <Text style={s.configLabel}>Time per card</Text>
              <View style={s.configChipsRow}>
                {TIMER_OPTIONS.map(sec => (
                  <TouchableOpacity
                    key={sec}
                    style={[s.configChip, timerSecs === sec && s.configChipOn]}
                    onPress={() => setTimerSecs(sec)}
                  >
                    <Text style={[s.configChipTxt, timerSecs === sec && s.configChipTxtOn]}>{sec}s</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View style={s.rulesCard}>
            <Text style={s.ruleItem}>⏱  Timer counts down each question</Text>
            <Text style={s.ruleItem}>🔤  Tap A / B / C / D to answer</Text>
            <Text style={s.ruleItem}>🔒  No hints — results revealed at the end</Text>
          </View>
          <FocusModeToggle enabled={focusEnabled} onToggle={setFocusEnabled} />
          <TouchableOpacity style={s.startBtn} onPress={() => startQuiz()}>
            <Text style={s.startBtnTxt}>Start Quiz →</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.ghostBtn} onPress={() => router.back()}>
            <Text style={s.ghostBtnTxt}>← Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    )
  }

  // ── Phase: results ────────────────────────────────────────────────────────────

  if (phase === 'results') {
    const correctCount = answers.filter(a => a.correct).length
    const total = answers.length
    const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0
    const passed = pct >= 60

    if (total === 0) {
      return (
        <SafeAreaView style={s.root}>
          <View style={s.readyWrap}>
            <Text style={s.readyTitle}>No MCQ cards</Text>
            <Text style={s.readySub}>This deck has no multiple-choice questions.</Text>
            <TouchableOpacity style={s.ghostBtn} onPress={() => router.back()}>
              <Text style={s.ghostBtnTxt}>← Back to Decks</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      )
    }

    return (
      <SafeAreaView style={s.root}>
        <View style={s.topBar}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Text style={s.backArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={s.topBarTitle} numberOfLines={1}>Quiz Results</Text>
          <TouchableOpacity onPress={handlePlayAgain} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.retryLink}>Retry</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.resultsScroll} showsVerticalScrollIndicator={false}>

          {/* Score hero */}
          <View style={[s.scoreCard, passed ? s.scoreCardPass : s.scoreCardFail]}>
            <Text style={[s.scorePct, { color: passed ? '#4ade80' : t.accentText }]}>{pct}%</Text>
            <Text style={s.scoreVerdict}>{passed ? '🎉 Great job!' : '📚 Keep practicing'}</Text>
            <Text style={s.scoreTopic}>{deckName}</Text>
            <View style={s.scoreCounts}>
              <View style={s.scoreCount}>
                <Text style={[s.scoreNum, { color: '#4ade80' }]}>{correctCount}</Text>
                <Text style={s.scoreLbl}>Correct</Text>
              </View>
              <View style={s.scoreDivider} />
              <View style={s.scoreCount}>
                <Text style={[s.scoreNum, { color: '#f87171' }]}>{total - correctCount}</Text>
                <Text style={s.scoreLbl}>Wrong</Text>
              </View>
              <View style={s.scoreDivider} />
              <View style={s.scoreCount}>
                <Text style={[s.scoreNum, { color: t.textSecondary }]}>{total}</Text>
                <Text style={s.scoreLbl}>Total</Text>
              </View>
            </View>
          </View>

          {/* Per-question review */}
          <Text style={s.reviewHeader}>Answer Review</Text>

          {questions.map((q, qi) => {
            const ans = answers[qi]
            const userIdx = ans?.selectedIndex ?? null
            const isCorrect = ans?.correct ?? false
            const timedOut = userIdx === null && !isCorrect

            return (
              <View key={q.id} style={[s.reviewCard, isCorrect ? s.reviewCardOk : s.reviewCardBad]}>

                <View style={s.reviewQHeader}>
                  <View style={[s.reviewQBadge, isCorrect ? s.reviewQBadgeOk : s.reviewQBadgeBad]}>
                    <Text style={[s.reviewQBadgeTxt, { color: isCorrect ? '#4ade80' : '#f87171' }]}>
                      {isCorrect ? '✓' : '✗'} Q{qi + 1}
                    </Text>
                  </View>
                  {timedOut && (
                    <View style={s.timeoutBadge}>
                      <Text style={s.timeoutTxt}>⏱ Timeout</Text>
                    </View>
                  )}
                </View>

                <Text style={s.reviewStem}>{q.stem}</Text>

                <View style={s.reviewOptions}>
                  {q.options.map((opt, oi) => {
                    const isAns = oi === q.answerIndex
                    const isUserPick = oi === userIdx
                    const isWrongPick = isUserPick && !isAns

                    return (
                      <View
                        key={oi}
                        style={[
                          s.reviewOpt,
                          isAns && s.reviewOptCorrect,
                          isWrongPick && s.reviewOptWrong,
                        ]}
                      >
                        <Text style={[
                          s.reviewOptLetter,
                          isAns && { color: '#4ade80' },
                          isWrongPick && { color: '#f87171' },
                        ]}>
                          {OPTION_LETTERS[oi]}
                        </Text>
                        <Text style={[
                          s.reviewOptTxt,
                          isAns && { color: t.textPrimary },
                          isWrongPick && { color: '#f87171', opacity: 0.85 },
                        ]} numberOfLines={3}>
                          {opt}
                        </Text>
                        {isAns && <Text style={s.correctMark}>✓</Text>}
                        {isWrongPick && <Text style={s.wrongMark}>✗</Text>}
                      </View>
                    )
                  })}
                </View>

                {q.explanation ? (
                  <View style={s.explainBox}>
                    <Text style={s.explainLabel}>💡 Explanation</Text>
                    <Text style={s.explainTxt}>{q.explanation}</Text>
                  </View>
                ) : null}

              </View>
            )
          })}

          <TouchableOpacity style={[s.startBtn, { marginTop: 4 }]} onPress={handlePlayAgain}>
            <Text style={s.startBtnTxt}>Play Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.ghostBtn} onPress={() => router.back()}>
            <Text style={s.ghostBtnTxt}>← Back to Decks</Text>
          </TouchableOpacity>
          <View style={{ height: 48 }} />
        </ScrollView>
      </SafeAreaView>
    )
  }

  // ── Phase: quiz ───────────────────────────────────────────────────────────────

  const q = questions[currentIdx]
  if (!q) {
    return (
      <SafeAreaView style={s.root}>
        <Text style={s.loadingTxt}>Loading question…</Text>
      </SafeAreaView>
    )
  }

  const timerBarColor = timerProgress.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: ['#f87171', '#fbbf24', '#4ade80'],
    extrapolate: 'clamp',
  })
  const timerBarWidth = timerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  })

  return (
    <SafeAreaView style={s.root}>

      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => { stopTimer(); router.back() }}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.topBarTitle} numberOfLines={1}>{deckName}</Text>
        <Text style={s.qCounter}>{currentIdx + 1} / {questions.length}</Text>
      </View>

      {/* Progress dots */}
      <View style={s.dotsRow}>
        {questions.map((_, i) => (
          <View
            key={i}
            style={[
              s.progressDot,
              i < currentIdx && s.dotDone,
              i === currentIdx && s.dotCurrent,
            ]}
          />
        ))}
      </View>

      {/* Timer bar */}
      <View style={s.timerBg}>
        <Animated.View style={[s.timerFill, { width: timerBarWidth, backgroundColor: timerBarColor }]} />
      </View>
      <View style={s.timerLabelRow}>
        <Text style={[s.timerLabel, timeLeft <= 5 && s.timerLabelUrgent]}>{timeLeft}s</Text>
      </View>

      <ScrollView contentContainerStyle={s.quizScroll} showsVerticalScrollIndicator={false}>

        {/* Question card */}
        <View style={s.questionCard}>
          <Text style={s.questionMeta}>QUESTION {currentIdx + 1} OF {questions.length}</Text>
          <Text style={s.questionText}>{q.stem}</Text>
        </View>

        {/* MCQ options */}
        <View style={s.optionsWrap}>
          {q.options.map((opt, oi) => {
            const letter = OPTION_LETTERS[oi]!
            const isSelected = selectedIdx === oi
            return (
              <TouchableOpacity
                key={oi}
                style={[s.optionBtn, isSelected && s.optionBtnSelected]}
                onPress={() => handleSelect(oi)}
                activeOpacity={0.72}
                disabled={selectedIdx !== null}
              >
                <View style={[s.optionLetterBox, isSelected && s.optionLetterBoxOn]}>
                  <Text style={[s.optionLetter, isSelected && s.optionLetterOn]}>{letter}</Text>
                </View>
                <Text style={[s.optionText, isSelected && s.optionTextOn]} numberOfLines={4}>
                  {opt}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* No peeking reminder */}
        <View style={s.noPeekRow}>
          <Text style={s.noPeekTxt}>🔒 Results revealed after the last question</Text>
        </View>

      </ScrollView>

      <SessionPausedOverlay
        visible={focusMode.isPaused}
        timeRemainingSecs={timeLeft}
        onResume={focusMode.resumeSession}
        onEnd={() => {
          focusMode.endSession()
          setPhase('results')
        }}
      />
      {focusEnabled && phase === 'quiz' && <StatusBar hidden />}
    </SafeAreaView>
  )
}

