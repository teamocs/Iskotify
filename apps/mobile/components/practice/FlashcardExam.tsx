import { useState, useRef, useEffect } from 'react'
import { View, Share } from 'react-native'
import { useDb } from '../../hooks/useDb'
import { submitQuestionReport } from '../../services/questionReports'
import { ReportQuestionModal } from './ReportQuestionModal'
import { useRecordSession } from '../../hooks/useRecordSession'
import { useRecordAttempts } from '../../hooks/useRecordAttempts'
import { useRecordProgress } from '../../hooks/useRecordProgress'
import { useRecordSrs } from '../../hooks/useRecordSrs'
import { QuestionCard } from './QuestionCard'
import { OptionList } from './OptionList'
import { ExamReviewSheet } from './ExamReviewSheet'
import { ResultsScoreCard } from './ResultsScoreCard'
import { QuestionNavPanel } from './QuestionNavPanel'
import { RunnerFrame } from './runner/RunnerFrame'
import { RunnerActions } from './runner/RunnerActions'
import { RunnerReview } from './runner/RunnerReview'
import { PracticeFocusHeader } from './runner/PracticeFocusHeader'
import { Screen } from '../ui/Screen'
import { PageTitle } from '../ui/PageTitle'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { FileQuestionOutlined } from '@lineiconshq/free-icons'
import { spacing } from '../../theme/tokens'
import type { QuizQuestion } from '../../utils/mcDistractors'
import { createTimingState, onIdxChange, finalizeTiming, type TimingState } from '../../utils/attemptTiming'
import { buildAttemptRows } from '../../utils/attemptRows'

type Phase = 'exam' | 'results'

export interface FlashcardExamProps {
  title: string
  questions: QuizQuestion[]
  listingSlug?: string
  subtest?: string
  /** Pass the launching topicId for single-topic quizzes so analytics groups correctly. */
  topicId?: string
  /** Pass the launching deckId (or '__full__'/'__weak__'/'__due__' sentinel) for deck quizzes. */
  deckId?: string
  onExit: () => void
}

