import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Animated } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { useDb } from '../../../hooks/useDb'
import { flashcards as flashcardsTable, userProgress, listings as listingsTable } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { useRecordSession } from '../../../hooks/useRecordSession'
import { buildQuizQuestions, type QuizQuestion, type RawCard } from '../../../utils/mcDistractors'
import { parseAiOptions } from '../../../utils/parseAiOptions'
import { useTheme } from '../../../theme/ThemeContext'

const TIMER_OPTIONS = [20, 30, 45, 60] as const
const MIN_QUESTIONS = 100
const QUESTION_STEP = 50
const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const

interface UserAnswer {
  flashcardId: string; selectedIndex: number | null; correct: boolean
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i] as T; a[i] = a[j] as T; a[j] = tmp
  }
  return a
}

type Phase = 'loading' | 'ready' | 'quiz' | 'results'

export default function ListingQuizScreen() {
  const { slug, mode } = useLocalSearchParams<{ slug: string; mode?: string }>()
  const db = useDb()
  const { recordSession } = useRecordSession()
  const { theme: t, typo } = useTheme()
  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    loadingTxt: { color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', marginTop: 80, fontSize: typo.md },
    readyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
    readyIcon: { width: 72, height: 72, backgroundColor: t.accentSurface, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
    readyTitle: { fontSize: typo.h3, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', textAlign: 'center', marginBottom: 4 },
    readySub: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', marginBottom: 2, textAlign: 'center' },
    readySub2: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginBottom: 28, textAlign: 'center' },
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
    dot: { height: 4, flex: 1, borderRadius: 2, backgroundColor: t.border },
    dotDone: { backgroundColor: 'rgba(128,0,0,0.60)' },
    dotCurrent: { backgroundColor: t.accentText },
    timerBg: { marginHorizontal: 14, height: 5, backgroundColor: t.surface2, borderRadius: 99, overflow: 'hidden' },
    timerFill: { height: 5, borderRadius: 99 },
    questionCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 22, padding: 18, marginBottom: 14 },
    questionMeta: { fontSize: typo.xs, letterSpacing: 1, textTransform: 'uppercase', color: t.textTertiary, marginBottom: 10, fontFamily: 'Lexend_600SemiBold' },
    questionText: { fontSize: typo.lg, fontWeight: '600', color: t.textPrimary, lineHeight: 24, fontFamily: 'Outfit_600SemiBold', marginBottom: 12 },
    optionBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surface, borderWidth: 1.5, borderColor: t.border, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 14 },
    optionBtnSelected: { backgroundColor: t.accentSurface, borderColor: t.accent },
    optionLetterBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    optionLetterBoxOn: { backgroundColor: t.accent },
    optionLetter: { fontSize: typo.sm, fontWeight: '700', color: t.textSecondary, fontFamily: 'Outfit_700Bold' },
    optionText: { flex: 1, fontSize: typo.md, color: t.textPrimary, fontFamily: 'Lexend_400Regular', lineHeight: 19 },
    scoreCard: { borderRadius: 24, padding: 22, marginBottom: 20, borderWidth: 1, alignItems: 'center' },
    scorePass: { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.25)' },
    scoreFail: { backgroundColor: 'rgba(239,68,68,0.07)', borderColor: 'rgba(239,68,68,0.20)' },
    scorePct: { fontSize: typo.display, fontWeight: '700', fontFamily: 'Outfit_700Bold', letterSpacing: -2, marginBottom: 4 },
    scoreVerdict: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 2 },
    scoreSub: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    scoreNum: { fontSize: typo.h2, fontWeight: '700', fontFamily: 'Outfit_700Bold' },
    scoreLbl: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textTransform: 'uppercase', letterSpacing: 0.5 },
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
  }), [t, typo])

  const [listingTitle, setListingTitle] = useState('')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [phase, setPhase] = useState<Phase>('loading')
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<UserAnswer[]>([])
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const allQuestionsRef = useRef<QuizQuestion[]>([])
  const timerSecsRef = useRef(20)
  const cardCountRef = useRef(MIN_QUESTIONS)
  const [cardCount, setCardCount] = useState(MIN_QUESTIONS)
  const [timerSecs, setTimerSecs] = useState(20)
  const [timeLeft, setTimeLeft] = useState(20)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeLeftRef = useRef(20)
  const advanceRef = useRef<(sel: number | null) => void>(() => {})
  const startTimeRef = useRef(0)
  const timerProgress = useRef(new Animated.Value(1)).current
  const timerAnimRef = useRef<Animated.CompositeAnimation | null>(null)

  useEffect(() => {
    async function load() {
      const [listingRows, allCards, progress] = await Promise.all([
        db.select({ title: listingsTable.title }).from(listingsTable).where(eq(listingsTable.slug, slug)).limit(1),
        db.select({ id: flashcardsTable.id, topicId: flashcardsTable.topicId, question: flashcardsTable.question, answer: flashcardsTable.answer, explanation: flashcardsTable.explanation, listingSlugs: flashcardsTable.listingSlugs, options: flashcardsTable.options, correctAnswerIndex: flashcardsTable.correctAnswerIndex, aiOptions: flashcardsTable.aiOptions, aiCorrectIndex: flashcardsTable.aiCorrectIndex, aiExplanation: flashcardsTable.aiExplanation }).from(flashcardsTable),
        db.select({ flashcardId: userProgress.flashcardId, correct: userProgress.correct }).from(userProgress),
      ])

      setListingTitle(listingRows[0]?.title ?? slug)

      // Filter cards belonging to this listing
      const matching = allCards.filter(card => {
        try { return (JSON.parse(card.listingSlugs ?? '[]') as string[]).includes(slug) }
        catch { return false }
      })

      let filtered = matching
      if (mode === 'weak') {
        // Find topics with <60% accuracy
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
        options: JSON.parse(row.options) as string[],
        correctAnswerIndex: row.correctAnswerIndex ?? undefined,
        aiOptions: parseAiOptions(row.aiOptions),
        aiCorrectIndex: row.aiCorrectIndex ?? null,
        aiExplanation: row.aiExplanation ?? null,
      }))
      const parsed = buildQuizQuestions(rawCards)
      allQuestionsRef.current = parsed
      const initialCount = Math.min(MIN_QUESTIONS, parsed.length)
      setCardCount(initialCount > 0 ? initialCount : parsed.length)
      setQuestions(parsed)
      setPhase(parsed.length === 0 ? 'results' : 'ready')
    }
    void load()
  }, [db, slug, mode])

  useEffect(() => { timerSecsRef.current = timerSecs }, [timerSecs])
  useEffect(() => { cardCountRef.current = cardCount }, [cardCount])

  useEffect(() => () => { stopTimer() }, [])

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    timerAnimRef.current?.stop()
  }

  function startTimer() {
    const secs = timerSecsRef.current
    stopTimer()
    timeLeftRef.current = secs
    setTimeLeft(secs)
    timerProgress.setValue(1)
    timerAnimRef.current = Animated.timing(timerProgress, { toValue: 0, duration: secs * 1000, useNativeDriver: false })
    timerAnimRef.current.start()
    timerRef.current = setInterval(() => {
      timeLeftRef.current -= 1
      setTimeLeft(timeLeftRef.current)
      if (timeLeftRef.current <= 0) { stopTimer(); advanceRef.current(null) }
    }, 1000)
  }

  const advance = useCallback((sel: number | null) => {
    const q = questions[currentIdx]
    if (!q) return
    const correct = sel !== null && sel === q.answerIndex
    const newAnswers: UserAnswer[] = [...answers, { flashcardId: q.id, selectedIndex: sel, correct }]

    if (currentIdx === questions.length - 1) {
      stopTimer()
      const score = newAnswers.filter(a => a.correct).length
      const now = Date.now()
      void db.transaction(async (tx) => {
        for (const a of newAnswers) {
          await tx.insert(userProgress).values({ flashcardId: a.flashcardId, correct: a.correct, answeredAt: now })
        }
      }).catch(e => console.warn('[listing-quiz] save progress error:', e))
      void recordSession({
        listingSlug: slug,
        topicId: '',
        deckId: mode === 'weak' ? '__weak__' : '__full__',
        score,
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
  }, [questions, currentIdx, answers, db, slug, mode, recordSession])

  useEffect(() => { advanceRef.current = advance })

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
    setCurrentIdx(0); setAnswers([]); setSelectedIdx(null)
    setQuestions(sliced)
    setPhase('quiz')
    setTimeout(() => startTimer(), 50)
  }

  const modeLabel = mode === 'weak' ? 'Weak Topics' : 'Full Review'

  if (phase === 'loading') return (
    <SafeAreaView style={s.root}><Text style={s.loadingTxt}>Loading…</Text></SafeAreaView>
  )

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
          <View style={s.readyIcon}><Text style={{ fontSize: 36 }}>{mode === 'weak' ? '⚠️' : '⚡'}</Text></View>
          <Text style={s.readyTitle}>{modeLabel}</Text>
          <Text style={s.readySub}>{listingTitle}</Text>
          <Text style={s.readySub2}>{questions.length} cards available</Text>

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

          <TouchableOpacity style={s.startBtn} onPress={startQuiz}>
            <Text style={s.startBtnTxt}>Start Quiz →</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.ghostBtn} onPress={() => router.back()}>
            <Text style={s.ghostBtnTxt}>← Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    )
  }

  if (phase === 'results') {
    const correct = answers.filter(a => a.correct).length
    const total = answers.length
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0
    const passed = pct >= 60
    if (total === 0) return (
      <SafeAreaView style={s.root}>
        <View style={s.readyWrap}>
          <Text style={s.readyTitle}>{mode === 'weak' ? 'No weak topics yet!' : 'No cards found'}</Text>
          <Text style={s.readySub2}>{mode === 'weak' ? 'Keep practicing to identify weak topics.' : 'No flashcards are tagged to this listing yet.'}</Text>
          <TouchableOpacity style={s.ghostBtn} onPress={() => router.back()}><Text style={s.ghostBtnTxt}>← Back</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    )
    return (
      <SafeAreaView style={s.root}>
        <View style={s.topBar}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}><Text style={s.backArrow}>‹</Text></TouchableOpacity>
          <Text style={s.topBarTitle}>Results</Text>
          <TouchableOpacity onPress={startQuiz}><Text style={s.retryLink}>Retry</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 48 }}>
          <View style={[s.scoreCard, passed ? s.scorePass : s.scoreFail]}>
            <Text style={[s.scorePct, { color: passed ? '#4ade80' : t.accentText }]}>{pct}%</Text>
            <Text style={s.scoreVerdict}>{passed ? '🎉 Great job!' : '📚 Keep practicing'}</Text>
            <Text style={s.scoreSub}>{modeLabel} · {listingTitle}</Text>
            <View style={{ flexDirection: 'row', gap: 28, marginTop: 16 }}>
              <View style={{ alignItems: 'center' }}><Text style={[s.scoreNum, { color: '#4ade80' }]}>{correct}</Text><Text style={s.scoreLbl}>Correct</Text></View>
              <View style={{ alignItems: 'center' }}><Text style={[s.scoreNum, { color: '#f87171' }]}>{total - correct}</Text><Text style={s.scoreLbl}>Wrong</Text></View>
              <View style={{ alignItems: 'center' }}><Text style={[s.scoreNum, { color: 'rgba(255,255,255,0.62)' }]}>{total}</Text><Text style={s.scoreLbl}>Total</Text></View>
            </View>
          </View>
          <TouchableOpacity style={s.startBtn} onPress={startQuiz}><Text style={s.startBtnTxt}>Play Again</Text></TouchableOpacity>
          <TouchableOpacity style={s.ghostBtn} onPress={() => router.back()}><Text style={s.ghostBtnTxt}>← Back</Text></TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    )
  }

  const q = questions[currentIdx]
  if (!q) {
    return (
      <SafeAreaView style={s.root}>
        <Text style={s.loadingTxt}>Loading question…</Text>
      </SafeAreaView>
    )
  }
  const timerBarColor = timerProgress.interpolate({ inputRange: [0, 0.3, 1], outputRange: ['#f87171', '#fbbf24', '#4ade80'], extrapolate: 'clamp' })
  const timerBarWidth = timerProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })

  return (
    <SafeAreaView style={s.root}>
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => { stopTimer(); router.back() }}><Text style={s.backArrow}>‹</Text></TouchableOpacity>
        <Text style={s.topBarTitle} numberOfLines={1}>{modeLabel}</Text>
        <Text style={s.qCounter}>{currentIdx + 1} / {questions.length}</Text>
      </View>
      <View style={s.dotsRow}>{questions.map((_, i) => <View key={i} style={[s.dot, i < currentIdx && s.dotDone, i === currentIdx && s.dotCurrent]} />)}</View>
      <View style={s.timerBg}><Animated.View style={[s.timerFill, { width: timerBarWidth, backgroundColor: timerBarColor }]} /></View>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 14, marginTop: 4, marginBottom: 4 }}>
        <Text style={[{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.45)', fontFamily: 'Lexend_600SemiBold' }, timeLeft <= 5 && { color: '#f87171' }]}>{timeLeft}s</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 40 }}>
        <View style={s.questionCard}>
          <Text style={s.questionMeta}>QUESTION {currentIdx + 1} OF {questions.length}</Text>
          <Text style={s.questionText}>{q.stem}</Text>
        </View>
        <View style={{ gap: 9 }}>
          {q.options.map((opt, oi) => {
            const isSelected = selectedIdx === oi
            return (
              <TouchableOpacity key={oi} style={[s.optionBtn, isSelected && s.optionBtnSelected]} onPress={() => handleSelect(oi)} activeOpacity={0.72} disabled={selectedIdx !== null}>
                <View style={[s.optionLetterBox, isSelected && s.optionLetterBoxOn]}>
                  <Text style={[s.optionLetter, isSelected && { color: '#fff' }]}>{OPTION_LETTERS[oi]}</Text>
                </View>
                <Text style={[s.optionText, isSelected && { color: '#fff', fontFamily: 'Lexend_600SemiBold' }]} numberOfLines={4}>{opt}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

