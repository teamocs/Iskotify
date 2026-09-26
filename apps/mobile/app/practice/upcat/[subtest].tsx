import { useState, useEffect, useRef } from 'react'
import { View, Text, ScrollView } from 'react-native'
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
import { QuestionCard } from '../../../components/practice/QuestionCard'
import { OptionList } from '../../../components/practice/OptionList'
import { ReportQuestionModal } from '../../../components/practice/ReportQuestionModal'
import { ExamReviewSheet } from '../../../components/practice/ExamReviewSheet'
import { ResultsScoreCard } from '../../../components/practice/ResultsScoreCard'
import { ExamFocusHeader } from '../../../components/practice/ExamFocusHeader'
import { QuestionNavPanel } from '../../../components/practice/QuestionNavPanel'
import { SessionLoading, SessionEmpty } from '../../../components/practice/SessionStates'
import { RunnerFrame } from '../../../components/practice/runner/RunnerFrame'
import { RunnerActions } from '../../../components/practice/runner/RunnerActions'
import { RunnerReview } from '../../../components/practice/runner/RunnerReview'
import { submitQuestionReport } from '../../../services/questionReports'
import { Screen } from '../../../components/ui/Screen'
import { PageTitle } from '../../../components/ui/PageTitle'
import { Button } from '../../../components/ui/Button'
import { SectionHeader } from '../../../components/ui/SectionHeader'
import { ProgressBar } from '../../../components/ui/ProgressBar'
import { DetailTopBar } from '../../../components/explore/DetailTopBar'
import { useTheme } from '../../../theme/ThemeContext'
import { spacing, radius, textStyle } from '../../../theme/tokens'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import { usePreventLeave } from '../../../hooks/usePreventLeave'
import { useBeforeUnloadWarning } from '../../../hooks/useBeforeUnloadWarning'
import { useExamRunPersistence } from '../../../hooks/useExamRunPersistence'
import { confirmAction } from '../../../utils/confirmAction'
import { runKeyFor, reorderByIds, remapIndexedById, remapSingleIndex } from '../../../utils/examRunPersistence'

type Phase = 'loading' | 'resume-prompt' | 'exam' | 'results'

