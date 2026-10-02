import { useState, useEffect, useRef } from 'react'
import { View, Text, ScrollView } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../../hooks/useDb'
import { hasReviewContent } from '../../../services/practiceSignals'
import { upcatQuestions } from '../../../db/schema'
import { useRecordSession } from '../../../hooks/useRecordSession'
import { useRecordAttempts } from '../../../hooks/useRecordAttempts'
import {
  resolveDiagnosticSubtests, buildDiagnosticQuestions, scoreDiagnostic,
  buildDiagnosticSessionParams, weakestSubject, isBundledDiagnosticId, SECONDS_PER_QUESTION, QUESTIONS_PER_SUBTEST,
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
import { useGuestMode } from '../../../hooks/useGuestMode'
import { GUEST_INTRO_HREF, GUEST_SIGNUP_HREF } from '../../../utils/guestPreview'
import { useExamRunPersistence } from '../../../hooks/useExamRunPersistence'
import { confirmAction } from '../../../utils/confirmAction'
import { reorderByIds, remapIndexedById, remapSingleIndex, isRunExpired } from '../../../utils/examRunPersistence'
import { buildPreAssessFromUpcat, type UpcatLocalRow } from '../../../utils/preAssessmentSource'
import { PRE_ASSESS_QUESTIONS } from '../../../data/preAssessment'
import {
  listFocusExamSlugs, listRunnableDiagnosticBlueprints, loadBlueprintDiagnosticSource,
  type BlueprintDiagnosticSource,
} from '../../../services/diagnosticSource'
import {
  resolveDiagnosticTarget, buildBlueprintDiagnostic, blueprintDiagnosticPool,
  buildBlueprintDiagnosticSessionParams, blueprintDiagnosticToAttemptMeta,
  diagnosticRunKey, diagnosticRunSlug, examSlugLabel, firstParam, normalizeExamParam,
  type DiagnosticTarget,
} from '../../../utils/diagnosticTarget'

type Phase = 'loading' | 'load-error' | 'unavailable' | 'resume-prompt' | 'exam' | 'results'

// Redesign M2: results are neutral — no tone-coloured percent or badges (a
// green/red score reads as pass/fail, which PRODUCT.md rules out).

/**
 * Diagnostic exam — a short, standalone 10-questions/subtest assessment that seeds
 * per-subject preparedness. Reachable from home tiles/subject cards (optionally
 * scoped via ?subject=<subtest name>). Mirrors app/practice/upcat/[subtest].tsx's
 * timed-engine pattern (60s/question, auto-submit at zero) and records one
 * practice_sessions row per subject so results feed subject readiness.
 *
 * Logic audit D: it follows the student's exam. `?exam=<slug>` wins, else the
 * primary focus exam with a runnable blueprint, else UPCAT (the 4-subtest
 * diagnostic below, unchanged). Another exam gets a short blueprint sample
 * (utils/diagnosticTarget.ts: 5 per section, 1 min/question), recorded under
 * that exam's slug; an exam with no runnable blueprint says so honestly and
 * points at its topic review (or its exam page) — never UPCAT questions under
 * the student's exam.
 */
export default function DiagnosticExam() {
  const params = useLocalSearchParams<{ subject?: string | string[]; exam?: string | string[] }>()
  const subjectParam = firstParam(params.subject)
  const examParam = normalizeExamParam(params.exam)
  // Keyed on the target params: a different exam/subject is a new sitting with fresh state.
  return <DiagnosticRun key={`${examParam ?? ''}|${subjectParam ?? ''}`} subjectParam={subjectParam} examParamRaw={examParam} />
}

function DiagnosticRun({ subjectParam, examParamRaw }: { subjectParam?: string; examParamRaw?: string }) {
  const db = useDb()
  const { theme: t } = useTheme()
  // Redesign M3: the question navigator is a side panel on expanded widths and
  // a sheet (opened from the header) everywhere else.
  const expanded = useBreakpoint() === 'expanded'
  const { recordSession } = useRecordSession()
  const { recordAttempts } = useRecordAttempts()
  const { saveRun, loadRun, clearRun } = useExamRunPersistence()
  // The web glimpse (P4): a signed-out web visitor. Their sample is built once
  // the catalog has synced; their results invite them to make a free account and
  // never link anywhere a guest cannot go. A browser still holding an account
  // that signed out is 'held': back to /try, nothing is written.
  const { mode: guestMode, catalogReady } = useGuestMode()
  const guest = guestMode === 'guest'
  const waiting = guestMode === 'checking' || guestMode === 'held' || (guest && !catalogReady)
  const homeHref = guest ? GUEST_INTRO_HREF : '/(tabs)'
  useEffect(() => {
    if (guestMode === 'held') router.replace(GUEST_INTRO_HREF)
  }, [guestMode])

  const [phase, setPhase] = useState<Phase>('loading')
  // Bumped by "Try again" after a failed question load to re-run the load effect.
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [questions, setQuestions] = useState<PreAssessQuestion[]>([])
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  // Sitting start (ms): restored from the saved run on resume so duration and the
  // attempt key describe the real sitting.
  const [startedAt, setStartedAt] = useState(() => Date.now())
  // Indexes the student has actually seen; unreached questions are not written as attempts.
  const visitedRef = useRef<Set<number>>(new Set())
  // The saved run's time already ran out: offer Submit / Discard instead of Resume.
  const [resumeStale, setResumeStale] = useState(false)
  const [submitStale, setSubmitStale] = useState(false)
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
  // Which exam this sitting samples (resolved in the load effect). The ref is what
  // the builders read; the state drives the run key and the copy.
  const targetRef = useRef<DiagnosticTarget>({ kind: 'upcat' })
  const sourceRef = useRef<BlueprintDiagnosticSource | null>(null)
  const [target, setTarget] = useState<DiagnosticTarget | null>(null)
  // Exam name for copy (blueprint acronym, or the slug for an exam with no blueprint).
  const [examLabel, setExamLabel] = useState('')
  // Blueprint sections with nothing runnable yet, shown on the results.
  const [comingSoon, setComingSoon] = useState<string[]>([])
  const isBlueprint = target?.kind === 'blueprint'
  // Whether the exam has topic reviews (hasReviewContent: the same DB check the
  // listing, school and Today pages use). null until known.
  const reviewSlug = target && target.kind !== 'upcat' ? target.slug : null
  const [canReview, setCanReview] = useState<boolean | null>(null)
  useEffect(() => {
    if (!reviewSlug) return
    let cancelled = false
    setCanReview(null)
    hasReviewContent(db, reviewSlug)
      .then(v => { if (!cancelled) setCanReview(v) })
      .catch(e => {
        console.warn('[practice/diagnostic] review lookup failed:', e)
        if (!cancelled) setCanReview(false)
      })
    return () => { cancelled = true }
  }, [db, reviewSlug])
  const runKey = target ? diagnosticRunKey(target, subjectParam) : ''

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
  useEffect(() => {
    if (phase === 'exam') visitedRef.current.add(idx)
  }, [phase, idx])

  /** Builds a brand-new sample from the already-fetched bank rows and arms the timer. */
  function buildFreshExam() {
    let built: PreAssessQuestion[]
    const tgt = targetRef.current
    if (tgt.kind === 'blueprint' && sourceRef.current) {
      const src = sourceRef.current
      const bd = buildBlueprintDiagnostic(src.blueprint, src.questionsByCategory, src.passages)
      built = bd.questions
      setComingSoon(bd.comingSoon.map(s => s.name))
    } else {
      built = buildDiagnosticQuestions(bankRowsRef.current, subtestsRef.current, QUESTIONS_PER_SUBTEST)
    }
    prefetchSessionImages(built) // fire-and-forget; never blocks session start
    setQuestions(built)
    setStartedAt(Date.now())
    visitedRef.current = new Set()
    if (built.length) setEndTime(Date.now() + built.length * SECONDS_PER_QUESTION * 1000)
    setPhase(built.length ? 'exam' : 'results')
  }

  useEffect(() => {
    if (waiting) return
    let alive = true
    void (async () => {
      try {
        // Which exam? An explicit ?exam= wins, else the primary focus exam with a
        // runnable blueprint.
        const examParam = examParamRaw
        const needsLookup = examParam ? examParam !== 'upcat' : !subjectParam
        let focusSlugs: string[] = []
        let runnable: { slug: string }[] = []
        if (needsLookup) {
          try {
            ;[focusSlugs, runnable] = await Promise.all([
              examParam ? Promise.resolve([] as string[]) : listFocusExamSlugs(db),
              listRunnableDiagnosticBlueprints(db),
            ])
          } catch (err) {
            // An explicit ?exam= can't be answered honestly without the lookup: keep the error.
            // Unscoped, the focus lookup is only a refinement: fall back to the UPCAT diagnostic.
            if (examParam) throw err
            console.warn('[practice/diagnostic] focus lookup failed, using UPCAT:', err)
          }
        }
        if (!alive) return
        const resolved = resolveDiagnosticTarget({
          examParam, subjectParam, focusSlugs, runnableSlugs: runnable.map(b => b.slug),
        })
        let source: BlueprintDiagnosticSource | null = null
        let tgt: DiagnosticTarget = resolved
        if (resolved.kind === 'blueprint') {
          try {
            source = await loadBlueprintDiagnosticSource(db, resolved.slug)
          } catch (err) {
            if (examParam) throw err
            console.warn('[practice/diagnostic] exam source failed, using UPCAT:', err)
            tgt = { kind: 'upcat' }
          }
          if (!alive) return
          // Listed as runnable but vanished (unpublished mid-load): treat as not available.
          if (tgt.kind === 'blueprint' && !source) tgt = { kind: 'unavailable', slug: resolved.slug }
        }
        targetRef.current = tgt
        sourceRef.current = source
        setTarget(tgt)
        if (tgt.kind === 'unavailable') {
          setExamLabel(examSlugLabel(tgt.slug))
          setPhase('unavailable')
          return
        }
        if (tgt.kind === 'blueprint' && source) {
          setExamLabel(source.blueprint.acronym || examSlugLabel(tgt.slug))
          // The blueprint diagnostic samples from the blueprint's own category pools,
          // not from the UPCAT per-subtest bank rows below.
          const run = await loadRun(diagnosticRunKey(tgt, subjectParam))
          if (!alive) return
          if (run && run.slug === diagnosticRunSlug(tgt, subjectParam) && run.questionIds.length > 0) {
            savedRunRef.current = run
            setResumeStale(isRunExpired(run, Date.now()))
            setPhase('resume-prompt')
            return
          }
          buildFreshExam()
          return
        }
        setExamLabel('')

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
        if (!alive) return
        bankRowsRef.current = rows
        subtestsRef.current = resolveDiagnosticSubtests(subjectParam)

        // Fix 1: a saved in-progress run pre-empts starting a brand-new sample.
        const run = await loadRun(diagnosticRunKey(tgt, subjectParam))
        if (!alive) return
        if (run && run.questionIds.length > 0) {
          savedRunRef.current = run
          setResumeStale(isRunExpired(run, Date.now()))
          setPhase('resume-prompt')
          return
        }

        buildFreshExam()
      } catch (err) {
        // A read failure is not an empty bank: offer a retry rather than the
        // "no questions" page (and never hang on loading).
        if (!alive) return
        console.warn('[practice] question load failed:', err)
        setPhase('load-error')
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, subjectParam, examParamRaw, loadAttempt, waiting])

  /** Fix 1: rebuild the exact previously-sampled question set from the saved
   *  run's ids. The diagnostic's question pool mixes bank rows (real
   *  question ids) and the bundled static set (data/preAssessment.ts) — build
   *  as close to an exhaustive candidate pool as possible (a very high
   *  per-subtest cap) plus the whole bundle, then reorder/filter by the saved
   *  ids. A previously-served bank question that fell outside this pool is
   *  silently dropped (see utils/examRunPersistence.ts's reorderByIds) —
   *  resuming with slightly fewer questions is safer than resuming with a
   *  missing/stale one. */
  function restoreRun(): boolean {
    const run = savedRunRef.current
    if (!run) return false
    let candidatePool: PreAssessQuestion[]
    if (targetRef.current.kind === 'blueprint' && sourceRef.current) {
      // An exam diagnostic: the saved ids pick from the blueprint's own pools, and each
      // keeps the section it was sampled under (saved by id, in sectionNames).
      const src = sourceRef.current
      const sectionById = new Map(run.questionIds.map((id, i) => [id, run.sectionNames[i] ?? '']))
      // The not-available note is a property of the blueprint's pools, not of this sample.
      setComingSoon(buildBlueprintDiagnostic(src.blueprint, src.questionsByCategory, src.passages).comingSoon.map(sc => sc.name))
      candidatePool = blueprintDiagnosticPool(src.questionsByCategory, src.passages)
        .map(q => ({ ...q, subject: sectionById.get(q.id) ?? q.subject }))
    } else {
      const exhaustivePool = buildPreAssessFromUpcat(bankRowsRef.current, subtestsRef.current, 9999)
      candidatePool = [...exhaustivePool, ...PRE_ASSESS_QUESTIONS]
    }
    const ordered = reorderByIds<PreAssessQuestion, 'id'>(candidatePool, run.questionIds, 'id')
    if (ordered.length === 0) {
      void clearRun(run.runKey)
      buildFreshExam()
      return false
    }
    setQuestions(ordered)
    // Review finding #1: remap answers/idx through the surviving id order —
    // reorderByIds() compacted away vanished questions.
    const newIds = ordered.map(q => q.id)
    setAnswers(remapIndexedById(run.questionIds, newIds, run.answers))
    const restoredIdx = remapSingleIndex(run.questionIds, newIds, run.idx)
    setIdx(restoredIdx)
    setEndTime(run.endTime)
    setStartedAt(run.startedAt)
    // Reached = answered, or visited up to the saved position.
    const reached = new Set<number>(Object.keys(remapIndexedById(run.questionIds, newIds, run.answers)).map(Number))
    for (let i = 0; i <= restoredIdx; i++) reached.add(i)
    visitedRef.current = reached
    setPhase('exam')
    return true
  }

  function resumeExam() { restoreRun() }

  /** "Submit what I answered" on a run whose time ran out: restore it, then submit it as it stands. */
  function submitStaleRun() {
    if (restoreRun()) setSubmitStale(true)
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
    if (phase !== 'exam' || questions.length === 0 || submittedRef.current || !target) return
    void saveRun({
      runKey,
      kind: 'diagnostic',
      slug: diagnosticRunSlug(target, subjectParam),
      mode: '',
      questionIds: questions.map(q => q.id),
      sectionNames: questions.map(q => q.subject),
      answers,
      idx,
      sectionIdx: 0,
      floorIdx: 0,
      endTime,
      sectionEndTime: null,
      startedAt,
    }).catch(err => console.warn('[practice/diagnostic] saveRun failed:', err))
  }, [phase, runKey, target, subjectParam, questions, answers, idx, endTime, startedAt, saveRun])

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

    // Scored over REACHED questions only (the same set as the attempt rows), so a
    // subject's session total is what the student saw and a subject never reached has
    // no row at all, not a 0% session.
    const reachedBySubject = scoreDiagnostic(questions, answers, visitedRef.current).bySubject

    // Task D: per-question attempt rows, written before recordSession so
    // they're committed before recordSession's fire-and-forget backup push.
    const elapsedByIdx = timingRef.current ? finalizeTiming(timingRef.current, Date.now()) : {}
    const bpSlug = targetRef.current.kind === 'blueprint' ? targetRef.current.slug : null
    const rows = buildAttemptRows({
      sessionKey: startedAt,
      sourceTable: 'upcat_questions',
      listingSlug: bpSlug ?? 'upcat',
      // An exam diagnostic labels questions by section, so their canonical subtest travels separately.
      questions: bpSlug
        ? blueprintDiagnosticToAttemptMeta(questions)
        : questions.map(q => ({
            questionId: q.id,
            correctIndex: q.answerIndex,
            subtest: q.subject,
            topic: null,
          })),
      answers,
      elapsedByIdx,
      reached: visitedRef.current,
    })
    // Bundled fallback questions (ids like 'pre-math-1') are not upcat_questions
    // rows, so they are scored in the session below but never recorded as attempts.
    const bankRows = rows.filter(r => !isBundledDiagnosticId(r.questionId))
    // Finding #2: telemetry is best-effort — it must never gate the results
    // screen. submittedRef is already flipped above; if this insert rejects
    // (disk full, storage quota, etc.) the student must still reach
    // results, not get stranded behind the double-submit guard.
    try {
      if (bankRows.length > 0) await recordAttempts(bankRows)
    } catch (err) {
      console.warn('[practice/diagnostic] recordAttempts failed:', err)
    }

    const sessionParams = bpSlug
      ? buildBlueprintDiagnosticSessionParams(bpSlug, questions, answers, visitedRef.current, startedAt)
      : buildDiagnosticSessionParams(reachedBySubject, startedAt)
    for (const params of sessionParams) {
      void recordSession(params).catch(err => console.warn('[practice/diagnostic] recordSession failed:', err))
    }
    setPhase('results')
  }
  submitRef.current = submit // keep the timer's auto-submit pointed at the latest closure

  // "Submit what I answered" on an expired run: submit once the restored exam phase is up.
  // Declared BEFORE the countdown effect so submittedRef is already set when it runs.
  useEffect(() => {
    if (phase !== 'exam' || !submitStale) return
    setSubmitStale(false)
    void submitRef.current()
  }, [phase, submitStale])

  // Countdown tick — recomputed from the absolute endTime each second so it stays
  // accurate; auto-submits when it reaches zero.
  useEffect(() => {
    if (phase !== 'exam' || endTime == null) return
    const tick = () => {
      if (submittedRef.current) return
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
    return <SessionLoading label="Loading diagnostic" fallbackHref={homeHref} />
  }

  if (phase === 'load-error') {
    return (
      <SessionError
        fallbackHref={homeHref}
        onRetry={() => { setPhase('loading'); setLoadAttempt(n => n + 1) }}
      />
    )
  }

  if (phase === 'unavailable') {
    const slug = target?.kind === 'unavailable' ? target.slug : ''
    return (
      <Screen header={<DetailTopBar bare fallbackHref={homeHref} />}>
        <PageTitle
          title={`A diagnostic for ${examLabel} isn't available yet`}
          lead={canReview
            ? `There aren't enough published questions for this exam to build one yet. Its topic reviews are ready now.`
            : canReview === false
              ? `There aren't enough published questions for this exam to build one yet. Practice for ${examLabel} is coming soon.`
              : `There aren't enough published questions for this exam to build one yet.`}
        />
        <View style={{ gap: spacing.sm }}>
          {/* Never the UPCAT diagnostic here: those questions are not this exam's.
              A guest has neither page: only the way back to the start. */}
          {guest ? (
            <Button label="Back to start" fullWidth size="lg" onPress={() => router.replace(GUEST_INTRO_HREF)} />
          ) : (
            <>
              {!slug || canReview === null ? null : canReview ? (
                <Button label={`Review ${examLabel} topics`} onPress={() => router.push(`/practice/review/${slug}`)} fullWidth size="lg" />
              ) : (
                <Button label="See exam details" onPress={() => router.push(`/listings/${encodeURIComponent(slug)}`)} fullWidth size="lg" />
              )}
              <Button label="Back to Home" variant="secondary" fullWidth onPress={() => router.replace('/(tabs)')} />
            </>
          )}
        </View>
      </Screen>
    )
  }

  if (phase === 'resume-prompt') {
    const diagnosticName = isBlueprint ? `${examLabel} diagnostic` : 'diagnostic'
    return (
      <Screen header={<DetailTopBar bare fallbackHref={homeHref} />}>
        <PageTitle
          title={resumeStale ? `Your last ${diagnosticName} ran out of time` : 'Resume where you left off?'}
          lead={resumeStale
            ? 'You can submit the answers you gave (questions you never reached are not counted), or discard that attempt and start fresh.'
            : `You have an in-progress ${diagnosticName}. Your answers and timer were saved.`}
        />
        <View style={{ gap: spacing.sm }}>
          {resumeStale ? (
            <>
              <Button label="Submit what I answered" onPress={submitStaleRun} fullWidth size="lg" />
              <Button label="Discard" variant="secondary" fullWidth onPress={startOver} />
            </>
          ) : (
            <>
              <Button label="Resume where you left off" onPress={resumeExam} fullWidth size="lg" />
              <Button label="Start over" variant="secondary" fullWidth onPress={startOver} />
            </>
          )}
        </View>
      </Screen>
    )
  }

  if (phase === 'results') {
    if (questions.length === 0) {
      return (
        <SessionEmpty
          title="No diagnostic questions yet"
          body={guest
            ? 'The question bank is still syncing. Check back soon.'
            : 'The question bank is still syncing. Check back soon, or practise a subject in the meantime.'}
          fallbackHref={homeHref}
          actionLabel={guest ? 'Back to start' : 'Back to Home'}
        />
      )
    }
    const score = scoreDiagnostic(questions, answers, visitedRef.current)
    const unreached = questions.length - score.overall.total
    const overallPct = score.overall.total ? Math.round((score.overall.correct / score.overall.total) * 100) : 0
    const weakest = weakestSubject(score.bySubject)
    return (
      <Screen>
        <View style={{ gap: spacing.xxl, paddingTop: spacing.lg }}>
          <PageTitle
            title={isBlueprint ? `${examLabel} diagnostic results` : 'Diagnostic results'}
            lead={isBlueprint
              ? `Your starting point in each ${examLabel} section. It shapes what Practice suggests next.`
              : 'Your starting point in each subject. It shapes what Practice suggests next.'}
          />

          {/* Neutral: the same ink at any score, never a pass/fail colour. */}
          <ResultsScoreCard pct={overallPct} correct={score.overall.correct} total={score.overall.total} />

          <View>
            <SectionHeader title={isBlueprint ? 'Per-section readiness' : 'Per-subject readiness'} />
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
            {unreached > 0 ? (
              <Text style={[textStyle('caption', t.textSecondary), { marginTop: spacing.sm }]} maxFontSizeMultiplier={2}>
                Questions you never reached are not counted.
              </Text>
            ) : null}
            {isBlueprint && comingSoon.length > 0 ? (
              <Text style={[textStyle('caption', t.textSecondary), { marginTop: spacing.sm }]} maxFontSizeMultiplier={2}>
                {`Not available yet: ${comingSoon.join(', ')}. These sections have no questions to sample.`}
              </Text>
            ) : null}
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

          {guest ? (
            // The web glimpse (P4): the one next step is a free account. The run is
            // already on this device and joins the account made here.
            <View style={{ gap: spacing.sm }}>
              <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>
                These results stay on this device. Create a free account to keep them and get practice built around them.
              </Text>
              <Button label="Create a free account to save this and keep practising" onPress={() => router.push(GUEST_SIGNUP_HREF)} fullWidth size="lg" />
              <Button label="Back to start" variant="secondary" fullWidth onPress={() => router.replace(GUEST_INTRO_HREF)} />
            </View>
          ) : (
          <View style={{ gap: spacing.sm }}>
            {target?.kind === 'blueprint' ? (
              // Review lists flashcard topics tagged to the exam: only send the student there
              // when it has some, else a mock exam (which every runnable blueprint has).
              canReview ? (
                <Button label={`Review ${examLabel} topics`} onPress={() => router.push(`/practice/review/${target.slug}`)} fullWidth size="lg" />
              ) : (
                // The blueprint is runnable (that is how this diagnostic was built): straight to its prestart.
                <Button label="Take a mock exam" onPress={() => router.push(`/practice/exam/${target.slug}`)} fullWidth size="lg" />
              )
            ) : (
              // The UPCAT drill for the weakest subtest (all four when none was answered).
              <Button
                label={weakest ? `Practice weakest subject (${weakest})` : 'Practice all subjects'}
                onPress={() => router.push(`/practice/upcat/${weakest ? encodeURIComponent(weakest) : 'all'}?mode=quick`)}
                fullWidth
                size="lg"
              />
            )}
            <Button label="Back to Home" variant="secondary" fullWidth onPress={() => router.replace('/(tabs)')} />
          </View>
          )}
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
          passageText={q.passageText}
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
