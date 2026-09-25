import { useState, useEffect, useMemo, useRef } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
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
import { readinessTone, type ReadinessTone } from '../../../utils/readinessTone'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { QuestionCard } from '../../../components/practice/QuestionCard'
import { OptionList } from '../../../components/practice/OptionList'
import { ReviewCard } from '../../../components/practice/ReviewCard'
import { PillButton } from '../../../components/ui/PillButton'
import { ScreenScroll } from '../../../components/ui/ScreenScroll'
import { WebTopSpacer } from '../../../components/ui/WebTopSpacer'
import { useWebContentWidth } from '../../../components/ui/webMaxWidth'
import { useTheme } from '../../../theme/ThemeContext'
import { spacing, radius, type Theme } from '../../../theme/tokens'
import { ExamReviewSheet } from '../../../components/practice/ExamReviewSheet'
import { usePreventLeave } from '../../../hooks/usePreventLeave'
import { useBeforeUnloadWarning } from '../../../hooks/useBeforeUnloadWarning'
import { useExamRunPersistence } from '../../../hooks/useExamRunPersistence'
import { confirmAction } from '../../../utils/confirmAction'
import { runKeyFor, reorderByIds, remapIndexedById, remapSingleIndex } from '../../../utils/examRunPersistence'
import { buildPreAssessFromUpcat, type UpcatLocalRow } from '../../../utils/preAssessmentSource'
import { PRE_ASSESS_QUESTIONS } from '../../../data/preAssessment'

type Phase = 'loading' | 'resume-prompt' | 'exam' | 'results'

const TONE_TO_BADGE: Record<ReadinessTone, 'success' | 'warning' | 'danger' | 'neutral'> = {
  strong: 'success', fair: 'warning', weak: 'danger', none: 'neutral',
}

const OVERALL_PCT_COLOR: Record<ReadinessTone, (t: Theme) => string> = {
  strong: t => t.success, fair: t => t.accentText, weak: t => t.danger, none: t => t.textTertiary,
}

