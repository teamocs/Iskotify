import { useState, useEffect, useMemo, useRef } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../../hooks/useDb'
import { upcatQuestions, upcatPassages } from '../../../db/schema'
import { useRecordSession } from '../../../hooks/useRecordSession'
import { useRecordAttempts } from '../../../hooks/useRecordAttempts'
import { loadAdmissionEstimateSnapshot, type AdmissionEstimateSnapshot } from '../../../hooks/useAdmissionEstimate'
import { estimateDeltaMessage } from '../../../utils/estimateDelta'
import { buildExam, scoreExam, SUBTESTS, type ExamQuestion, type Subtest, type RawUpcatQuestion } from '../../../utils/upcatExam'
import { prefetchSessionImages } from '../../../utils/prefetchQuestionImages'
import { createTimingState, onIdxChange, finalizeTiming, type TimingState } from '../../../utils/attemptTiming'
import { buildAttemptRows } from '../../../utils/attemptRows'
import { QuestionNavigator } from '../../../components/upcat/QuestionNavigator'
import { QuestionCard } from '../../../components/practice/QuestionCard'
import { OptionList } from '../../../components/practice/OptionList'
import { ReviewCard } from '../../../components/practice/ReviewCard'
import { ReportQuestionModal } from '../../../components/practice/ReportQuestionModal'
import { ExamReviewSheet } from '../../../components/practice/ExamReviewSheet'
import { ResultsScoreCard } from '../../../components/practice/ResultsScoreCard'
import { submitQuestionReport } from '../../../services/questionReports'
import { WebTopSpacer } from '../../../components/ui/WebTopSpacer'
import { useWebContentWidth } from '../../../components/ui/webMaxWidth'
import { useTheme } from '../../../theme/ThemeContext'
import { spacing, radius } from '../../../theme/tokens'
import { usePreventLeave } from '../../../hooks/usePreventLeave'
import { useExamRunPersistence } from '../../../hooks/useExamRunPersistence'
import { confirmAction } from '../../../utils/confirmAction'
import { runKeyFor, reorderByIds } from '../../../utils/examRunPersistence'

