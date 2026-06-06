import { useState, useEffect, useMemo } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { useDb } from '../../../hooks/useDb'
import { upcatQuestions, upcatPassages } from '../../../db/schema'
import { useRecordSession } from '../../../hooks/useRecordSession'
import { buildExam, scoreExam, SUBTESTS, type ExamQuestion, type Subtest } from '../../../utils/upcatExam'
import { PassagePanel } from '../../../components/upcat/PassagePanel'
import { QuestionNavigator } from '../../../components/upcat/QuestionNavigator'
import { useTheme } from '../../../theme/ThemeContext'

const LETTERS = ['A', 'B', 'C', 'D'] as const
type Phase = 'loading' | 'exam' | 'results'

export default function UpcatExam() {
  const { subtest: subtestParam, mode } = useLocalSearchParams<{ subtest: string; mode?: 'quick' | 'full' }>()
  const db = useDb()
  const { theme: t, typo } = useTheme()
  const { recordSession } = useRecordSession()

  const [phase, setPhase] = useState<Phase>('loading')
  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const startRef = useState(() => Date.now())[0]

  function parseOptions(raw: string | null | undefined): string[] {
    try {
      const v = JSON.parse(raw ?? '[]')
      return Array.isArray(v) ? (v as string[]) : []
    } catch {
      return []
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const [qRows, pRows] = await Promise.all([
          db.select().from(upcatQuestions),
          db.select().from(upcatPassages),
        ])
        const parsed = qRows.map(r => ({
          questionId: r.questionId,
          subtest: r.subtest,
          questionText: r.questionText,
          options: parseOptions(r.options),
          correctIndex: r.correctIndex,
          explanation: r.explanation,
          setId: r.setId,
          setPosition: r.setPosition,
        }))
        const passages = pRows.map(p => ({ setId: p.setId, subtest: p.subtest, passageText: p.passageText }))
        const targetSubtests: Subtest[] = subtestParam === 'all' ? [...SUBTESTS] : [subtestParam as Subtest]
        const built = targetSubtests.flatMap(st =>
          buildExam(parsed, passages, { subtest: st, mode: mode === 'quick' ? 'quick' : 'full' }),
        )
        setQuestions(built)
        setPhase(built.length ? 'exam' : 'results')
      } catch {
        // Unexpected failure: show results (empty) rather than hang on loading
        setPhase('results')
      }
    })()
  }, [db, subtestParam, mode])

  const s = useMemo(() => makeStyles(t, typo), [t, typo])

  function submit() {
    const scored = questions.map((q, i) => ({ subtest: q.subtest, correct: answers[i] === q.correctIndex }))
    const result = scoreExam(scored)
    for (const st of Object.keys(result.bySubtest)) {
      const b = result.bySubtest[st]!
      void recordSession({
        listingSlug: 'upcat',
        topicId: '',
        deckId: '',
        score: b.correct,
        total: b.total,
        startTime: startRef,
        subtest: st,
      })
    }
    setPhase('results')
  }

  if (phase === 'loading') {
    return (
      <SafeAreaView style={s.root}>
        <Text style={s.loading}>Loading exam…</Text>
      </SafeAreaView>
    )
  }

  if (phase === 'results') {
    const scored = questions.map((q, i) => ({ subtest: q.subtest, correct: answers[i] === q.correctIndex }))
    const res = scoreExam(scored)
    const pct = res.overall.total ? Math.round((res.overall.correct / res.overall.total) * 100) : 0
    return (
      <SafeAreaView style={s.root}>
        <ScrollView
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={[s.scoreCard, pct >= 60 ? s.pass : s.fail]}>
            <Text style={[s.scorePct, { color: pct >= 60 ? '#16a34a' : t.accentText }]}>{pct}%</Text>
            <Text style={s.scoreVerdict}>{pct >= 60 ? '🎉 Great work' : '📚 Keep practicing'}</Text>
            <Text style={s.scoreSub}>
              {res.overall.correct}/{res.overall.total} correct
            </Text>
          </View>

          <Text style={s.sectionLbl}>Per-subtest</Text>
          {Object.entries(res.bySubtest).map(([st, b]) => (
            <View key={st} style={s.subtestRow}>
              <Text style={s.subtestName}>{st}</Text>
              <Text style={s.subtestScore}>
                {b.correct}/{b.total} · {Math.round((b.correct / b.total) * 100)}%
              </Text>
            </View>
          ))}

          <Text style={s.sectionLbl}>Review</Text>
          {questions.map((q, i) => {
            const sel = answers[i]
            const ok = sel === q.correctIndex
            return (
              <View key={q.questionId} style={[s.reviewCard, ok ? s.reviewOk : s.reviewBad]}>
                <Text style={s.reviewQ}>
                  Q{i + 1}. {q.questionText}
                </Text>
                {q.options.map((o, oi) => (
                  <Text
                    key={oi}
                    style={[
                      s.reviewOpt,
                      oi === q.correctIndex && { color: '#16a34a', fontWeight: '700' },
                      oi === sel && oi !== q.correctIndex && { color: '#dc2626' },
                    ]}
                  >
                    {LETTERS[oi]}. {o}
                    {oi === q.correctIndex ? '  ✓' : oi === sel ? '  ✗' : ''}
                  </Text>
                ))}
                {q.explanation ? <Text style={s.reviewExp}>💡 {q.explanation}</Text> : null}
              </View>
            )
          })}

          <Pressable
            style={s.primaryBtn}
            onPress={() => router.replace(`/practice/upcat/${subtestParam}?mode=${mode}`)}
          >
            <Text style={s.primaryBtnTxt}>Retake exam</Text>
          </Pressable>
          <Pressable style={s.ghostBtn} onPress={() => router.replace('/practice/upcat')}>
            <Text style={s.ghostTxt}>← Back to exams</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    )
  }

  const q = questions[idx]!
  const sel = answers[idx]
  const answeredIdxs = new Set(Object.keys(answers).map(Number))
  const isLast = idx === questions.length - 1

  return (
    <SafeAreaView style={s.root}>
      <View style={s.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={s.back}>‹</Text>
        </Pressable>
        <Text style={s.topTitle} numberOfLines={1}>
          {subtestParam === 'all' ? 'Full Mock' : subtestParam}
        </Text>
        <Text style={s.counter}>
          {idx + 1}/{questions.length}
        </Text>
      </View>

      <QuestionNavigator
        total={questions.length}
        currentIdx={idx}
        answeredIdxs={answeredIdxs}
        onJump={setIdx}
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {q.passageText ? <PassagePanel passage={q.passageText} /> : null}
        <View style={s.qCard}>
          <Text style={s.qText}>{q.questionText}</Text>
        </View>
        <View style={s.opts}>
          {q.options.map((o, oi) => (
            <Pressable
              key={oi}
              style={[s.opt, sel === oi && s.optOn]}
              onPress={() => setAnswers(a => ({ ...a, [idx]: oi }))}
            >
              <View style={[s.optLetter, sel === oi && s.optLetterOn]}>
                <Text style={[s.optLetterTxt, sel === oi && { color: '#fff' }]}>{LETTERS[oi]}</Text>
              </View>
              <Text style={s.optTxt}>{o}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={s.footer}>
        <Pressable
          style={s.footBtnGhost}
          onPress={() => setIdx(i => Math.max(0, i - 1))}
          disabled={idx === 0}
        >
          <Text style={[s.footGhostTxt, idx === 0 && { opacity: 0.3 }]}>Back</Text>
        </Pressable>
        <Pressable
          style={s.footBtnGhost}
          onPress={() => (isLast ? submit() : setIdx(i => i + 1))}
        >
          <Text style={s.footGhostTxt}>{isLast ? 'Review' : 'Skip'}</Text>
        </Pressable>
        <Pressable
          style={[s.footBtnPrimary, sel === undefined && s.footDisabled]}
          disabled={sel === undefined}
          onPress={() => (isLast ? submit() : setIdx(i => i + 1))}
        >
          <Text style={s.footPrimaryTxt}>{isLast ? 'Submit' : 'Next'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

function makeStyles(t: ReturnType<typeof import('../../../theme/ThemeContext').useTheme>['theme'], typo: ReturnType<typeof import('../../../theme/ThemeContext').useTheme>['typo']) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    loading: {
      color: t.textTertiary,
      textAlign: 'center',
      marginTop: 80,
      fontFamily: 'Lexend_400Regular',
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 8,
      gap: 8,
    },
    back: { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
    topTitle: {
      flex: 1,
      fontSize: typo.md,
      fontWeight: '700',
      color: t.textPrimary,
      fontFamily: 'Outfit_700Bold',
    },
    counter: {
      fontSize: typo.sm,
      fontWeight: '700',
      color: t.accentText,
      fontFamily: 'Lexend_600SemiBold',
    },
    qCard: {
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 20,
      padding: 18,
      marginHorizontal: 14,
      marginBottom: 12,
    },
    qText: {
      fontSize: typo.lg,
      fontWeight: '600',
      color: t.textPrimary,
      lineHeight: 24,
      fontFamily: 'Outfit_600SemiBold',
    },
    opts: { gap: 9, paddingHorizontal: 14 },
    opt: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: t.surface,
      borderWidth: 1.5,
      borderColor: t.border,
      borderRadius: 16,
      paddingVertical: 13,
      paddingHorizontal: 13,
    },
    optOn: { backgroundColor: t.accentSurface, borderColor: t.accent },
    optLetter: {
      width: 30,
      height: 30,
      borderRadius: 9,
      backgroundColor: t.surface2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optLetterOn: { backgroundColor: t.accent },
    optLetterTxt: {
      fontSize: typo.sm,
      fontWeight: '700',
      color: t.textSecondary,
      fontFamily: 'Outfit_700Bold',
    },
    optTxt: {
      flex: 1,
      fontSize: typo.md,
      color: t.textPrimary,
      fontFamily: 'Lexend_400Regular',
      lineHeight: 19,
    },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      gap: 8,
      padding: 14,
      backgroundColor: t.bg,
      borderTopWidth: 1,
      borderColor: t.border,
    },
    footBtnGhost: {
      paddingVertical: 13,
      paddingHorizontal: 16,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.border,
    },
    footGhostTxt: {
      fontSize: typo.sm,
      fontWeight: '600',
      color: t.textSecondary,
      fontFamily: 'Lexend_600SemiBold',
    },
    footBtnPrimary: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: 14,
      backgroundColor: 'rgba(128,0,0,0.85)',
      alignItems: 'center',
    },
    footDisabled: { opacity: 0.4 },
    footPrimaryTxt: {
      fontSize: typo.md,
      fontWeight: '700',
      color: '#fff',
      fontFamily: 'Outfit_700Bold',
    },
    scoreCard: {
      borderRadius: 24,
      padding: 22,
      marginBottom: 18,
      borderWidth: 1,
      alignItems: 'center',
    },
    pass: {
      backgroundColor: 'rgba(34,197,94,0.08)',
      borderColor: 'rgba(34,197,94,0.25)',
    },
    fail: {
      backgroundColor: 'rgba(239,68,68,0.07)',
      borderColor: 'rgba(239,68,68,0.20)',
    },
    scorePct: { fontSize: 52, fontWeight: '700', fontFamily: 'Outfit_700Bold' },
    scoreVerdict: {
      fontSize: typo.lg,
      fontWeight: '700',
      color: t.textPrimary,
      fontFamily: 'Outfit_700Bold',
    },
    scoreSub: {
      fontSize: typo.sm,
      color: t.textTertiary,
      marginTop: 2,
      fontFamily: 'Lexend_400Regular',
    },
    sectionLbl: {
      fontSize: typo.sm,
      fontWeight: '700',
      color: t.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 8,
      marginTop: 8,
      fontFamily: 'Lexend_600SemiBold',
    },
    subtestRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: t.surface2,
      borderWidth: 1,
      borderColor: t.divider,
      borderRadius: 12,
      padding: 12,
      marginBottom: 6,
    },
    subtestName: { fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_600SemiBold' },
    subtestScore: {
      fontSize: typo.sm,
      color: t.textSecondary,
      fontFamily: 'Lexend_600SemiBold',
    },
    reviewCard: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 10 },
    reviewOk: {
      backgroundColor: 'rgba(34,197,94,0.06)',
      borderColor: 'rgba(34,197,94,0.18)',
    },
    reviewBad: {
      backgroundColor: 'rgba(239,68,68,0.06)',
      borderColor: 'rgba(239,68,68,0.18)',
    },
    reviewQ: {
      fontSize: typo.md,
      fontWeight: '600',
      color: t.textPrimary,
      marginBottom: 8,
      fontFamily: 'Outfit_600SemiBold',
    },
    reviewOpt: {
      fontSize: typo.sm,
      color: t.textSecondary,
      lineHeight: 20,
      fontFamily: 'Lexend_400Regular',
    },
    reviewExp: {
      fontSize: typo.xs,
      color: t.textTertiary,
      marginTop: 8,
      lineHeight: 17,
      fontFamily: 'Lexend_400Regular',
    },
    primaryBtn: {
      backgroundColor: 'rgba(128,0,0,0.85)',
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 8,
    },
    primaryBtnTxt: {
      color: '#fff',
      fontWeight: '700',
      fontSize: typo.md,
      fontFamily: 'Outfit_700Bold',
    },
    ghostBtn: { paddingVertical: 12, alignItems: 'center' },
    ghostTxt: { color: t.textTertiary, fontSize: typo.sm, fontFamily: 'Lexend_400Regular' },
  })
}
