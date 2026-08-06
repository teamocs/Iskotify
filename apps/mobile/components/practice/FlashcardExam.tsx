import { useState, useMemo, useRef, useEffect } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet, Share } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useDb } from '../../hooks/useDb'
import { submitQuestionReport } from '../../services/questionReports'
import { ReportQuestionModal } from './ReportQuestionModal'
import { useRecordSession } from '../../hooks/useRecordSession'
import { useRecordAttempts } from '../../hooks/useRecordAttempts'
import { useRecordProgress } from '../../hooks/useRecordProgress'
import { useRecordSrs } from '../../hooks/useRecordSrs'
import { QuestionNavigator } from '../upcat/QuestionNavigator'
import { QuestionCard } from './QuestionCard'
import { OptionList } from './OptionList'
import { ReviewCard } from './ReviewCard'
import { useTheme } from '../../theme/ThemeContext'
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
  const { theme: t, typo } = useTheme()
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
  useEffect(() => {
    timingRef.current = onIdxChange(timingRef.current, idx, Date.now())
  }, [idx])

  const s = useMemo(() => makeStyles(t, typo), [t, typo])

  // ── Empty guard ────────────────────────────────────────────────────────────
  if (questions.length === 0) {
    return (
      <SafeAreaView style={s.root}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={s.emptyTxt}>No questions available</Text>
          <Pressable style={[s.ghostBtn, { marginTop: 16 }]} onPress={onExit}>
            <Text style={s.ghostTxt}>← Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function submit() {
    if (submittedRef.current) return  // guard against double-submit (re-tap after a mid-submit failure)
    submittedRef.current = true
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
  if (phase === 'results') {
    const score = questions.filter((q, i) => answers[i] === q.answerIndex).length
    const pct = Math.round((score / questions.length) * 100)

    return (
      <SafeAreaView style={s.root}>
        <ScrollView
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={[s.scoreCard, pct >= 60 ? s.pass : s.fail]}>
            <Text style={[s.scorePct, { color: pct >= 60 ? t.success : t.accentText }]}>{pct}%</Text>
            <Text style={s.scoreVerdict}>{pct >= 60 ? '🎉 Great work' : '📚 Keep practicing'}</Text>
            <Text style={s.scoreSub}>
              {score}/{questions.length} correct
            </Text>
          </View>

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
            />
          ))}

          <Pressable
            style={s.primaryBtn}
            onPress={() => {
              setAnswers({})
              setIdx(0)
              setReported({})
              setPhase('exam')
              // New attempt on the same mounted instance: fresh sessionKey +
              // timing baseline so the retake's rows don't blend with the
              // previous run's (see attemptStartRef/timingRef declaration above).
              const now = Date.now()
              attemptStartRef.current = now
              timingRef.current = createTimingState(0, now)
              submittedRef.current = false
            }}
          >
            <Text style={s.primaryBtnTxt}>Retake exam</Text>
          </Pressable>

          <Pressable
            style={[s.primaryBtn, { marginTop: 8, backgroundColor: 'rgba(0,0,128,0.75)' }]}
            onPress={() =>
              void Share.share({ message: `I scored ${pct}% on ${title} in Iskotify! 🎓` })
            }
          >
            <Text style={s.primaryBtnTxt}>Share score</Text>
          </Pressable>

          <Pressable style={s.ghostBtn} onPress={onExit}>
            <Text style={s.ghostTxt}>← Back</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    )
  }

  // ── Exam screen ────────────────────────────────────────────────────────────
  const q = questions[idx]!
  const sel = answers[idx]
  const answeredIdxs = new Set(Object.keys(answers).map(Number))
  const isLast = idx === questions.length - 1

  return (
    <SafeAreaView style={s.root}>
      <View style={s.topBar}>
        <Pressable onPress={onExit} hitSlop={10}>
          <Text style={s.back}>‹</Text>
        </Pressable>
        <Text style={s.topTitle} numberOfLines={1}>
          {title}
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
        <QuestionCard
          questionText={q.stem}
          reported={reported[idx]}
          onReport={() => setReportIdx(idx)}
        />
        <OptionList options={q.options} selectedIndex={sel} onSelect={oi => setAnswers(a => ({ ...a, [idx]: oi }))} />
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
          style={[s.footBtnPrimary, sel === undefined && !isLast && s.footDisabled]}
          disabled={sel === undefined && !isLast}
          onPress={() => (isLast ? submit() : setIdx(i => i + 1))}
        >
          <Text style={s.footPrimaryTxt}>{isLast ? 'Submit' : 'Next'}</Text>
        </Pressable>
      </View>

      <ReportQuestionModal
        visible={reportIdx !== null}
        onClose={() => setReportIdx(null)}
        onSubmit={submitReport}
      />
    </SafeAreaView>
  )
}

function makeStyles(
  t: ReturnType<typeof import('../../theme/ThemeContext').useTheme>['theme'],
  typo: ReturnType<typeof import('../../theme/ThemeContext').useTheme>['typo'],
) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    emptyTxt: {
      color: t.textTertiary,
      textAlign: 'center',
      fontSize: typo.md,
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
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      gap: spacing.sm,
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
      color: t.textInverse,
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
    primaryBtn: {
      backgroundColor: 'rgba(128,0,0,0.85)',
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 8,
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
