import { useState, useEffect, useRef, useCallback } from 'react'
import { StyleSheet, View, Text, TouchableOpacity, Animated, PanResponder } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../hooks/useDb'
import { flashcards as flashcardsTable, topics, userProgress } from '../../db/schema'

interface Card { id: string; question: string; answer: string; explanation: string; difficulty: number }
interface Result { flashcardId: string; correct: boolean }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i] as T; a[i] = a[j] as T; a[j] = tmp
  }
  return a
}

const DIFF: Record<number, { label: string; color: string; bg: string; border: string }> = {
  1: { label: 'Easy',   color: '#4ade80', bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.22)'  },
  2: { label: 'Medium', color: '#fbbf24', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.22)' },
  3: { label: 'Hard',   color: '#f87171', bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.22)'  },
}

export default function FlashcardScreen() {
  const { topicId } = useLocalSearchParams<{ topicId: string }>()
  const db = useDb()

  const [topicName, setTopicName] = useState('')
  const [cards, setCards] = useState<Card[]>([])
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [results, setResults] = useState<Result[]>([])
  const [done, setDone] = useState(false)

  // Swipe state
  const pan = useRef(new Animated.ValueXY()).current
  const flippedRef = useRef(false)
  const handleAnswerRef = useRef<(correct: boolean) => void>(() => {})

  useEffect(() => {
    flippedRef.current = flipped
    if (!flipped) pan.setValue({ x: 0, y: 0 })
  }, [flipped])

  useEffect(() => {
    async function load() {
      const [topicRows, cardRows] = await Promise.all([
        db.select({ name: topics.name }).from(topics).where(eq(topics.id, topicId)).limit(1),
        db.select({
          id: flashcardsTable.id,
          question: flashcardsTable.question,
          answer: flashcardsTable.answer,
          explanation: flashcardsTable.explanation,
          difficulty: flashcardsTable.difficulty,
        }).from(flashcardsTable).where(eq(flashcardsTable.topicId, topicId)),
      ])
      setTopicName(topicRows[0]?.name ?? 'Topic')
      setCards(shuffle(cardRows))
    }
    void load()
  }, [db, topicId])

  const handleAnswer = useCallback((correct: boolean) => {
    const card = cards[idx]!
    const newResults = [...results, { flashcardId: card.id, correct }]
    pan.setValue({ x: 0, y: 0 })
    if (idx === cards.length - 1) {
      const now = Date.now()
      db.transaction(tx => {
        for (const r of newResults) {
          tx.insert(userProgress)
            .values({ flashcardId: r.flashcardId, correct: r.correct, answeredAt: now })
            .run()
        }
      })
      setResults(newResults)
      setDone(true)
    } else {
      setResults(newResults)
      setIdx(i => i + 1)
      setFlipped(false)
    }
  }, [cards, idx, results, db, pan])

  // Keep ref current every render so PanResponder closure always calls latest version
  useEffect(() => { handleAnswerRef.current = handleAnswer })

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => flippedRef.current,
      onMoveShouldSetPanResponder: (_, gs) => flippedRef.current && Math.abs(gs.dx) > 5,
      onPanResponderMove: Animated.event([null, { dx: pan.x }], { useNativeDriver: false }),
      onPanResponderRelease: (_, { dx, vx }) => {
        if (dx > 100 || (dx > 50 && vx > 0.5)) {
          Animated.timing(pan.x, { toValue: 500, duration: 180, useNativeDriver: false })
            .start(() => handleAnswerRef.current(true))
        } else if (dx < -100 || (dx < -50 && vx < -0.5)) {
          Animated.timing(pan.x, { toValue: -500, duration: 180, useNativeDriver: false })
            .start(() => handleAnswerRef.current(false))
        } else {
          Animated.spring(pan.x, { toValue: 0, useNativeDriver: false }).start()
        }
      },
    })
  ).current

  const rotate = pan.x.interpolate({ inputRange: [-200, 0, 200], outputRange: ['-8deg', '0deg', '8deg'], extrapolate: 'clamp' })
  const correctOpacity = pan.x.interpolate({ inputRange: [0, 80], outputRange: [0, 1], extrapolate: 'clamp' })
  const wrongOpacity = pan.x.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' })

  function handlePracticeAgain() {
    setCards(c => shuffle(c))
    setIdx(0)
    setFlipped(false)
    setResults([])
    setDone(false)
  }

  if (cards.length === 0) {
    return (
      <SafeAreaView style={s.root}>
        <Text style={s.loading}>Loading cards…</Text>
      </SafeAreaView>
    )
  }

  if (done) {
    const correct = results.filter(r => r.correct).length
    const accuracy = Math.round((correct / results.length) * 100)
    return (
      <SafeAreaView style={s.root}>
        <View style={s.resultsWrap}>
          <Text style={s.resultPct}>{accuracy}%</Text>
          <Text style={s.resultTitle}>Session Complete</Text>
          <Text style={s.resultTopic}>{topicName}</Text>
          <View style={s.resultCounts}>
            <View style={s.resultCount}>
              <Text style={[s.resultNum, { color: '#4ade80' }]}>{correct}</Text>
              <Text style={s.resultLbl}>Correct</Text>
            </View>
            <View style={s.resultCount}>
              <Text style={[s.resultNum, { color: '#f87171' }]}>{results.length - correct}</Text>
              <Text style={s.resultLbl}>Wrong</Text>
            </View>
          </View>
          <TouchableOpacity style={s.primaryBtn} onPress={handlePracticeAgain}>
            <Text style={s.primaryBtnTxt}>Practice Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.ghostBtn} onPress={() => router.back()}>
            <Text style={s.ghostBtnTxt}>Back to Topics</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  const card = cards[idx]!
  const diff = DIFF[card.difficulty] ?? DIFF[2]!

  return (
    <SafeAreaView style={s.root}>

      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.topicTitle} numberOfLines={1}>{topicName}</Text>
        <Text style={s.counter}>{idx + 1} / {cards.length}</Text>
      </View>

      {/* Progress bar */}
      <View style={s.progBg}>
        <View style={[s.progFill, { width: `${((idx + 1) / cards.length) * 100}%` as any }]} />
      </View>

      {/* Swipe hint — shown after flip */}
      <View style={s.swipeHintRow}>
        {flipped ? (
          <>
            <Text style={s.swipeWrongHint}>✕ Swipe left</Text>
            <Text style={s.swipeMidHint}>to answer</Text>
            <Text style={s.swipeCorrectHint}>Swipe right ✓</Text>
          </>
        ) : (
          <Text style={s.swipeMidHint}>Tap card to reveal answer</Text>
        )}
      </View>

      {/* Swipeable card */}
      <Animated.View
        style={[s.cardWrap, { transform: [{ translateX: pan.x }, { rotate }] }]}
        {...panResponder.panHandlers}
      >
        {/* Correct overlay (right swipe) */}
        <Animated.View style={[s.swipeOverlay, s.correctOverlay, { opacity: correctOpacity }]}>
          <Text style={[s.overlayLabel, { color: '#4ade80' }]}>CORRECT ✓</Text>
        </Animated.View>
        {/* Wrong overlay (left swipe) */}
        <Animated.View style={[s.swipeOverlay, s.wrongOverlay, { opacity: wrongOpacity }]}>
          <Text style={[s.overlayLabel, { color: '#f87171' }]}>WRONG ✗</Text>
        </Animated.View>

        <TouchableOpacity
          style={s.cardInner}
          onPress={() => { if (!flippedRef.current) setFlipped(true) }}
          activeOpacity={flipped ? 1 : 0.85}
        >
          <Text style={s.cardLabel}>{flipped ? 'ANSWER' : 'QUESTION'}</Text>
          <Text style={s.cardText}>{flipped ? card.answer : card.question}</Text>
          {flipped && card.explanation ? (
            <Text style={s.cardExpl}>{card.explanation}</Text>
          ) : null}
        </TouchableOpacity>
      </Animated.View>

      {/* Difficulty chip */}
      <View style={s.diffRow}>
        <View style={[s.diffChip, { backgroundColor: diff.bg, borderColor: diff.border }]}>
          <Text style={[s.diffText, { color: diff.color }]}>{diff.label} difficulty</Text>
        </View>
      </View>

      {/* Button fallback after flip */}
      {flipped ? (
        <View style={s.actions}>
          <TouchableOpacity style={[s.actionBtn, s.wrongBtn]} onPress={() => handleAnswer(false)}>
            <Text style={[s.actionTxt, { color: '#f87171' }]}>✕  Wrong</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, s.correctBtn]} onPress={() => handleAnswer(true)}>
            <Text style={[s.actionTxt, { color: '#4ade80' }]}>✓  Correct</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ height: 56 }} />
      )}

    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a1a2e' },
  loading: { color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular', textAlign: 'center', marginTop: 80 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, gap: 8 },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backArrow: { color: 'rgba(255,255,255,0.62)', fontSize: 26, lineHeight: 30 },
  topicTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  counter: { fontSize: 10, color: 'rgba(255,255,255,0.38)', fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  progBg: { marginHorizontal: 14, height: 3, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 99, marginBottom: 8 },
  progFill: { height: 3, backgroundColor: '#800000', borderRadius: 99 },
  swipeHintRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, marginBottom: 6, height: 18 },
  swipeWrongHint: { fontSize: 9.5, color: '#f87171', fontFamily: 'Lexend_600SemiBold', fontWeight: '600' },
  swipeMidHint: { fontSize: 9.5, color: 'rgba(255,255,255,0.30)', fontFamily: 'Lexend_400Regular' },
  swipeCorrectHint: { fontSize: 9.5, color: '#4ade80', fontFamily: 'Lexend_600SemiBold', fontWeight: '600' },
  cardWrap: { marginHorizontal: 14, marginBottom: 10, minHeight: 220, position: 'relative' },
  swipeOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 22, zIndex: 10, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' },
  correctOverlay: { backgroundColor: 'rgba(34,197,94,0.18)', borderWidth: 2, borderColor: 'rgba(34,197,94,0.55)' },
  wrongOverlay: { backgroundColor: 'rgba(239,68,68,0.18)', borderWidth: 2, borderColor: 'rgba(239,68,68,0.55)' },
  overlayLabel: { fontSize: 18, fontWeight: '700', fontFamily: 'Outfit_700Bold', letterSpacing: 1 },
  cardInner: { backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 22, padding: 22, minHeight: 220, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { fontSize: 8.5, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', marginBottom: 10, fontFamily: 'Lexend_600SemiBold', fontWeight: '600' },
  cardText: { fontSize: 15, fontWeight: '600', color: '#fff', textAlign: 'center', lineHeight: 22, fontFamily: 'Outfit_600SemiBold' },
  cardExpl: { fontSize: 11, color: 'rgba(255,255,255,0.60)', textAlign: 'center', marginTop: 10, lineHeight: 16, fontFamily: 'Lexend_400Regular' },
  diffRow: { alignItems: 'center', marginBottom: 12 },
  diffChip: { borderWidth: 1, borderRadius: 980, paddingHorizontal: 10, paddingVertical: 4 },
  diffText: { fontSize: 10, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 14 },
  actionBtn: { flex: 1, borderRadius: 16, padding: 13, alignItems: 'center', justifyContent: 'center' },
  actionTxt: { fontSize: 12, fontWeight: '700', fontFamily: 'Outfit_700Bold' },
  wrongBtn: { backgroundColor: 'rgba(239,68,68,0.10)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.22)' },
  correctBtn: { backgroundColor: 'rgba(34,197,94,0.10)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.22)' },
  resultsWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  resultPct: { fontSize: 56, fontWeight: '700', color: '#fca5a5', letterSpacing: -2, fontFamily: 'Outfit_700Bold', marginBottom: 4 },
  resultTitle: { fontSize: 14, color: 'rgba(255,255,255,0.62)', fontFamily: 'Lexend_400Regular', marginBottom: 2 },
  resultTopic: { fontSize: 11, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular', marginBottom: 24 },
  resultCounts: { flexDirection: 'row', gap: 32, marginBottom: 32 },
  resultCount: { alignItems: 'center' },
  resultNum: { fontSize: 28, fontWeight: '700', fontFamily: 'Outfit_700Bold' },
  resultLbl: { fontSize: 10, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular', textTransform: 'uppercase', letterSpacing: 0.5 },
  primaryBtn: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 16, paddingVertical: 13, paddingHorizontal: 32, marginBottom: 10, width: '100%', alignItems: 'center' },
  primaryBtnTxt: { fontSize: 13, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  ghostBtn: { paddingVertical: 12, width: '100%', alignItems: 'center' },
  ghostBtnTxt: { fontSize: 12, color: 'rgba(255,255,255,0.62)', fontFamily: 'Lexend_400Regular' },
})