export default function UpcatExam() {
  const { subtest: subtestParam, mode } = useLocalSearchParams<{ subtest: string; mode?: 'quick' | 'full' }>()
  const db = useDb()
  const { theme: t } = useTheme()
  // Redesign M3: the question navigator is a side panel on expanded widths and
  // a sheet (opened from the header) everywhere else.
  const expanded = useBreakpoint() === 'expanded'
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
  // Review finding #2: disables exam inputs while submit() is in flight (see
  // exam/[slug].tsx's submitting flag for the full rationale).
  const [submitting, setSubmitting] = useState(false)
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
  // Fix 3: "Review mistakes" (the results screen's primary action) opens every
  // review section at once, as in the mock exam runner.
  const [reviewMistakesTapped, setReviewMistakesTapped] = useState(false)

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
    // Review finding #1: remap answers/idx through the surviving id order —
    // reorderByIds() compacted away vanished questions, so the ORIGINAL
    // indices no longer point at the same questions.
    const newIds = built.map(q => q.questionId)
    setAnswers(remapIndexedById(run.questionIds, newIds, run.answers))
    setIdx(remapSingleIndex(run.questionIds, newIds, run.idx))
    setEndTime(run.endTime)
    setPhase('exam')
  }

  function startOver() {
    if (savedRunRef.current) void clearRun(savedRunRef.current.runKey)
    savedRunRef.current = null
    buildFreshExam()
  }

  // Fix 1: persist answers/position/timer on every change while in progress.
  // Review finding #2: gated on submittedRef too — see exam/[slug].tsx's
  // save effect comment for the full rationale.
  useEffect(() => {
    if (phase !== 'exam' || questions.length === 0 || submittedRef.current) return
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
  // Review finding #3: web-only tab-close warning + immediate persist flush.
  useBeforeUnloadWarning(phase === 'exam')

  async function submit() {
    if (submittedRef.current) return  // guard against double-submit (timer + tap)
    submittedRef.current = true
    setSubmitting(true) // Review finding #2: disable exam inputs immediately

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

  // ── Redesign M3: render ────────────────────────────────────────────────────
  // Same frame as app/practice/exam/[slug].tsx: pages (<Screen>) around the
  // run, a focus-mode runner (RunnerFrame) during it. One maroon action per phase.

  if (phase === 'loading') {
    return <SessionLoading label="Loading exam" fallbackHref="/practice/upcat" />
  }

  if (phase === 'resume-prompt') {
    return (
      <Screen header={<DetailTopBar bare fallbackHref="/practice/upcat" />}>
        <PageTitle
          title="Resume where you left off?"
          lead="You have an in-progress attempt. Your answers and timer were saved."
        />
        <View style={{ gap: spacing.sm }}>
          <Button label="Resume where you left off" onPress={resumeExam} fullWidth size="lg" />
          <Button label="Start over" variant="secondary" fullWidth onPress={startOver} />
        </View>
      </Screen>
    )
  }

  if (phase === 'results') {
    if (questions.length === 0) {
      return (
        <SessionEmpty
          title="No questions for this subtest yet"
          body="Its questions are still being written. Check back soon, or practise another subtest in the meantime."
          fallbackHref="/practice/upcat"
          actionLabel="Back to UPCAT practice"
        />
      )
    }
    const scored = questions.map((q, i) => ({ subtest: q.subtest, correct: answers[i] === q.correctIndex }))
    const res = scoreExam(scored)
    const pct = res.overall.total ? Math.round((res.overall.correct / res.overall.total) * 100) : 0
    const label = subtestParam === 'all' ? 'the full mock' : (subtestParam ?? 'this subtest')
    return (
      <Screen>
        <View style={{ gap: spacing.xxl, paddingTop: spacing.lg }}>
          {/* Peak-end moment: warm, short, then the facts. Never a verdict. */}
          <PageTitle
            title="Tapos na! Practice complete."
            lead={`Here is how ${label} went. Every session shows you what to practise next.`}
          />

          {/* Fix 3: one neutral card regardless of score — no pass/fail colouring. */}
          <View style={{ gap: spacing.sm }}>
            <ResultsScoreCard pct={pct} correct={res.overall.correct} total={res.overall.total} />
            {scoreDelta ? (
              <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg }}>
                <Text style={[textStyle('bodySm', t.textPrimary), { textAlign: 'center' }]} maxFontSizeMultiplier={2}>{scoreDelta}</Text>
              </View>
            ) : null}
          </View>

          <View>
            <SectionHeader title="Per-subtest" subtitle="Your raw score in each subtest" />
            <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, borderCurve: 'continuous', paddingHorizontal: spacing.lg }}>
              {Object.entries(res.bySubtest).map(([st, b], i) => {
                const stPct = b.total ? Math.round((b.correct / b.total) * 100) : 0
                return (
                  <View key={st} style={{ paddingVertical: spacing.md, gap: spacing.sm, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.divider }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md }}>
                      <Text style={[textStyle('titleSm', t.textPrimary), { flexShrink: 1 }]} maxFontSizeMultiplier={2}>{st}</Text>
                      <Text style={[textStyle('bodySm', t.textSecondary), { fontVariant: ['tabular-nums'] }]} maxFontSizeMultiplier={2}>
                        {b.correct}/{b.total} correct · {stPct}%
                      </Text>
                    </View>
                    <ProgressBar value={stPct / 100} label={`${st} score`} />
                  </View>
                )
              })}
            </View>
          </View>

          <RunnerReview
            items={questions.map(q => ({
              id: q.questionId,
              sectionName: q.subtest,
              questionText: q.questionText,
              options: q.options,
              correctIndex: q.correctIndex,
              explanation: q.explanation,
              optionExplanations: q.optionExplanations,
              strategyTip: q.strategyTip,
              imageUrl: q.imageUrl,
              imageAlt: q.imageAlt,
              imageWidth: q.imageWidth,
              imageHeight: q.imageHeight,
            }))}
            answers={answers}
            expandAll={reviewMistakesTapped}
          />

          {/* Fix 3: "Review mistakes" is the primary action, "Retake" is secondary. */}
          <View style={{ gap: spacing.sm }}>
            <Button label="Review mistakes" onPress={() => setReviewMistakesTapped(true)} fullWidth size="lg" />
            <Button
              label="Retake exam"
              variant="secondary"
              fullWidth
              onPress={() => router.replace(`/practice/upcat/${subtestParam}?mode=${mode}`)}
            />
            <Button label="Back to exams" variant="ghost" fullWidth onPress={() => router.replace('/practice/upcat')} />
          </View>
        </View>
      </Screen>
    )
  }

  const q = questions[idx]!
  const sel = answers[idx]
  const answeredIdxs = new Set(Object.keys(answers).map(Number))
  const flaggedIdxs = new Set(Object.keys(reported).map(Number))
  const isLast = idx === questions.length - 1
  const jump = (i: number) => { if (!submitting) setIdx(i) }

  return (
    <RunnerFrame
      scrollRef={qPaneRef}
      header={
        <ExamFocusHeader
          title={subtestParam === 'all' ? `Full mock · ${q.subtest}` : (subtestParam ?? q.subtest)}
          position={idx + 1}
          total={questions.length}
          answered={answeredIdxs.size}
          remaining={remaining}
          onLeave={() => router.back()}
          onOpenOverview={expanded ? undefined : () => setReviewOpen(true)}
        />
      }
      question={
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
      }
      options={
        <OptionList
          options={q.options}
          selectedIndex={sel}
          disabled={submitting}
          onSelect={oi => { if (!submitting) setAnswers(a => ({ ...a, [idx]: oi })) }}
        />
      }
      actions={
        // Fix 2: the last question never submits directly — it opens the review sheet.
        <RunnerActions
          isLast={isLast}
          canGoBack={idx > 0}
          answered={sel !== undefined}
          submitting={submitting}
          onBack={() => setIdx(i => Math.max(0, i - 1))}
          onSkip={() => setIdx(i => i + 1)}
          onNext={() => setIdx(i => i + 1)}
          onReview={() => setReviewOpen(true)}
        />
      }
      navPanel={
        <QuestionNavPanel
          total={questions.length}
          currentIdx={idx}
          answeredIdxs={answeredIdxs}
          flaggedIdxs={flaggedIdxs}
          onJump={jump}
        />
      }
    >
      <ExamReviewSheet
        visible={reviewOpen}
        total={questions.length}
        currentIdx={idx}
        answeredIdxs={answeredIdxs}
        flaggedIdxs={flaggedIdxs}
        onJump={jump}
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
    </RunnerFrame>
  )
}
