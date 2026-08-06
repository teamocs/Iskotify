import { useState, useEffect, useMemo, useRef } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../../hooks/useDb'
import { upcatQuestions, upcatPassages } from '../../../db/schema'
import { useRecordSession } from '../../../hooks/useRecordSession'
import { useRecordAttempts } from '../../../hooks/useRecordAttempts'
import { buildExam, scoreExam, SUBTESTS, type ExamQuestion, type Subtest } from '../../../utils/upcatExam'
import { createTimingState, onIdxChange, finalizeTiming, type TimingState } from '../../../utils/attemptTiming'
import { buildAttemptRows } from '../../../utils/attemptRows'
import { QuestionNavigator } from '../../../components/upcat/QuestionNavigator'
import { QuestionCard } from '../../../components/practice/QuestionCard'
import { OptionList } from '../../../components/practice/OptionList'
import { ReviewCard } from '../../../components/practice/ReviewCard'
import { ReportQuestionModal } from '../../../components/practice/ReportQuestionModal'
import { submitQuestionReport } from '../../../services/questionReports'
import { WebTopSpacer } from '../../../components/ui/WebTopSpacer'
import { useWebContentWidth } from '../../../components/ui/webMaxWidth'
import { useTheme } from '../../../theme/ThemeContext'
import { spacing, radius } from '../../../theme/tokens'

type Phase = 'loading' | 'exam' | 'results'

