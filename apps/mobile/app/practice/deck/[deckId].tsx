import { useState, useEffect } from 'react'
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { inArray, eq } from 'drizzle-orm'
import { useDb } from '../../../hooks/useDb'
import { savedDecks as savedDecksTable, flashcards as flashcardsTable, topics, userProgress } from '../../../db/schema'
import { parseTopicIds } from '../../../hooks/useSavedDecks'

interface Card { id: string; question: string; answer: string; explanation: string; difficulty: number }
interface Result { flashcardId: string; correct: boolean }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i] as T
    a[i] = a[j] as T
    a[j] = tmp
  }
  return a
}

const DIFF: Record<number, { label: string; color: string; bg: string; border: string }> = {
  1: { label: 'Easy',   color: '#4ade80', bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.22)'  },
  2: { label: 'Medium', color: '#fbbf24', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.22)' },
  3: { label: 'Hard',   color: '#f87171', bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.22)'  },
}

export default function DeckFlashcardScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>()
  const db = useDb()

  const [deckName, setDeckName] = useState('')
  const [cards, setCards] = useState<Card[]>([])
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [results, setResults] = useState<Result[]>([])
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const deckRows = await db.select().from(savedDecksTable).where(eq(savedDecksTable.id, deckId)).limit(1)
      const deck = deckRows[0]
      if (!deck) { setLoading(false); return }

      setDeckName(deck.name)
      const topicIds = parseTopicIds(deck.topicIds)
      if (topicIds.length === 0) { setLoading(false); return }

      const cardRows = await db
        .select({
          id: flashcardsTable.id,
          question: flashcardsTable.question,
          answer: flashcardsTable.answer,
          explanation: flashcardsTable.explanation,
          difficulty: flashcardsTable.difficulty,
        })
        .from(flashcardsTable)
        .where(inArray(flashcardsTable.topicId, topicIds))

      setCards(shuffle(cardRows))
      setLoading(false)
    }
    void load()
  }, [db, deckId])

  function handleAnswer(correct: boolean) {
    const card = cards[idx]
    const newResults = [...results, { flashcardId: card.id, correct }]
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
  }

  function handlePracticeAgain() {
    setCards(c => shuffle(c))
    setIdx(0)
    setFlipped(false)
    setResults([])
    setDone(false)
  }

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <Text style={s.loading}>Loading deck…</Text>
      </SafeAreaView>
    )
  }

  if (cards.length === 0) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.emptyWrap}>
          <Text style={s.emptyTitle}>No cards in this deck</Text>
          <Text style={s.emptySub}>The topics in this deck have no flashcards yet.</Text>
          <TouchableOpacity style={s.ghostBtn} onPress={() => router.back()}>
            <Text style={s.ghostBtnTxt}>← Back</Text>
          </TouchableOpacity>
        </View>
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
          <Text style={s.resultDeck}>{deckName}</Text>
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
            <Text style={s.ghostBtnTxt}>Back to Decks</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  const card = cards[idx]!
  const diff = DIFF[card.difficulty] ?? DIFF[2]

  return (
    <SafeAreaView style={s.root}>

      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.topicTitle} numberOfLines={1}>{deckName}</Text>
          <Text style={s.deckLabel}>Saved Deck · {cards.length} cards</Text>
        </View>
        <Text style={s.counter}>{idx + 1} / {cards.length}</Text>
      </View>

      {/* Progress bar */}
      <View style={s.progBg}>
        <View style={[s.progFill, { width: `${((idx + 1) / cards.length) * 100}%` as any }]} />
      </View>

      {/* Card */}
      <TouchableOpacity
        style={s.card}
        onPress={() => { if (!flipped) setFlipped(true) }}
        activeOpacity={flipped ? 1 : 0.8}
      >
        <Text style={s.cardLabel}>{flipped ? 'ANSWER' : 'QUESTION'}</Text>
        <Text style={s.cardText}>{flipped ? card.answer : card.question}</Text>
        {flipped && card.explanation ? (
          <Text style={s.cardExpl}>{card.explanation}</Text>
        ) : null}
        {!flipped ? <Text style={s.tapHint}>Tap to reveal answer</Text> : null}
      </TouchableOpacity>

      {/* Difficulty chip */}
      <View style={s.diffRow}>
        <View style={[s.diffChip, { backgroundColor: diff.bg, borderColor: diff.border }]}>
          <Text style={[s.diffText, { color: diff.color }]}>{diff.label} difficulty</Text>
        </View>
      </View>

      {/* Correct / Wrong — only after flip */}
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
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold', marginBottom: 6 },
  emptySub: { fontSize: 11, color: 'rgba(255,255,255,0.45)', textAlign: 'center', fontFamily: 'Lexend_400Regular', marginBottom: 24 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, gap: 8 },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backArrow: { color: 'rgba(255,255,255,0.62)', fontSize: 26, lineHeight: 30 },
  topicTitle: { fontSize: 13, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  deckLabel: { fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: 'Lexend_400Regular', marginTop: 1 },
  counter: { fontSize: 10, color: 'rgba(255,255,255,0.38)', fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  progBg: { marginHorizontal: 14, height: 3, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 99, marginBottom: 12 },
  progFill: { height: 3, backgroundColor: '#800000', borderRadius: 99 },
  card: { marginHorizontal: 14, marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 22, padding: 22, minHeight: 200, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { fontSize: 8.5, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', marginBottom: 10, fontFamily: 'Lexend_600SemiBold', fontWeight: '600' },
  cardText: { fontSize: 15, fontWeight: '600', color: '#fff', textAlign: 'center', lineHeight: 22, fontFamily: 'Outfit_600SemiBold' },
  cardExpl: { fontSize: 11, color: 'rgba(255,255,255,0.60)', textAlign: 'center', marginTop: 10, lineHeight: 16, fontFamily: 'Lexend_400Regular' },
  tapHint: { fontSize: 10, color: 'rgba(255,255,255,0.38)', marginTop: 14, fontFamily: 'Lexend_400Regular' },
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
  resultTitle: { fontSize: 14, color: 'rgba(255,255,255,0.62)', fontFamily: 'Lexend_400Regular', marginBottom: 4 },
  resultDeck: { fontSize: 11, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular', marginBottom: 24 },
  resultCounts: { flexDirection: 'row', gap: 32, marginBottom: 32 },
  resultCount: { alignItems: 'center' },
  resultNum: { fontSize: 28, fontWeight: '700', fontFamily: 'Outfit_700Bold' },
  resultLbl: { fontSize: 10, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular', textTransform: 'uppercase', letterSpacing: 0.5 },
  primaryBtn: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 16, paddingVertical: 13, paddingHorizontal: 32, marginBottom: 10, width: '100%', alignItems: 'center' },
  primaryBtnTxt: { fontSize: 13, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  ghostBtn: { paddingVertical: 12, width: '100%', alignItems: 'center' },
  ghostBtnTxt: { fontSize: 12, color: 'rgba(255,255,255,0.62)', fontFamily: 'Lexend_400Regular' },
})