export function FlashcardExam({ title, questions, listingSlug, subtest, topicId, deckId, onExit }: FlashcardExamProps) {
  const db = useDb()
  const { theme: t } = useTheme()
  // Redesign M3: navigator as a side panel on expanded widths, a sheet elsewhere.
  const expanded = useBreakpoint() === 'expanded'
  const { recordSession } = useRecordSession()
  const { recordAttempts } = useRecordAttempts()
  const { recordProgress } = useRecordProgress()
  const { recordSrs } = useRecordSrs()

  const [phase, setPhase] = useState<Phase>('exam')
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [reported, setReported] = useState<Record<number, boolean>>({})
  // Which question index the report modal is open for (null = closed).
  const [reportIdx, setReportIdx] = useState<number | null>(null)
  const startRef = useState(() => Date.now())[0]
  // Fix 2: last-question review sheet (never submits directly).
  const [reviewOpen, setReviewOpen] = useState(false)
  // Fix 3: "Review mistakes" (the results screen's primary action) opens the review.
  const [reviewMistakesTapped, setReviewMistakesTapped] = useState(false)

  // Task D: per-question timing + attempt sessionKey. Unlike the routed exam
  // screens (which remount on retake via router.replace), FlashcardExam is a
  // reused shared component — "Retake exam" resets phase/idx/answers on the
  // SAME instance, so attemptStartRef/timingRef need their own manual reset
  // there too (startRef above can't be reset: its setter was discarded).
  const attemptStartRef = useRef(startRef)
  const timingRef = useRef<TimingState>(createTimingState(0, startRef))
  // Finding #2: unlike the three routed exam engines, FlashcardExam previously
  // had NO double-submit guard at all — a failure mid-submit (e.g. the
  // recordAttempts insert rejecting) let a re-tap of Submit run the whole
  // sequence again, double-inserting attempt/progress rows. Reset alongside
  // attemptStartRef/timingRef on retake (same reasoning: reused instance,
  // not a remount).
  const submittedRef = useRef(false)
  // Disables the options and actions while submit() awaits, matching the
  // routed runners (see exam/[slug].tsx's submitting flag). Reset on retake.
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    timingRef.current = onIdxChange(timingRef.current, idx, Date.now())
  }, [idx])

  // ── Empty guard ────────────────────────────────────────────────────────────
  if (questions.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon={<Lineicons icon={FileQuestionOutlined} size={24} color={t.textSecondary} />}
          title="No questions available"
          body="There is nothing to practise in this set yet."
          actionLabel="Go back"
          onAction={onExit}
        />
      </Screen>
    )
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function submit() {
    if (submittedRef.current) return  // guard against double-submit (re-tap after a mid-submit failure)
    submittedRef.current = true
    setSubmitting(true)
    const score = questions.filter((q, i) => answers[i] === q.answerIndex).length

    // Task D: per-question attempt rows + the user_progress producer fix,
    // written before recordSession so they're committed before its
    // fire-and-forget backup push. answeredAt is shared across both writes
    // so they line up as "this run".
    const answeredAt = Date.now()
    const elapsedByIdx = finalizeTiming(timingRef.current, answeredAt)
    const rows = buildAttemptRows({
      sessionKey: attemptStartRef.current,
      sourceTable: 'flashcards',
      listingSlug: listingSlug ?? '',
      questions: questions.map((q, i) => ({
        questionId: q.id ?? String(i),
        correctIndex: q.answerIndex,
        subtest: subtest ?? null,
        topic: topicId ?? null,
      })),
      answers,
      elapsedByIdx,
      answeredAt,
    })
    // Finding #2: telemetry is best-effort — it must never gate the results
    // screen. submittedRef is already flipped above; if this insert rejects
    // (disk full, storage quota, etc.) the student must still reach results.
    try {
      await recordAttempts(rows)
    } catch (err) {
      console.warn('[FlashcardExam] recordAttempts failed:', err)
    }
    await recordProgress(questions.map((q, i) => ({
      flashcardId: q.id ?? String(i),
      correct: answers[i] === q.answerIndex,
      answeredAt,
    })))

    // Task H: SRS scheduling is derived bookkeeping, not the attempt record
    // itself (user_progress/question_attempts above already captured this
    // run) — fire-and-forget + error-isolated so a flashcard_srs write
    // failure can never strand the student behind the double-submit guard.
    // Same convention as recordSession below and useRecordAttempts's
    // fire-and-forget prune.
    void recordSrs(questions.map((q, i) => ({
      flashcardId: q.id ?? String(i),
      correct: answers[i] === q.answerIndex,
      elapsedMs: elapsedByIdx[i] ?? 0,
    }))).catch(err => console.warn('[FlashcardExam] recordSrs failed:', err))

    void recordSession({
      listingSlug: listingSlug ?? '',
      topicId: topicId ?? '',
      deckId: deckId ?? '',
      score,
      total: questions.length,
      startTime: startRef,
      subtest,
    })
    setSubmitting(false)
    setPhase('results')
  }

  // ── Report a question ──────────────────────────────────────────────────────
  function submitReport(reason: string) {
    const qi = reportIdx
    if (qi == null) return
    const rq = questions[qi]!
    // Offline-first: local queue write + best-effort upload (never throws to UI).
    void submitQuestionReport(db, {
      questionId: rq.id ?? String(qi),
      sourceTable: 'flashcards',
      questionText: rq.stem,
      reason,
    })
    setReported(r => ({ ...r, [qi]: true }))
    setReportIdx(null)
  }

  // ── Results screen ─────────────────────────────────────────────────────────
  // Redesign M3: a page (<Screen>), same as the mock exam runner's results.
  if (phase === 'results') {
    const score = questions.filter((q, i) => answers[i] === q.answerIndex).length
    const pct = Math.round((score / questions.length) * 100)

    return (
      <Screen>
        <View style={{ gap: spacing.xxl, paddingTop: spacing.lg }}>
          {/* Peak-end moment: warm, short, then the facts. Never a verdict. */}
          <PageTitle title="Tapos na! Quiz complete." lead={`Here is how ${title} went.`} />

          {/* Fix 3: one neutral card regardless of score — no pass/fail colouring. */}
          <ResultsScoreCard pct={pct} correct={score} total={questions.length} />

          <RunnerReview
            items={questions.map((q, i) => ({
              id: q.id ?? String(i),
              sectionName: title,
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
            expandAll={reviewMistakesTapped}
          />

          {/* Fix 3: "Review mistakes" is the primary action, "Retake" is secondary. */}
          <View style={{ gap: spacing.sm }}>
            <Button label="Review mistakes" onPress={() => setReviewMistakesTapped(true)} fullWidth size="lg" />
            <Button
              label="Retake exam"
              variant="secondary"
              fullWidth
              onPress={() => {
                setAnswers({})
                setIdx(0)
                setReported({})
                setReviewMistakesTapped(false)
                setPhase('exam')
                // New attempt on the same mounted instance: fresh sessionKey +
                // timing baseline so the retake's rows don't blend with the
                // previous run's (see attemptStartRef/timingRef declaration above).
                const now = Date.now()
                attemptStartRef.current = now
                timingRef.current = createTimingState(0, now)
                submittedRef.current = false
                setSubmitting(false)
              }}
            />
            <Button
              label="Share score"
              variant="secondary"
              fullWidth
              accessibilityLabel={`Share your score of ${pct} percent`}
              onPress={() => void Share.share({ message: `I scored ${pct}% on ${title} in Iskotify!` })}
            />
            <Button label="Go back" variant="ghost" fullWidth onPress={onExit} />
          </View>
        </View>
      </Screen>
    )
  }

  // ── Exam screen ────────────────────────────────────────────────────────────
  const q = questions[idx]!
  const sel = answers[idx]
  const answeredIdxs = new Set(Object.keys(answers).map(Number))
  const flaggedIdxs = new Set(Object.keys(reported).map(Number))
  const isLast = idx === questions.length - 1
  const jump = (i: number) => { if (!submitting) setIdx(i) }

  return (
    <RunnerFrame
      header={
        <PracticeFocusHeader
          title={title}
          position={idx + 1}
          total={questions.length}
          answered={answeredIdxs.size}
          onLeave={onExit}
          leaveLabel="Exit exam"
          onOpenOverview={expanded ? undefined : () => setReviewOpen(true)}
        />
      }
      question={
        <QuestionCard
          questionText={q.stem}
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
        // Fix 2: the last question never submits directly — it opens a review
        // sheet with an explicit, confirmed "Submit exam".
        <RunnerActions
          isLast={isLast}
          canGoBack={idx > 0}
          answered={sel !== undefined}
          submitting={submitting}
          onBack={() => setIdx(i => Math.max(0, i - 1))}
          onSkip={() => setIdx(i => i + 1)}
          onNext={() => setIdx(i => i + 1)}
          onReview={() => setReviewOpen(true)}
          labels={{
            back: 'Previous question',
            skip: 'Skip this question',
            next: 'Next question',
            review: 'Review answers before submitting',
          }}
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
        onSubmit={submitReport}
      />
    </RunnerFrame>
  )
}