function fmtTime(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const sec = totalSecs % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export default function UpcatExam() {
  const { subtest: subtestParam, mode } = useLocalSearchParams<{ subtest: string; mode?: 'quick' | 'full' }>()
  const db = useDb()
  const { theme: t, typo } = useTheme()
  const { recordSession } = useRecordSession()
  const { recordAttempts } = useRecordAttempts()

  const [phase, setPhase] = useState<Phase>('loading')
  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  // Question-report state: which indexes were reported + which index the modal is open for.
  const [reported, setReported] = useState<Record<number, boolean>>({})
  const [reportIdx, setReportIdx] = useState<number | null>(null)
  const startRef = useState(() => Date.now())[0]
  // Countdown timer (UPCAT pace ≈ 60s/question). Auto-submits at zero. endTime is
  // an absolute timestamp so the clock stays accurate even if the interval drifts.
  const SECONDS_PER_QUESTION = 60
  const [endTime, setEndTime] = useState<number | null>(null)
  const [remaining, setRemaining] = useState(0)
  const submittedRef = useRef(false)
  const submitRef = useRef<() => void>(() => {})
  // Question pane (middle scroll zone) — reset to top whenever the question changes
  // so scroll offset never carries over between questions.
  const qPaneRef = useRef<ScrollView>(null)
  const { height: winH } = useWindowDimensions()
  // Web-only max-width centering for the vertical scroll zones (null on native/sm).
  const webWidth = useWebContentWidth()

  useEffect(() => {
    qPaneRef.current?.scrollTo({ y: 0, animated: false })
  }, [idx])

  // Per-question timing (Task D) — see app/practice/exam/[slug].tsx for the
  // same pattern: starts once questions load (phase becomes 'exam'), then
  // accumulates elapsed ms per index as idx changes.
  const timingRef = useRef<TimingState | null>(null)
  useEffect(() => {
    if (phase === 'exam' && timingRef.current === null) {
      timingRef.current = createTimingState(idx, Date.now())
    }
  }, [phase, idx])
  useEffect(() => {
    if (timingRef.current) {
      timingRef.current = onIdxChange(timingRef.current, idx, Date.now())
    }
  }, [idx])

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
          db.select().from(upcatQuestions).where(eq(upcatQuestions.status, 'published')),
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
          topic: r.topic ?? null,
          optionExplanations: parseOptions(r.optionExplanations) as (string | null)[],
          strategyTip: r.strategyTip ?? null,
        }))
        const passages = pRows.map(p => ({ setId: p.setId, subtest: p.subtest, passageText: p.passageText }))
        const targetSubtests: Subtest[] = subtestParam === 'all' ? [...SUBTESTS] : [subtestParam as Subtest]
        const built = targetSubtests.flatMap(st =>
          buildExam(parsed, passages, { subtest: st, mode: mode === 'quick' ? 'quick' : 'full' }),
        )
        setQuestions(built)
        if (built.length) setEndTime(Date.now() + built.length * SECONDS_PER_QUESTION * 1000)
        setPhase(built.length ? 'exam' : 'results')
      } catch {
        // Unexpected failure: show results (empty) rather than hang on loading
        setPhase('results')
      }
    })()
  }, [db, subtestParam, mode])

  const s = useMemo(() => makeStyles(t, typo), [t, typo])

  async function submit() {
    if (submittedRef.current) return  // guard against double-submit (timer + tap)
    submittedRef.current = true
    const scored = questions.map((q, i) => ({ subtest: q.subtest, correct: answers[i] === q.correctIndex }))
    const result = scoreExam(scored)

    // Task D: per-question attempt rows, written before recordSession so
    // they're committed before recordSession's fire-and-forget backup push.
    const elapsedByIdx = timingRef.current ? finalizeTiming(timingRef.current, Date.now()) : {}
    const rows = buildAttemptRows({
      sessionKey: startRef,
      sourceTable: 'upcat_questions',
      listingSlug: 'upcat',
      questions: questions.map(q => ({
        questionId: q.questionId,
        correctIndex: q.correctIndex,
        subtest: q.subtest,
        topic: q.topic ?? null,
      })),
      answers,
      elapsedByIdx,
    })
    await recordAttempts(rows)

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
  submitRef.current = submit  // keep the timer's auto-submit pointed at the latest closure

  // Countdown tick — recomputed from the absolute endTime each second so it stays
  // accurate; auto-submits when it reaches zero.
  useEffect(() => {
    if (phase !== 'exam' || endTime == null) return
    const tick = () => {
      const rem = Math.max(0, Math.round((endTime - Date.now()) / 1000))
      setRemaining(rem)
      if (rem <= 0) submitRef.current()
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [phase, endTime])

  if (phase === 'loading') {
    return (
      <SafeAreaView style={s.root}>
        <WebTopSpacer />
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
        <WebTopSpacer />
        <ScrollView
          contentContainerStyle={[{ padding: 14, paddingBottom: 40 }, webWidth]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[s.scoreCard, pct >= 60 ? s.pass : s.fail]}>
            <Text style={[s.scorePct, { color: pct >= 60 ? t.success : t.accentText }]}>{pct}%</Text>
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
          {questions.map((q, i) => (
            <ReviewCard
              key={q.questionId}
              index={i + 1}
              questionText={q.questionText}
              options={q.options}
              correctIndex={q.correctIndex}
              selectedIndex={answers[i]}
              explanation={q.explanation}
              optionExplanations={q.optionExplanations}
              strategyTip={q.strategyTip}
            />
          ))}

          <Pressable
            accessibilityRole="button"
            style={s.primaryBtn}
            onPress={() => router.replace(`/practice/upcat/${subtestParam}?mode=${mode}`)}
          >
            <Text style={s.primaryBtnTxt}>Retake exam</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={s.ghostBtn} onPress={() => router.replace('/practice/upcat')}>
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
      <WebTopSpacer />
      <View style={s.topBar}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10}>
          <Text style={s.back}>‹</Text>
        </Pressable>
        <Text style={s.topTitle} numberOfLines={1}>
          {subtestParam === 'all' ? 'Full Mock' : subtestParam}
        </Text>
        <View style={[s.timerPill, remaining <= 60 && s.timerPillLow]}>
          <Text style={[s.timerTxt, remaining <= 60 && s.timerTxtLow]}>⏱ {fmtTime(remaining)}</Text>
        </View>
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

      {/* Middle pane: passage + question text scroll; options live in their own fixed
          zone below so they never jump as question/passage length changes. */}
      <ScrollView
        ref={qPaneRef}
        style={{ flex: 1 }}
        contentContainerStyle={[{ paddingBottom: spacing.lg }, webWidth]}
        showsVerticalScrollIndicator={false}
      >
        <QuestionCard
          questionText={q.questionText}
          passageText={q.passageText}
          reported={reported[idx]}
          onReport={() => setReportIdx(idx)}
        />
      </ScrollView>

      {/* Fixed options zone: capped at 42% of the window so the question pane keeps
          the majority of the viewport; very long option lists scroll inside this zone. */}
      <ScrollView style={{ flexGrow: 0, maxHeight: winH * 0.42, marginTop: spacing.sm, marginBottom: spacing.sm }} contentContainerStyle={webWidth ?? undefined} showsVerticalScrollIndicator={false}>
        <OptionList options={q.options} selectedIndex={sel} onSelect={oi => setAnswers(a => ({ ...a, [idx]: oi }))} />
      </ScrollView>

      <View style={s.footer}>
        <Pressable
          accessibilityRole="button"
          style={s.footBtnGhost}
          onPress={() => setIdx(i => Math.max(0, i - 1))}
          disabled={idx === 0}
        >
          <Text style={[s.footGhostTxt, idx === 0 && { opacity: 0.3 }]}>Back</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={s.footBtnGhost}
          onPress={() => (isLast ? submit() : setIdx(i => i + 1))}
        >
          <Text style={s.footGhostTxt}>{isLast ? 'Review' : 'Skip'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={[s.footBtnPrimary, sel === undefined && s.footDisabled]}
          disabled={sel === undefined}
          onPress={() => (isLast ? submit() : setIdx(i => i + 1))}
        >
          <Text style={s.footPrimaryTxt}>{isLast ? 'Submit' : 'Next'}</Text>
        </Pressable>
      </View>

      <ReportQuestionModal
        visible={reportIdx !== null}
        onClose={() => setReportIdx(null)}
        onSubmit={(reason) => {
          const qi = reportIdx
          if (qi == null) return
          const rq = questions[qi]
          if (rq) {
            // UPCAT practice questions come from upcat_questions; offline-first, never throws.
            void submitQuestionReport(db, {
              questionId: rq.questionId,
              sourceTable: 'upcat_questions',
              questionText: rq.questionText,
              reason,
            })
            setReported(r => ({ ...r, [qi]: true }))
          }
          setReportIdx(null)
        }}
      />
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
    timerPill: {
      backgroundColor: t.surface2,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    timerPillLow: { backgroundColor: t.dangerSurface, borderColor: 'rgba(239,68,68,0.35)' },
    timerTxt: {
      fontSize: typo.xs,
      fontWeight: '700',
      color: t.textSecondary,
      fontFamily: 'Outfit_700Bold',
      fontVariant: ['tabular-nums'],
    },
    timerTxtLow: { color: t.danger },
    footer: {
      flexDirection: 'row',
      gap: spacing.sm,
      padding: 14,
      backgroundColor: t.bg,
      borderTopWidth: 1,
      borderColor: t.border,
    },
    footBtnGhost: {
      paddingVertical: 13,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      borderCurve: 'continuous',
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
      borderRadius: radius.md,
      borderCurve: 'continuous',
      backgroundColor: 'rgba(128,0,0,0.85)',
      alignItems: 'center',
    },
    footDisabled: { opacity: 0.4 },
    footPrimaryTxt: {
      fontSize: typo.md,
      fontWeight: '700',
      color: t.textInverse,
      fontFamily: 'Outfit_700Bold',
    },
    scoreCard: {
      borderRadius: 24,
      borderCurve: 'continuous',
      padding: 22,
      marginBottom: 18,
      borderWidth: 1,
      alignItems: 'center',
    },
    pass: {
      backgroundColor: t.successSurface,
      borderColor: 'rgba(34,197,94,0.25)',
    },
    fail: {
      backgroundColor: t.dangerSurface,
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
      borderCurve: 'continuous',
      padding: spacing.md,
      marginBottom: 6,
    },
    subtestName: { fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_600SemiBold' },
    subtestScore: {
      fontSize: typo.sm,
      color: t.textSecondary,
      fontFamily: 'Lexend_600SemiBold',
    },
    primaryBtn: {
      backgroundColor: 'rgba(128,0,0,0.85)',
      borderRadius: 16,
      borderCurve: 'continuous',
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    primaryBtnTxt: {
      color: t.textInverse,
      fontWeight: '700',
      fontSize: typo.md,
      fontFamily: 'Outfit_700Bold',
    },
    ghostBtn: { paddingVertical: 12, alignItems: 'center' },
    ghostTxt: { color: t.textTertiary, fontSize: typo.sm, fontFamily: 'Lexend_400Regular' },
  })
}