type Phase = 'loading' | 'resume-prompt' | 'exam' | 'results'

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
  const { saveRun, loadRun, clearRun } = useExamRunPersistence()

  const [phase, setPhase] = useState<Phase>('loading')
  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  // Question-report state: which indexes were reported + which index the modal is open for.
  const [reported, setReported] = useState<Record<number, boolean>>({})
  const [reportIdx, setReportIdx] = useState<number | null>(null)
  // Post-session Estimated Admission Score delta (only set when the student
  // was already "ready" — four subtests unlocked — both before and after).
  const [scoreDelta, setScoreDelta] = useState<string | null>(null)
  const startRef = useState(() => Date.now())[0]
  // Fix 2: last-question review sheet (never submits directly).
  const [reviewOpen, setReviewOpen] = useState(false)
  // Fix 1: leave-confirmation + resume-in-progress-run state.
  const [leaveConfirmed, setLeaveConfirmed] = useState(false)
  const savedRunRef = useRef<Awaited<ReturnType<typeof loadRun>>>(null)
  const parsedRef = useRef<RawUpcatQuestion[]>([])
  const rawPassagesRef = useRef<{ setId: string; subtest: string; passageText: string }[]>([])
  const runKey = runKeyFor('upcat', subtestParam ?? 'all', mode === 'quick' ? 'quick' : 'full')
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
  // Fix 3: "Review mistakes" scrolls the results screen down to the Review section.
  const resultsScrollRef = useRef<ScrollView>(null)
  const reviewYRef = useRef(0)
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

  /** Builds a brand-new sample from the already-fetched pool and arms the timer. */
  function buildFreshExam() {
    const targetSubtests: Subtest[] = subtestParam === 'all' ? [...SUBTESTS] : [subtestParam as Subtest]
    const built = targetSubtests.flatMap(st =>
      buildExam(parsedRef.current, rawPassagesRef.current, { subtest: st, mode: mode === 'quick' ? 'quick' : 'full' }),
    )
    setQuestions(built)
    prefetchSessionImages(built) // fire-and-forget; never blocks session start
    if (built.length) setEndTime(Date.now() + built.length * SECONDS_PER_QUESTION * 1000)
    setPhase(built.length ? 'exam' : 'results')
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
          hasVisual: !!r.hasVisual,
          imageUrl: r.imageUrl ?? null,
          imageAlt: r.imageAlt ?? null,
          imageWidth: r.imageWidth ?? null,
          imageHeight: r.imageHeight ?? null,
        }))
        const passages = pRows.map(p => ({ setId: p.setId, subtest: p.subtest, passageText: p.passageText }))
        parsedRef.current = parsed
        rawPassagesRef.current = passages

        // Fix 1: a saved in-progress run pre-empts starting a brand-new sample —
        // ask the student first (there's no separate prestart screen on this
        // route, so this doubles as one).
        const run = await loadRun(runKey)
        if (run && run.questionIds.length > 0) {
          savedRunRef.current = run
          setPhase('resume-prompt')
          return
        }

        buildFreshExam()
      } catch {
        // Unexpected failure: show results (empty) rather than hang on loading
        setPhase('results')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, subtestParam, mode])

  /** Fix 1: rebuild the exact previously-sampled question set from the saved
   *  run's question ids, restoring answers/position/timer. The absolute-
   *  timestamp countdown effect below correctly auto-submits if the whole
   *  thing already expired while the app was closed. */
  function resumeExam() {
    const run = savedRunRef.current
    if (!run) return
    const ordered = reorderByIds<RawUpcatQuestion, 'questionId'>(parsedRef.current, run.questionIds, 'questionId')
    if (ordered.length === 0) {
      void clearRun(run.runKey)
      buildFreshExam()
      return
    }
    const passageById = new Map(rawPassagesRef.current.map(p => [p.setId, p.passageText]))
    const built: ExamQuestion[] = ordered.map(q => ({ ...q, passageText: q.setId ? (passageById.get(q.setId) ?? null) : null }))
    setQuestions(built)
    setAnswers(run.answers)
    const maxIdx = built.length - 1
    setIdx(Math.min(run.idx, maxIdx))
    setEndTime(run.endTime)
    setPhase('exam')
  }

  function startOver() {
    if (savedRunRef.current) void clearRun(savedRunRef.current.runKey)
    savedRunRef.current = null
    buildFreshExam()
  }

  // Fix 1: persist answers/position/timer on every change while in progress.
  useEffect(() => {
    if (phase !== 'exam' || questions.length === 0) return
    void saveRun({
      runKey,
      kind: 'upcat',
      slug: subtestParam ?? 'all',
      mode: mode === 'quick' ? 'quick' : 'full',
      questionIds: questions.map(q => q.questionId),
      sectionNames: questions.map(q => q.subtest),
      answers,
      idx,
      sectionIdx: 0,
      floorIdx: 0,
      endTime,
      sectionEndTime: null,
      startedAt: startRef,
    }).catch(err => console.warn('[practice/upcat/[subtest]] saveRun failed:', err))
  }, [phase, runKey, subtestParam, mode, questions, answers, idx, endTime, startRef, saveRun])

  // Fix 1: leave-confirmation.
  usePreventLeave(phase === 'exam' && !leaveConfirmed, () => {
    confirmAction(
      'Leave the exam?',
      'Your progress is saved.',
      'Leave',
      () => setLeaveConfirmed(true),
      { cancelLabel: 'Stay', destructive: true },
    )
  })
  useEffect(() => {
    if (leaveConfirmed) router.back()
  }, [leaveConfirmed])

  const s = useMemo(() => makeStyles(t, typo), [t, typo])

  async function submit() {
    if (submittedRef.current) return  // guard against double-submit (timer + tap)
    submittedRef.current = true

    // Fix 1: run finished — stop offering "Resume" for a completed attempt.
    void clearRun(runKey).catch(err => console.warn('[practice/upcat/[subtest]] clearRun failed:', err))

    const scored = questions.map((q, i) => ({ subtest: q.subtest, correct: answers[i] === q.correctIndex }))
    const result = scoreExam(scored)

    // Post-session delta: snapshot the on-device estimate before this
    // session's attempts are written. Best-effort — must never block
    // reaching results, same convention as the telemetry insert below.
    let beforeEstimate: AdmissionEstimateSnapshot | null = null
    try {
      beforeEstimate = await loadAdmissionEstimateSnapshot(db)
    } catch (err) {
      console.warn('[practice/upcat/[subtest]] pre-session estimate snapshot failed:', err)
    }

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
    // Finding #2: telemetry is best-effort — it must never gate the results
    // screen. submittedRef is already flipped above; if this insert rejects
    // (disk full, storage quota, etc.) the student must still reach
    // results, not get stranded behind the double-submit guard.
    try {
      await recordAttempts(rows)
    } catch (err) {
      console.warn('[practice/upcat/[subtest]] recordAttempts failed:', err)
    }

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

    // Post-session delta: snapshot again now that this session's attempts are
    // recorded, and show the change only if the student was already ready
    // before (otherwise there is no prior estimate to compare against).
    try {
      const afterEstimate = await loadAdmissionEstimateSnapshot(db)
      setScoreDelta(estimateDeltaMessage(beforeEstimate, afterEstimate))
    } catch (err) {
      console.warn('[practice/upcat/[subtest]] post-session estimate snapshot failed:', err)
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

  if (phase === 'resume-prompt') {
    return (
      <SafeAreaView style={s.root}>
        <WebTopSpacer />
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
          <Text style={s.emptyTitle}>Resume where you left off?</Text>
          <Text style={s.emptyBody}>You have an in-progress attempt. Your answers and timer were saved.</Text>
          <Pressable accessibilityRole="button" style={s.primaryBtn} onPress={resumeExam}>
            <Text style={s.primaryBtnTxt}>Resume where you left off</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={s.ghostBtn} onPress={startOver}>
            <Text style={s.ghostTxt}>Start over</Text>
          </Pressable>
        </View>
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
          ref={resultsScrollRef}
          contentContainerStyle={[{ padding: 14, paddingBottom: 40 }, webWidth]}
          showsVerticalScrollIndicator={false}
        >
          {/* Fix 3: one neutral card regardless of score — no pass/fail colouring. */}
          <ResultsScoreCard pct={pct} correct={res.overall.correct} total={res.overall.total} />

          {scoreDelta ? (
            <View style={s.deltaCard}>
              <Text style={s.deltaText}>{scoreDelta}</Text>
            </View>
          ) : null}

          <Text style={s.sectionLbl}>Per-subtest</Text>
          {Object.entries(res.bySubtest).map(([st, b]) => (
            <View key={st} style={s.subtestRow}>
              <Text style={s.subtestName}>{st}</Text>
              <Text style={s.subtestScore}>
                {b.correct}/{b.total} · {Math.round((b.correct / b.total) * 100)}%
              </Text>
            </View>
          ))}

          <View onLayout={e => { reviewYRef.current = e.nativeEvent.layout.y }}>
            <Text style={s.sectionLbl}>Review</Text>
          </View>
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
              imageUrl={q.imageUrl}
              imageAlt={q.imageAlt}
              imageWidth={q.imageWidth}
              imageHeight={q.imageHeight}
            />
          ))}

          {/* Fix 3: "Review mistakes" is the primary action, "Retake" is secondary. */}
          <Pressable
            accessibilityRole="button"
            style={s.primaryBtn}
            onPress={() => resultsScrollRef.current?.scrollTo({ y: reviewYRef.current, animated: true })}
          >
            <Text style={s.primaryBtnTxt}>Review mistakes</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={s.ghostBtn}
            onPress={() => router.replace(`/practice/upcat/${subtestParam}?mode=${mode}`)}
          >
            <Text style={s.ghostTxt}>Retake exam</Text>
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
        <Pressable accessibilityRole="button" accessibilityLabel="Leave exam" onPress={() => router.back()} hitSlop={10}>
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
          imageUrl={q.imageUrl}
          imageAlt={q.imageAlt}
          imageWidth={q.imageWidth}
          imageHeight={q.imageHeight}
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
        {isLast ? (
          // Fix 2: the last question never submits directly anymore.
          <Pressable accessibilityRole="button" style={s.footBtnPrimary} onPress={() => setReviewOpen(true)}>
            <Text style={s.footPrimaryTxt}>Review & submit</Text>
          </Pressable>
        ) : (
          <>
            <Pressable accessibilityRole="button" style={s.footBtnGhost} onPress={() => setIdx(i => i + 1)}>
              <Text style={s.footGhostTxt}>Skip</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[s.footBtnPrimary, sel === undefined && s.footDisabled]}
              disabled={sel === undefined}
              onPress={() => setIdx(i => i + 1)}
            >
              <Text style={s.footPrimaryTxt}>Next</Text>
            </Pressable>
          </>
        )}
      </View>

      <ExamReviewSheet
        visible={reviewOpen}
        total={questions.length}
        currentIdx={idx}
        answeredIdxs={answeredIdxs}
        flaggedIdxs={new Set(Object.keys(reported).map(Number))}
        onJump={setIdx}
        onClose={() => setReviewOpen(false)}
        onSubmit={() => { setReviewOpen(false); void submit() }}
      />

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
    emptyTitle: { fontSize: typo.xl, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 4, textAlign: 'center' },
    emptyBody: { fontSize: typo.md, color: t.textSecondary, fontFamily: 'Lexend_400Regular', textAlign: 'center', lineHeight: 22, marginBottom: 12 },
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
    deltaCard: {
      backgroundColor: t.accentSurface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 12,
      borderCurve: 'continuous',
      padding: spacing.md,
      marginBottom: 18,
      alignItems: 'center',
    },
    deltaText: {
      fontSize: typo.sm,
      fontWeight: '600',
      color: t.accentText,
      fontFamily: 'Lexend_600SemiBold',
      textAlign: 'center',
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