function fmtTime(totalSecs: number): string {
  const m = Math.floor(totalSecs / 60)
  const sec = totalSecs % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

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
  const { theme: t, typo } = useTheme()
  const { recordSession } = useRecordSession()
  const { recordAttempts } = useRecordAttempts()
  const { saveRun, loadRun, clearRun } = useExamRunPersistence()

  const [phase, setPhase] = useState<Phase>('loading')
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
  const { height: winH } = useWindowDimensions()
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
      } catch {
        // Unexpected failure: show results (empty) rather than hang on loading
        setPhase('results')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, subjectParam])

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

  const s = useMemo(() => makeStyles(t, typo), [t, typo])

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

  if (phase === 'loading') {
    return (
      <SafeAreaView style={s.root}>
        <WebTopSpacer />
        <Text style={s.loading}>Loading diagnostic…</Text>
      </SafeAreaView>
    )
  }

  if (phase === 'resume-prompt') {
    return (
      <SafeAreaView style={s.root}>
        <WebTopSpacer />
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
          <Text style={s.title}>Resume where you left off?</Text>
          <Text style={s.emptyTxt}>You have an in-progress diagnostic. Your answers and timer were saved.</Text>
          <PillButton label="Resume where you left off" variant="primary" fullWidth onPress={resumeExam} />
          <PillButton label="Start over" variant="secondary" fullWidth onPress={startOver} />
        </View>
      </SafeAreaView>
    )
  }

  if (phase === 'results') {
    const score = scoreDiagnostic(questions, answers)
    const overallPct = score.overall.total ? Math.round((score.overall.correct / score.overall.total) * 100) : 0
    const weakest = weakestSubject(score.bySubject)
    const overallTone = readinessTone(score.overall.total ? overallPct : null)
    return (
      <SafeAreaView style={s.root}>
        <WebTopSpacer />
        <ScreenScroll tabBarInset={false}>
          <Text style={s.title}>Diagnostic results</Text>

          <Card padded elevated style={s.overallCard}>
            <Text style={[s.overallPct, { color: OVERALL_PCT_COLOR[overallTone](t) }]}>
              {overallPct}%
            </Text>
            <Text style={s.overallSub}>
              {score.overall.correct}/{score.overall.total} correct overall
            </Text>
          </Card>

          <Text style={s.sectionLbl}>Per-subject readiness</Text>
          {Object.entries(score.bySubject).map(([subject, b]) => {
            const pct = b.total ? Math.round((b.correct / b.total) * 100) : 0
            const tone = readinessTone(b.total ? pct : null)
            return (
              <View key={subject} style={s.subjectRow}>
                <Text style={s.subjectName}>{subject}</Text>
                <View style={s.subjectRight}>
                  <Text style={s.subjectScore}>{b.correct}/{b.total}</Text>
                  <Badge label={`${pct}%`} tone={TONE_TO_BADGE[tone]} />
                </View>
              </View>
            )
          })}
          {Object.keys(score.bySubject).length === 0 ? (
            <Text style={s.emptyTxt}>No questions were answered.</Text>
          ) : null}

          {questions.length > 0 ? (
            <>
              <Text style={s.sectionLbl}>Review</Text>
              {questions.map((q, i) => (
                <ReviewCard
                  key={q.id ?? i}
                  index={i + 1}
                  questionText={q.stem}
                  options={q.options}
                  correctIndex={q.answerIndex}
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
            </>
          ) : null}

          <View style={s.ctaGroup}>
            <PillButton
              label="Back to Home"
              variant="secondary"
              fullWidth
              onPress={() => router.replace('/(tabs)')}
            />
            <PillButton
              label={weakest ? `Practice weakest subject (${weakest})` : 'Practice weak subjects'}
              variant="primary"
              fullWidth
              onPress={() => router.push('/practice/review/upcat')}
            />
          </View>
        </ScreenScroll>
      </SafeAreaView>
    )
  }

  const q = questions[idx]!
  const sel = answers[idx]
  const isLast = idx === questions.length - 1

  return (
    <SafeAreaView style={s.root}>
      <WebTopSpacer />
      <View style={s.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Leave exam" onPress={() => router.back()} hitSlop={10}>
          <Text style={s.back}>‹</Text>
        </Pressable>
        <Text style={s.topTitle} numberOfLines={1}>
          {subjectParam ?? 'Diagnostic'}
        </Text>
        <View style={[s.timerPill, remaining <= 60 && s.timerPillLow]}>
          <Text style={[s.timerTxt, remaining <= 60 && s.timerTxtLow]}>⏱ {fmtTime(remaining)}</Text>
        </View>
        <Text style={s.counter}>
          {idx + 1}/{questions.length}
        </Text>
      </View>

      <ScrollView
        ref={qPaneRef}
        style={{ flex: 1 }}
        contentContainerStyle={[{ paddingBottom: spacing.lg }, webWidth]}
        showsVerticalScrollIndicator={false}
      >
        <QuestionCard
          questionText={q.stem}
          subjectTag={q.subject}
          imageUrl={q.imageUrl}
          imageAlt={q.imageAlt}
          imageWidth={q.imageWidth}
          imageHeight={q.imageHeight}
        />
      </ScrollView>

      {/* Fixed options zone: capped at 42% of the window so the question pane keeps
          the majority of the viewport; very long option lists scroll inside this zone. */}
      <ScrollView
        style={{ flexGrow: 0, maxHeight: winH * 0.42, marginTop: spacing.sm, marginBottom: spacing.sm }}
        contentContainerStyle={webWidth ?? undefined}
        showsVerticalScrollIndicator={false}
      >
        <OptionList
          options={q.options}
          selectedIndex={sel}
          onSelect={oi => { if (!submitting) setAnswers(a => ({ ...a, [idx]: oi })) }}
        />
      </ScrollView>

      <View style={s.footer}>
        <Pressable
          accessibilityRole="button"
          style={s.footBtnGhost}
          onPress={() => setIdx(i => Math.max(0, i - 1))}
          disabled={idx === 0 || submitting}
        >
          <Text style={[s.footGhostTxt, (idx === 0 || submitting) && { opacity: 0.3 }]}>Back</Text>
        </Pressable>
        {isLast ? (
          // Fix 2: the last question never submits directly anymore.
          <Pressable
            accessibilityRole="button"
            style={[s.footBtnPrimary, submitting && s.footDisabled]}
            disabled={submitting}
            onPress={() => setReviewOpen(true)}
          >
            <Text style={s.footPrimaryTxt}>Review & submit</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              style={s.footBtnGhost}
              onPress={() => setIdx(i => i + 1)}
              disabled={submitting}
            >
              <Text style={s.footGhostTxt}>Skip</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[s.footBtnPrimary, (sel === undefined || submitting) && s.footDisabled]}
              disabled={sel === undefined || submitting}
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
        answeredIdxs={new Set(Object.keys(answers).map(Number))}
        onJump={i => { if (!submitting) setIdx(i) }}
        onClose={() => setReviewOpen(false)}
        onSubmit={() => { setReviewOpen(false); void submit() }}
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
    title: {
      fontSize: typo.h3,
      fontWeight: '700',
      color: t.textPrimary,
      fontFamily: 'Outfit_700Bold',
      marginBottom: spacing.md,
    },
    overallCard: { alignItems: 'center', marginBottom: spacing.lg },
    overallPct: { fontSize: 52, fontWeight: '700', fontFamily: 'Outfit_700Bold' },
    overallSub: {
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
      fontFamily: 'Lexend_600SemiBold',
    },
    subjectRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: t.surface2,
      borderWidth: 1,
      borderColor: t.divider,
      borderRadius: 12,
      borderCurve: 'continuous',
      padding: spacing.md,
      marginBottom: 6,
    },
    subjectName: { fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_600SemiBold', flex: 1 },
    subjectRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    subjectScore: {
      fontSize: typo.sm,
      color: t.textSecondary,
      fontFamily: 'Lexend_600SemiBold',
    },
    emptyTxt: {
      fontSize: typo.sm,
      color: t.textTertiary,
      fontFamily: 'Lexend_400Regular',
      marginTop: spacing.sm,
    },
    ctaGroup: { marginTop: spacing.xl, gap: spacing.sm },
  })
}
