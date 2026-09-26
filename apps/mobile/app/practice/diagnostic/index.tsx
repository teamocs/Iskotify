import { useState, useEffect, useRef } from 'react'
import { View, Text, ScrollView } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../../hooks/useDb'
import { upcatQuestions } from '../../../db/schema'
import { useRecordSession } from '../../../hooks/useRecordSession'
import { useRecordAttempts } from '../../../hooks/useRecordAttempts'
import {
  resolveDiagnosticSubtests, buildDiagnosticQuestions, scoreDiagnostic,
  buildDiagnosticSessionParams, weakestSubject, SECONDS_PER_QUESTION, QUESTIONS_PER_SUBTEST,
} from '../../../utils/diagnosticExam'
import { prefetchSessionImages } from '../../../utils/prefetchQuestionImages'
import { createTimingState, onIdxChange, finalizeTiming, type TimingState } from '../../../utils/attemptTiming'
import { buildAttemptRows } from '../../../utils/attemptRows'
import type { PreAssessQuestion } from '../../../data/preAssessment'
import { QuestionCard } from '../../../components/practice/QuestionCard'
import { OptionList } from '../../../components/practice/OptionList'
import { ResultsScoreCard } from '../../../components/practice/ResultsScoreCard'
import { ExamFocusHeader } from '../../../components/practice/ExamFocusHeader'
import { QuestionNavPanel } from '../../../components/practice/QuestionNavPanel'
import { SessionLoading, SessionEmpty, SessionError } from '../../../components/practice/SessionStates'
import { RunnerFrame } from '../../../components/practice/runner/RunnerFrame'
import { RunnerActions } from '../../../components/practice/runner/RunnerActions'
import { RunnerReview } from '../../../components/practice/runner/RunnerReview'
import { Screen } from '../../../components/ui/Screen'
import { PageTitle } from '../../../components/ui/PageTitle'
import { Button } from '../../../components/ui/Button'
import { SectionHeader } from '../../../components/ui/SectionHeader'
import { ProgressBar } from '../../../components/ui/ProgressBar'
import { DetailTopBar } from '../../../components/explore/DetailTopBar'
import { useTheme } from '../../../theme/ThemeContext'
import { spacing, radius, textStyle } from '../../../theme/tokens'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import { ExamReviewSheet } from '../../../components/practice/ExamReviewSheet'
import { usePreventLeave } from '../../../hooks/usePreventLeave'
import { useBeforeUnloadWarning } from '../../../hooks/useBeforeUnloadWarning'
import { useExamRunPersistence } from '../../../hooks/useExamRunPersistence'
import { confirmAction } from '../../../utils/confirmAction'
import { runKeyFor, reorderByIds, remapIndexedById, remapSingleIndex } from '../../../utils/examRunPersistence'
import { buildPreAssessFromUpcat, type UpcatLocalRow } from '../../../utils/preAssessmentSource'
import { PRE_ASSESS_QUESTIONS } from '../../../data/preAssessment'

type Phase = 'loading' | 'load-error' | 'resume-prompt' | 'exam' | 'results'

// Redesign M2: results are neutral — no tone-coloured percent or badges (a
// green/red score reads as pass/fail, which PRODUCT.md rules out).

/**
 * Diagnostic exam — a short, standalone 10-questions/subtest assessment that seeds
 * per-subject preparedness. Reachable from home tiles/subject cards (optionally
 * scoped via ?subject=<subtest name>). Mirrors app/practice/upcat/[subtest].tsx's
 * timed-engine pattern (60s/question, auto-submit at zero) and records one
 * practice_sessions row per subject so results feed subject readiness.
 */
export default function DiagnosticExam() {
  const { subject: subjectParam } = useLocalSearchParams<{ subject?: string }>()
  const db = useDb()
  const { theme: t } = useTheme()
  // Redesign M3: the question navigator is a side panel on expanded widths and
  // a sheet (opened from the header) everywhere else.
  const expanded = useBreakpoint() === 'expanded'
  const { recordSession } = useRecordSession()
  const { recordAttempts } = useRecordAttempts()
  const { saveRun, loadRun, clearRun } = useExamRunPersistence()

  const [phase, setPhase] = useState<Phase>('loading')
  // Bumped by "Try again" after a failed question load to re-run the load effect.
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [questions, setQuestions] = useState<PreAssessQuestion[]>([])
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const startRef = useState(() => Date.now())[0]
  // Fix 2: last-question review sheet (never submits directly).
  const [reviewOpen, setReviewOpen] = useState(false)
  // Fix 1: leave-confirmation + resume-in-progress-run state.
  const [leaveConfirmed, setLeaveConfirmed] = useState(false)
  // Review finding #2: disables exam inputs while submit() is in flight (see
  // exam/[slug].tsx's submitting flag for the full rationale).
  const [submitting, setSubmitting] = useState(false)
  const savedRunRef = useRef<Awaited<ReturnType<typeof loadRun>>>(null)
  const bankRowsRef = useRef<UpcatLocalRow[]>([])
  const subtestsRef = useRef<string[]>([])
  const runKey = runKeyFor('diagnostic', subjectParam ?? 'all')

  // Countdown timer (60s/question). Auto-submits at zero. endTime is an absolute
  // timestamp so the clock stays accurate even if the interval drifts.
  const [endTime, setEndTime] = useState<number | null>(null)
  const [remaining, setRemaining] = useState(0)
  const submittedRef = useRef(false)
  const submitRef = useRef<() => void>(() => {})
  const qPaneRef = useRef<ScrollView>(null)

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

  /** Builds a brand-new sample from the already-fetched bank rows and arms the timer. */
  function buildFreshExam() {
    const built = buildDiagnosticQuestions(bankRowsRef.current, subtestsRef.current, QUESTIONS_PER_SUBTEST)
    prefetchSessionImages(built) // fire-and-forget; never blocks session start
    setQuestions(built)
    if (built.length) setEndTime(Date.now() + built.length * SECONDS_PER_QUESTION * 1000)
    setPhase(built.length ? 'exam' : 'results')
  }

  useEffect(() => {
    void (async () => {
      try {
        const rows = await db.select({
          questionId: upcatQuestions.questionId,
          subtest: upcatQuestions.subtest,
          questionText: upcatQuestions.questionText,
          options: upcatQuestions.options,
          correctIndex: upcatQuestions.correctIndex,
          explanation: upcatQuestions.explanation,
          setId: upcatQuestions.setId,
          optionExplanations: upcatQuestions.optionExplanations,
          strategyTip: upcatQuestions.strategyTip,
          hasVisual: upcatQuestions.hasVisual,
          imageUrl: upcatQuestions.imageUrl,
          imageAlt: upcatQuestions.imageAlt,
          imageWidth: upcatQuestions.imageWidth,
          imageHeight: upcatQuestions.imageHeight,
        }).from(upcatQuestions).where(eq(upcatQuestions.status, 'published'))
        bankRowsRef.current = rows
        subtestsRef.current = resolveDiagnosticSubtests(subjectParam)

        // Fix 1: a saved in-progress run pre-empts starting a brand-new sample.
        const run = await loadRun(runKey)
        if (run && run.questionIds.length > 0) {
          savedRunRef.current = run
          setPhase('resume-prompt')
          return
        }

        buildFreshExam()
      } catch (err) {
        // A read failure is not an empty bank: offer a retry rather than the
        // "no questions" page (and never hang on loading).
        console.warn('[practice] question load failed:', err)
        setPhase('load-error')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, subjectParam, loadAttempt])

  /** Fix 1: rebuild the exact previously-sampled question set from the saved
   *  run's ids. The diagnostic's question pool mixes bank rows (real
   *  question ids) and the bundled static set (data/preAssessment.ts) — build
   *  as close to an exhaustive candidate pool as possible (a very high
   *  per-subtest cap) plus the whole bundle, then reorder/filter by the saved
   *  ids. A previously-served bank question that fell outside this pool is
   *  silently dropped (see utils/examRunPersistence.ts's reorderByIds) —
   *  resuming with slightly fewer questions is safer than resuming with a
   *  missing/stale one. */
  function resumeExam() {
    const run = savedRunRef.current
    if (!run) return
    const exhaustivePool = buildPreAssessFromUpcat(bankRowsRef.current, subtestsRef.current, 9999)
    const candidatePool = [...exhaustivePool, ...PRE_ASSESS_QUESTIONS]
    const ordered = reorderByIds<PreAssessQuestion, 'id'>(candidatePool, run.questionIds, 'id')
    if (ordered.length === 0) {
      void clearRun(run.runKey)
      buildFreshExam()
      return
    }
    setQuestions(ordered)
    // Review finding #1: remap answers/idx through the surviving id order —
    // reorderByIds() compacted away vanished questions.
    const newIds = ordered.map(q => q.id)
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
      kind: 'diagnostic',
      slug: subjectParam ?? 'all',
      mode: '',
      questionIds: questions.map(q => q.id),
      sectionNames: questions.map(q => q.subject),
      answers,
      idx,
      sectionIdx: 0,
      floorIdx: 0,
      endTime,
      sectionEndTime: null,
      startedAt: startRef,
    }).catch(err => console.warn('[practice/diagnostic] saveRun failed:', err))
  }, [phase, runKey, subjectParam, questions, answers, idx, endTime, startRef, saveRun])

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
    if (submittedRef.current) return // guard against double-submit (timer + tap)
    submittedRef.current = true
    setSubmitting(true) // Review finding #2: disable exam inputs immediately

    // Fix 1: run finished — stop offering "Resume" for a completed attempt.
    void clearRun(runKey).catch(err => console.warn('[practice/diagnostic] clearRun failed:', err))

    const score = scoreDiagnostic(questions, answers)

    // Task D: per-question attempt rows, written before recordSession so
    // they're committed before recordSession's fire-and-forget backup push.
    const elapsedByIdx = timingRef.current ? finalizeTiming(timingRef.current, Date.now()) : {}
    const rows = buildAttemptRows({
      sessionKey: startRef,
      sourceTable: 'upcat_questions',
      listingSlug: 'upcat',
      questions: questions.map(q => ({
        questionId: q.id,
        correctIndex: q.answerIndex,
        subtest: q.subject,
        topic: null,
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
      console.warn('[practice/diagnostic] recordAttempts failed:', err)
    }

    for (const params of buildDiagnosticSessionParams(score.bySubject, startRef)) {
      void recordSession(params)
    }
    setPhase('results')
  }
  submitRef.current = submit // keep the timer's auto-submit pointed at the latest closure

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
    return <SessionLoading label="Loading diagnostic" fallbackHref="/(tabs)" />
  }

  if (phase === 'load-error') {
    return (
      <SessionError
        fallbackHref="/(tabs)"
        onRetry={() => { setPhase('loading'); setLoadAttempt(n => n + 1) }}
      />
    )
  }

  if (phase === 'resume-prompt') {
    return (
      <Screen header={<DetailTopBar bare fallbackHref="/(tabs)" />}>
        <PageTitle
          title="Resume where you left off?"
          lead="You have an in-progress diagnostic. Your answers and timer were saved."
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
          title="No diagnostic questions yet"
          body="The question bank is still syncing. Check back soon, or practise a subject in the meantime."
          fallbackHref="/(tabs)"
          actionLabel="Back to Home"
        />
      )
    }
    const score = scoreDiagnostic(questions, answers)
    const overallPct = score.overall.total ? Math.round((score.overall.correct / score.overall.total) * 100) : 0
    const weakest = weakestSubject(score.bySubject)
    return (
      <Screen>
        <View style={{ gap: spacing.xxl, paddingTop: spacing.lg }}>
          <PageTitle
            title="Diagnostic results"
            lead="Your starting point in each subject. It shapes what Practice suggests next."
          />

          {/* Neutral: the same ink at any score, never a pass/fail colour. */}
          <ResultsScoreCard pct={overallPct} correct={score.overall.correct} total={score.overall.total} />

          <View>
            <SectionHeader title="Per-subject readiness" />
            <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, borderCurve: 'continuous', paddingHorizontal: spacing.lg }}>
              {Object.entries(score.bySubject).map(([subject, b], i) => {
                const pct = b.total ? Math.round((b.correct / b.total) * 100) : 0
                return (
                  <View key={subject} style={{ paddingVertical: spacing.md, gap: spacing.sm, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.divider }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md }}>
                      <Text style={[textStyle('titleSm', t.textPrimary), { flexShrink: 1 }]} maxFontSizeMultiplier={2}>{subject}</Text>
                      <Text style={[textStyle('bodySm', t.textSecondary), { fontVariant: ['tabular-nums'] }]} maxFontSizeMultiplier={2}>
                        {b.correct}/{b.total} correct · {pct}%
                      </Text>
                    </View>
                    <ProgressBar value={pct / 100} label={`${subject} readiness`} />
                  </View>
                )
              })}
            </View>
          </View>

          <RunnerReview
            items={questions.map((q, i) => ({
              id: q.id ?? String(i),
              sectionName: q.subject,
              questionText: q.stem,
              options: q.options,
              correctIndex: q.answerIndex,
              explanation: q.explanation,
              optionExplanations: q.optionExplanations,
              strategyTip: q.strategyTip,
              imageUrl: q.imageUrl,
              imageAlt: q.imageAlt,
              imageWidth: q.imageWidth,
              imageHeight: q.imageHeight,
            }))}
            answers={answers}
          />

          <View style={{ gap: spacing.sm }}>
            <Button
              label={weakest ? `Practice weakest subject (${weakest})` : 'Practice weak subjects'}
              onPress={() => router.push('/practice/review/upcat')}
              fullWidth
              size="lg"
            />
            <Button label="Back to Home" variant="secondary" fullWidth onPress={() => router.replace('/(tabs)')} />
          </View>
        </View>
      </Screen>
    )
  }

  const q = questions[idx]!
  const sel = answers[idx]
  const answeredIdxs = new Set(Object.keys(answers).map(Number))
  const isLast = idx === questions.length - 1
  const jump = (i: number) => { if (!submitting) setIdx(i) }

  return (
    <RunnerFrame
      scrollRef={qPaneRef}
      header={
        // The subject names the run in the header (the question card carries
        // no coloured eyebrow above the stem).
        <ExamFocusHeader
          title={q.subject || subjectParam || 'Diagnostic'}
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
          questionText={q.stem}
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
        <QuestionNavPanel total={questions.length} currentIdx={idx} answeredIdxs={answeredIdxs} onJump={jump} />
      }
    >
      <ExamReviewSheet
        visible={reviewOpen}
        total={questions.length}
        currentIdx={idx}
        answeredIdxs={answeredIdxs}
        onJump={jump}
        onClose={() => setReviewOpen(false)}
        onSubmit={() => { setReviewOpen(false); void submit() }}
      />
    </RunnerFrame>
  )
}
