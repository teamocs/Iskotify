import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { useDb } from '../../../hooks/useDb'
import { subscribe } from '../../../services/queryCache'
import { useRecordSession } from '../../../hooks/useRecordSession'
import { useRecordAttempts } from '../../../hooks/useRecordAttempts'
import { loadAdmissionEstimateSnapshot, type AdmissionEstimateSnapshot } from '../../../hooks/useAdmissionEstimate'
import { estimateDeltaMessage } from '../../../utils/estimateDelta'
import { getExamBlueprint, getQuestionsByCategory, getAllPassages, getTargetCourseClusters, type ExamBlueprint, type BlueprintSection } from '../../../services/examBlueprints'
import {
  buildBlueprintExam, buildStudySprintExam, scoreBlueprintExam, filterCourseNotesByClusters,
  groupReviewBySection, sectionChipState, scaleBlueprintTiming, STUDY_SPRINT_MINUTES,
  type BuiltExam, type ReviewSection, type ScaledBlueprintTiming,
} from '../../../utils/examBuilder'
import { createTimingState, onIdxChange, finalizeTiming, type TimingState } from '../../../utils/attemptTiming'
import { buildAttemptRows } from '../../../utils/attemptRows'
import { prefetchSessionImages } from '../../../utils/prefetchQuestionImages'
import type { ExamQuestion, RawUpcatQuestion, RawUpcatPassage } from '../../../utils/upcatExam'
import { QuestionNavigator } from '../../../components/upcat/QuestionNavigator'
import { SectionGrid } from '../../../components/practice/SectionGrid'
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
import { useBeforeUnloadWarning } from '../../../hooks/useBeforeUnloadWarning'
import { useExamRunPersistence } from '../../../hooks/useExamRunPersistence'
import { confirmAction } from '../../../utils/confirmAction'
import { runKeyFor, reorderByIds, reconstructBuiltExamFromRun, remapIndexedById, remapSingleIndex } from '../../../utils/examRunPersistence'

type Phase = 'loading' | 'prestart' | 'empty' | 'exam' | 'results'

/** A flattened exam question that remembers which section it belongs to. */
interface FlatQuestion { q: ExamQuestion; sectionName: string }

function fmtTime(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const sec = totalSecs % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Section boundary: the flat index where this runnable section begins, plus its time budget. */
interface SectionBound { name: string; start: number; end: number; timeMinutes: number | null }

/** timing is null for the pre-scaling render pass, or when a section has no scaled
 *  entry — either way the declared (unscaled) section time is the correct fallback. */
function computeBounds(built: BuiltExam, timing: ScaledBlueprintTiming | null): SectionBound[] {
  const bounds: SectionBound[] = []
  let cursor = 0
  for (const bs of built.runnable) {
    const len = bs.questions.length
    const timeMinutes = timing?.sectionMinutes.get(bs.section.id) ?? bs.section.timeMinutes
    bounds.push({ name: bs.section.name, start: cursor, end: cursor + len, timeMinutes })
    cursor += len
  }
  return bounds
}

// ---------------------------------------------------------------------------
// Wave 3b: Review accordion — collapsed sections, wrong-answers-first
// ---------------------------------------------------------------------------

interface ReviewAccordionProps {
  reviewSections: ReviewSection[]
  questions: FlatQuestion[]
  answers: Record<number, number>
  styles: ReturnType<typeof makeStyles>
  /** Fix 3: "Review mistakes" is the results screen's primary action — it expands
   *  every section at once instead of making the student open each one by hand. */
  initiallyExpanded?: boolean
}

function ReviewAccordion({ reviewSections, questions, answers, styles: s, initiallyExpanded }: ReviewAccordionProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    initiallyExpanded ? Object.fromEntries(reviewSections.map(sec => [sec.sectionName, true])) : {},
  )

  function toggle(name: string) {
    setExpanded(prev => ({ ...prev, [name]: !prev[name] }))
  }

  return (
    <View>
      {reviewSections.map(sec => {
        const isOpen = !!expanded[sec.sectionName]
        const secPct = sec.total > 0 ? Math.round((sec.correct / sec.total) * 100) : 0
        return (
          <View key={sec.sectionName} style={s.reviewSectionWrap}>
            <Pressable
              style={s.reviewSectionHeader}
              onPress={() => toggle(sec.sectionName)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              hitSlop={8}
            >
              <View style={s.reviewSectionHeaderLeft}>
                <Text style={s.reviewSectionName}>{sec.sectionName}</Text>
                <Text style={s.reviewSectionCount}>{sec.correct}/{sec.total} correct · {secPct}%</Text>
              </View>
              <Text style={s.reviewSectionChevron}>{isOpen ? '▲' : '▼'}</Text>
            </Pressable>
            {isOpen ? (
              <View style={s.reviewSectionBody}>
                {sec.questionRefs.map(ref => {
                  const fq = questions[ref.flatIndex]
                  if (!fq) return null
                  const q = fq.q
                  return (
                    <ReviewCard
                      key={q.questionId}
                      index={ref.flatIndex + 1}
                      questionText={q.questionText}
                      options={q.options}
                      correctIndex={q.correctIndex}
                      selectedIndex={answers[ref.flatIndex]}
                      explanation={q.explanation}
                      optionExplanations={q.optionExplanations}
                      strategyTip={q.strategyTip}
                      imageUrl={q.imageUrl}
                      imageAlt={q.imageAlt}
                      imageWidth={q.imageWidth}
                      imageHeight={q.imageHeight}
                    />
                  )
                })}
              </View>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

export default function BlueprintExam() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const db = useDb()
  const { theme: t, typo } = useTheme()
  const { recordSession } = useRecordSession()
  const { recordAttempts } = useRecordAttempts()
  const { saveRun, loadRun, clearRun } = useExamRunPersistence()

  const [phase, setPhase] = useState<Phase>('loading')
  const [blueprint, setBlueprint] = useState<ExamBlueprint | null>(null)
  const [built, setBuilt] = useState<BuiltExam | null>(null)
  // 'full' (default, loaded at prestart) or 'sprint' once Study Sprint is started —
  // gates sectionBlocked (Sprint always runs a single fixed 30-min timer, never
  // per-section locks) and which sample rebuilds `built`/`questions` on start.
  const [examMode, setExamMode] = useState<'full' | 'sprint'>('full')
  const [courseClusters, setCourseClusters] = useState<string[]>([])
  const [questions, setQuestions] = useState<FlatQuestion[]>([])
  // Raw question pools + passages from the last load, kept for Study Sprint's
  // on-demand rebuild (buildStudySprintExam samples fewer items per section
  // than the full mock already shown on the prestart card).
  const poolsRef = useRef<Map<string, RawUpcatQuestion[]>>(new Map())
  const passagesRef = useRef<RawUpcatPassage[]>([])
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  // Question-report state: which indexes were reported + which index the modal is open for.
  const [reported, setReported] = useState<Record<number, boolean>>({})
  const [reportIdx, setReportIdx] = useState<number | null>(null)
  const startRef = useState(() => Date.now())[0]
  // Post-session Estimated Admission Score delta — UPCAT-only (the estimator
  // is UPCAT-specific); null for every other blueprint slug.
  const [scoreDelta, setScoreDelta] = useState<string | null>(null)
  // Fix 2: last-question review sheet (never submits directly).
  const [reviewOpen, setReviewOpen] = useState(false)
  // Fix 3: "Review mistakes" expands every review section at once.
  const [reviewMistakesTapped, setReviewMistakesTapped] = useState(false)
  // Fix 1: leave-confirmation + resume-in-progress-run state.
  const [leaveConfirmed, setLeaveConfirmed] = useState(false)
  const [resumeAvailable, setResumeAvailable] = useState(false)
  const savedRunRef = useRef<Awaited<ReturnType<typeof loadRun>>>(null)
  // Review finding #2: true from the first synchronous line of submit()
  // until the screen leaves 'exam' phase — disables exam inputs so a tap
  // during submit()'s awaits can't change answers/idx and re-trigger the
  // persistence effect below (which also re-checks submittedRef itself, as
  // a second line of defense against anything that isn't gated by this).
  const [submitting, setSubmitting] = useState(false)

  // Countdown timer. endTime is an absolute timestamp so the clock stays accurate even
  // if the interval drifts. The total timer always runs; per-section timers run when
  // the blueprint is section-blocked.
  const [endTime, setEndTime] = useState<number | null>(null)
  const [remaining, setRemaining] = useState(0)
  // Section lock state: which runnable section the user is currently in (index into bounds),
  // its absolute end timestamp, and remaining seconds. Only used when sectionBlocked.
  const [sectionIdx, setSectionIdx] = useState(0)
  const [sectionEndTime, setSectionEndTime] = useState<number | null>(null)
  const [sectionRemaining, setSectionRemaining] = useState(0)
  // Lowest flat index the user is still allowed to navigate back to (raised as sections expire).
  const [floorIdx, setFloorIdx] = useState(0)
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

  // Per-question timing (Task D): starts once the exam actually begins (not
  // during 'prestart' dwell time), then accumulates elapsed ms per flat index
  // as idx changes — revisits (navigating back) add onto the same index's
  // running total rather than overwriting it. Read at submit() via finalizeTiming.
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

  // Timer scaling (Task 4): when a thin question pool sampled fewer questions than
  // the blueprint declares, scale the total + per-section time budgets down by the
  // same ratio rather than running the full declared clock against a short exam.
  const timing = useMemo(
    () => (blueprint && built ? scaleBlueprintTiming(blueprint, built) : null),
    [blueprint, built],
  )
  const bounds = useMemo(() => (built ? computeBounds(built, timing) : []), [built, timing])
  const sectionBlocked = examMode === 'full' && !!blueprint?.sectionBlocked && bounds.length > 0

  // B2: section chip state — recomputed whenever idx, floorIdx, or sectionBlocked changes.
  const sectionChips = useMemo(
    () => sectionChipState(bounds, idx, floorIdx, sectionBlocked),
    [bounds, idx, floorIdx, sectionBlocked],
  )

  const examLoadedRef = useRef(false)

  const loadExam = useCallback(async () => {
    try {
      const bp = await getExamBlueprint(db, slug)
      if (!bp) { setQuestions([]); setBuilt(null); setPhase('empty'); return }
      const cats = Array.from(new Set(bp.sections.map(s => s.skillCategory)))
      const [pools, passages, clusters] = await Promise.all([getQuestionsByCategory(db, cats), getAllPassages(db), getTargetCourseClusters(db)])
      poolsRef.current = pools; passagesRef.current = passages
      const b = buildBlueprintExam(bp, pools, passages)
      const flat: FlatQuestion[] = b.runnable.flatMap(bs => bs.questions.map(q => ({ q, sectionName: bs.section.name })))
      setExamMode('full')
      setBlueprint(bp); setBuilt(b); setQuestions(flat); setCourseClusters(clusters)
      prefetchSessionImages(flat.map(f => f.q)) // fire-and-forget; never blocks session start
      if (flat.length) examLoadedRef.current = true
      setPhase(flat.length ? 'prestart' : 'empty')
    } catch {
      // Unexpected failure: show the empty/back screen rather than hang on loading.
      setPhase('empty')
    }
  }, [db, slug])

  useEffect(() => { void loadExam() }, [loadExam])

  // Fix 1: once the exam is loaded (prestart), check for a saved in-progress
  // run for this blueprint so the prestart screen can offer "Resume".
  useEffect(() => {
    if (phase !== 'prestart' || !slug) return
    let cancelled = false
    void loadRun(runKeyFor('exam', slug)).then(run => {
      if (cancelled) return
      if (run && run.questionIds.length > 0) {
        savedRunRef.current = run
        setResumeAvailable(true)
      }
    })
    return () => { cancelled = true }
  }, [phase, slug, loadRun])

  // Fix 1: persist answers/position/timers on every change while the run is
  // in progress — cleared on submit (see submit()). Best-effort: a save
  // failure must never interrupt the exam.
  // Review finding #2: also gated on submittedRef — submit() stays in phase
  // 'exam' through its awaits, so without this check a state change during
  // that window (blocked at the input layer by `submitting`, but checked
  // here too as a second line of defense) would re-insert the row right
  // after clearRun() fired, resurrecting a finished run as in-progress.
  useEffect(() => {
    if (phase !== 'exam' || !slug || questions.length === 0 || submittedRef.current) return
    void saveRun({
      runKey: runKeyFor('exam', slug),
      kind: 'exam',
      slug,
      mode: examMode,
      questionIds: questions.map(fq => fq.q.questionId),
      sectionNames: questions.map(fq => fq.sectionName),
      answers,
      idx,
      sectionIdx,
      floorIdx,
      endTime,
      sectionEndTime,
      startedAt: startRef,
    }).catch(err => console.warn('[exam/[slug]] saveRun failed:', err))
  }, [phase, slug, examMode, questions, answers, idx, sectionIdx, floorIdx, endTime, sectionEndTime, startRef, saveRun])

  // Fix 1: leave-confirmation — guards the back gesture, the Android hardware
  // back button, and the explicit ‹ button (all the same "remove this screen"
  // action) behind a confirmation while a run is in progress.
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

  /** Fix 1: rebuild the exact previously-sampled question set from the saved
   *  run's question ids (re-fetching the current pool + passages, already
   *  loaded by loadExam), then jump straight into 'exam' with the saved
   *  answers/position/timers restored. Absolute timestamps mean the existing
   *  countdown effects below correctly auto-advance/auto-submit any section
   *  that fully expired while the app was closed — no special-casing needed. */
  function resumeExam() {
    const run = savedRunRef.current
    if (!blueprint || !run) return
    const allRaw = Array.from(poolsRef.current.values()).flat()
    const orderedRaw = reorderByIds<RawUpcatQuestion, 'questionId'>(allRaw, run.questionIds, 'questionId')
    if (orderedRaw.length === 0) {
      // Nothing left to resume (e.g. every sampled question was unpublished since).
      void clearRun(run.runKey)
      setResumeAvailable(false)
      return
    }
    const passageById = new Map(passagesRef.current.map(p => [p.setId, p.passageText]))
    const sectionByQuestionId = new Map(run.questionIds.map((id, i) => [id, run.sectionNames[i] ?? '']))
    const flat: FlatQuestion[] = orderedRaw.map(q => ({
      q: { ...q, passageText: q.setId ? (passageById.get(q.setId) ?? null) : null },
      sectionName: sectionByQuestionId.get(q.questionId) ?? '',
    }))
    setBuilt(reconstructBuiltExamFromRun<BlueprintSection, ExamQuestion>(blueprint.sections, flat))
    setExamMode(run.mode === 'sprint' ? 'sprint' : 'full')
    setQuestions(flat)
    // Review finding #1: reorderByIds compacts away vanished questions, so
    // answers/idx/floorIdx saved against the ORIGINAL id order must be
    // remapped through the surviving order — not applied at their old
    // positions, which would land on the wrong question.
    const newIds = flat.map(fq => fq.q.questionId)
    setAnswers(remapIndexedById(run.questionIds, newIds, run.answers))
    setIdx(remapSingleIndex(run.questionIds, newIds, run.idx))
    setFloorIdx(remapSingleIndex(run.questionIds, newIds, run.floorIdx))
    setSectionIdx(run.sectionIdx)
    setEndTime(run.endTime)
    setSectionEndTime(run.sectionEndTime)
    setPhase('exam')
  }

  // Web: if the screen loaded before the fire-and-forget catalog sync delivered
  // blueprints/questions, it would be stuck on 'empty'. Re-load when the practice
  // cache refreshes (post-sync), but only while still empty — never mid-exam.
  useEffect(() => {
    const unsub = subscribe('practice:', () => { if (!examLoadedRef.current) void loadExam() })
    return unsub
  }, [loadExam])

  const s = useMemo(() => makeStyles(t, typo), [t, typo])

  const visibleNotes = useMemo(
    () => blueprint ? filterCourseNotesByClusters(blueprint.courseNotes, courseClusters) : [],
    [blueprint, courseClusters],
  )

  // --- Start the exam: arm the total timer (and the first section timer if blocked).
  //     'full' reuses the sample already built at load (scaled timing per `timing`).
  //     'sprint' rebuilds a smaller, 30-min-fixed sample from the same raw pools and
  //     never section-locks (examMode gates `sectionBlocked` above). ---
  function startExam(mode: 'full' | 'sprint') {
    if (!blueprint) return
    setExamMode(mode)
    const now = Date.now()

    if (mode === 'sprint') {
      const sprintBuilt = buildStudySprintExam(blueprint, poolsRef.current, passagesRef.current, STUDY_SPRINT_MINUTES)
      const flat: FlatQuestion[] = sprintBuilt.runnable.flatMap(bs => bs.questions.map(q => ({ q, sectionName: bs.section.name })))
      setBuilt(sprintBuilt); setQuestions(flat)
      prefetchSessionImages(flat.map(f => f.q)) // fire-and-forget; never blocks session start
      setIdx(0); setFloorIdx(0)
      setEndTime(now + STUDY_SPRINT_MINUTES * 60_000)
      setPhase('exam')
      return
    }

    const totalMinutes = timing?.totalMinutes ?? blueprint.totalTimeMinutes
    setEndTime(now + totalMinutes * 60_000)
    if (blueprint.sectionBlocked && bounds.length > 0) {
      const first = bounds[0]!
      setSectionIdx(0)
      setIdx(first.start)
      setFloorIdx(first.start)
      setSectionEndTime(now + (first.timeMinutes ?? totalMinutes) * 60_000)
    }
    setPhase('exam')
  }

  async function submit() {
    if (submittedRef.current) return  // guard against double-submit (timer + tap)
    submittedRef.current = true
    // Review finding #2: disable exam inputs immediately — closes the window
    // where a tap during submit()'s awaits could change answers/idx and
    // re-trigger the (now also submittedRef-gated) persistence effect.
    setSubmitting(true)

    // Fix 1: the run is finished — clear the saved in-progress state so the
    // prestart screen stops offering "Resume" for a completed attempt.
    // Best-effort: must never block reaching results. Runs after submittedRef
    // is already true, so the save effect above will no-op even if something
    // still manages to change state before results render.
    if (slug) void clearRun(runKeyFor('exam', slug)).catch(err => console.warn('[exam/[slug]] clearRun failed:', err))

    // Post-session delta — UPCAT only. Snapshot before this session's
    // attempts are written; best-effort, must never block reaching results.
    const isUpcat = slug === 'upcat'
    let beforeEstimate: AdmissionEstimateSnapshot | null = null
    if (isUpcat) {
      try {
        beforeEstimate = await loadAdmissionEstimateSnapshot(db)
      } catch (err) {
        console.warn('[exam/[slug]] pre-session estimate snapshot failed:', err)
      }
    }

    if (blueprint) {
      // Group raw correct/total by section for the gamification record.
      const bySection = new Map<string, { correct: number; total: number }>()
      questions.forEach((fq, i) => {
        const cur = bySection.get(fq.sectionName) ?? { correct: 0, total: 0 }
        cur.total++
        if (answers[i] === fq.q.correctIndex) cur.correct++
        bySection.set(fq.sectionName, cur)
      })

      // Task D: per-question attempt rows, written before recordSession so
      // they're committed before recordSession's fire-and-forget backup push.
      const elapsedByIdx = timingRef.current ? finalizeTiming(timingRef.current, Date.now()) : {}
      const rows = buildAttemptRows({
        sessionKey: startRef,
        sourceTable: 'upcat_questions',
        listingSlug: slug,
        questions: questions.map(fq => ({
          questionId: fq.q.questionId,
          correctIndex: fq.q.correctIndex,
          subtest: fq.sectionName,
          topic: fq.q.topic ?? null,
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
        console.warn('[exam/[slug]] recordAttempts failed:', err)
      }

      for (const [section, b] of bySection) {
        void recordSession({
          listingSlug: slug,
          topicId: '',
          deckId: '',
          score: b.correct,
          total: b.total,
          startTime: startRef,
          subtest: section,
        })
      }
    }

    if (isUpcat) {
      try {
        const afterEstimate = await loadAdmissionEstimateSnapshot(db)
        setScoreDelta(estimateDeltaMessage(beforeEstimate, afterEstimate))
      } catch (err) {
        console.warn('[exam/[slug]] post-session estimate snapshot failed:', err)
      }
    }

    setPhase('results')
  }
  submitRef.current = submit  // keep the timer's auto-submit pointed at the latest closure

  // --- Total countdown tick: auto-submits at zero. ---
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

  // --- Per-section countdown tick (section-blocked exams only). On expiry, lock the
  //     current section and advance into the next; expiry of the last section submits. ---
  useEffect(() => {
    if (phase !== 'exam' || !sectionBlocked || sectionEndTime == null) return
    const tick = () => {
      const rem = Math.max(0, Math.round((sectionEndTime - Date.now()) / 1000))
      setSectionRemaining(rem)
      if (rem <= 0) {
        const next = sectionIdx + 1
        if (next >= bounds.length) { submitRef.current(); return }
        const nb = bounds[next]!
        setSectionIdx(next)
        setIdx(nb.start)
        setFloorIdx(nb.start)
        setSectionEndTime(Date.now() + (nb.timeMinutes ?? 0) * 60_000)
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [phase, sectionBlocked, sectionEndTime, sectionIdx, bounds])

  if (phase === 'loading') {
    return (
      <SafeAreaView style={s.root}>
        <WebTopSpacer />
        <Text style={s.loading}>Loading exam…</Text>
      </SafeAreaView>
    )
  }

  if (phase === 'empty') {
    return (
      <SafeAreaView style={s.root}>
        <WebTopSpacer />
        <ScrollView contentContainerStyle={[{ padding: 14, paddingBottom: 40 }, webWidth]} showsVerticalScrollIndicator={false}>
          <Text style={s.emptyTitle}>{blueprint?.name ?? 'Mock Exam'}</Text>
          <Text style={s.emptyBody}>This exam's questions are being authored — check back soon.</Text>
          <Pressable accessibilityRole="button" style={s.ghostBtn} onPress={() => router.back()}>
            <Text style={s.ghostTxt}>← Back</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    )
  }

  if (phase === 'prestart' && blueprint && built) {
    const hours = Math.round((blueprint.totalTimeMinutes / 60) * 10) / 10
    const scaledMinutes = timing?.totalMinutes ?? blueprint.totalTimeMinutes
    const scaledHours = Math.round((scaledMinutes / 60) * 10) / 10
    const isScaled = scaledMinutes !== blueprint.totalTimeMinutes
    const runnableNames = new Set(built.runnable.map(b => b.section.name))
    return (
      <SafeAreaView style={s.root}>
        <WebTopSpacer />
        <View style={s.topBar}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10}>
            <Text style={s.back}>‹</Text>
          </Pressable>
          <Text style={s.topTitle} numberOfLines={1}>{blueprint.name}</Text>
        </View>
        <ScrollView contentContainerStyle={[{ padding: 14, paddingBottom: 40 }, webWidth]} showsVerticalScrollIndicator={false}>
          <View style={s.metaCard}>
            <Text style={s.metaBig}>{blueprint.totalItems} items · {hours}h</Text>
            <Text style={s.metaSub}>{built.totalQuestions} items available now</Text>
            {isScaled ? (
              <Text style={s.metaSub}>Full Mock timer today: {scaledHours}h (scaled to available items)</Text>
            ) : null}
          </View>

          {blueprint.mechanicsNote ? (
            <View style={s.noteCard}>
              <Text style={s.noteTxt}>{blueprint.mechanicsNote}</Text>
            </View>
          ) : null}

          {blueprint.hasGuessingPenalty ? (
            <View style={s.warnCard}>
              <Text style={s.warnTitle}>⚠ Guessing penalty</Text>
              <Text style={s.warnTxt}>
                Wrong answers deduct {blueprint.guessingPenalty}; blanks are 0. Only answer when reasonably sure.
              </Text>
            </View>
          ) : null}

          <Text style={s.sectionLbl}>Structure</Text>
          {[...blueprint.sections].sort((a, b) => a.displayOrder - b.displayOrder).map(sec => {
            const live = runnableNames.has(sec.name)
            const secMinutes = timing?.sectionMinutes.get(sec.id) ?? sec.timeMinutes
            return (
              <View key={sec.id} style={[s.structRow, !live && s.structRowSoon]}>
                <Text style={[s.structName, !live && s.structSoonTxt]}>{sec.name}</Text>
                <Text style={[s.structCount, !live && s.structSoonTxt]}>
                  {live ? `${sec.itemCount} items${sectionBlocked && secMinutes ? ` · ${secMinutes}m` : ''}` : 'Content coming soon'}
                </Text>
              </View>
            )
          })}

          {visibleNotes.length ? (
            <>
              <Text style={s.sectionLbl}>
                {courseClusters.length > 0 && visibleNotes.length < blueprint.courseNotes.length
                  ? 'Cut-offs for your courses'
                  : 'Course cut-offs'}
              </Text>
              {visibleNotes.map((cn, i) => (
                <View key={`${cn.courseCluster}-${i}`} style={s.courseNote}>
                  <Text style={s.courseCluster}>{cn.courseCluster}</Text>
                  <Text style={s.courseNoteTxt}>{cn.note}</Text>
                </View>
              ))}
            </>
          ) : null}

          {resumeAvailable ? (
            <Pressable accessibilityRole="button" style={s.primaryBtn} onPress={resumeExam}>
              <Text style={s.primaryBtnTxt}>Resume where you left off</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            style={[resumeAvailable ? s.sprintBtn : s.primaryBtn, built.totalQuestions === 0 && s.footDisabled]}
            disabled={built.totalQuestions === 0}
            onPress={() => startExam('full')}
          >
            <Text style={resumeAvailable ? s.sprintBtnTxt : s.primaryBtnTxt}>Full Mock</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={[s.sprintBtn, built.totalQuestions === 0 && s.footDisabled]}
            disabled={built.totalQuestions === 0}
            onPress={() => startExam('sprint')}
          >
            <Text style={s.sprintBtnTxt}>Study Sprint · {STUDY_SPRINT_MINUTES} min</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    )
  }

  if (phase === 'results' && blueprint) {
    const correct = questions.reduce((n, fq, i) => n + (answers[i] === fq.q.correctIndex ? 1 : 0), 0)
    const wrong = questions.reduce((n, fq, i) => n + (answers[i] !== undefined && answers[i] !== fq.q.correctIndex ? 1 : 0), 0)
    const total = questions.length
    const score = scoreBlueprintExam(total, correct, wrong, blueprint.hasGuessingPenalty, blueprint.guessingPenalty)
    const pct = total ? Math.round((correct / total) * 100) : 0

    // Per-section raw breakdown.
    const bySection = new Map<string, { correct: number; total: number }>()
    questions.forEach((fq, i) => {
      const cur = bySection.get(fq.sectionName) ?? { correct: 0, total: 0 }
      cur.total++
      if (answers[i] === fq.q.correctIndex) cur.correct++
      bySection.set(fq.sectionName, cur)
    })

    // Wave 3b: grouped review sections with wrong-first ordering
    const correctIndexes = questions.map(fq => fq.q.correctIndex)
    const reviewSections = groupReviewBySection(questions, answers, correctIndexes)

    return (
      <SafeAreaView style={s.root}>
        <WebTopSpacer />
        <ScrollView contentContainerStyle={[{ padding: 14, paddingBottom: 40 }, webWidth]} showsVerticalScrollIndicator={false}>
          {/* Fix 3: one neutral card regardless of score — no pass/fail colouring,
              no percentile, no cut-off verdict. */}
          <ResultsScoreCard pct={pct} correct={correct} total={total} />
          {blueprint.hasGuessingPenalty ? (
            <Text style={s.scorePenalty}>Penalty-adjusted: {Math.round(score.adjusted * 100) / 100}</Text>
          ) : null}

          {scoreDelta ? (
            <View style={s.deltaCard}>
              <Text style={s.deltaText}>{scoreDelta}</Text>
            </View>
          ) : null}

          <Text style={s.sectionLbl}>Per-section</Text>
          {Array.from(bySection.entries()).map(([name, b]) => (
            <View key={name} style={s.subtestRow}>
              <Text style={s.subtestName}>{name}</Text>
              <Text style={s.subtestScore}>
                {b.correct}/{b.total} · {Math.round((b.correct / b.total) * 100)}%
              </Text>
            </View>
          ))}

          {visibleNotes.length > 0 ? (
            <>
              <Text style={s.sectionLbl}>Course cut-off context</Text>
              {visibleNotes.map((cn, i) => (
                <View key={`note-${cn.courseCluster}-${i}`} style={s.courseNote}>
                  <Text style={s.courseCluster}>{cn.courseCluster}</Text>
                  <Text style={s.courseNoteTxt}>{cn.note}</Text>
                </View>
              ))}
            </>
          ) : null}

          {/* Wave 3b: Review grouped by section, collapsed accordion, wrong-answers-first */}
          <Text style={s.sectionLbl}>Review</Text>
          <ReviewAccordion
            key={reviewMistakesTapped ? 'expanded' : 'collapsed'}
            reviewSections={reviewSections}
            questions={questions}
            answers={answers}
            styles={s}
            initiallyExpanded={reviewMistakesTapped}
          />

          {blueprint.scoringNote ? <Text style={s.footnote}>{blueprint.scoringNote}</Text> : null}

          {/* Fix 3: "Review mistakes" is the primary action, "Retake" is secondary. */}
          <Pressable accessibilityRole="button" style={s.primaryBtn} onPress={() => setReviewMistakesTapped(true)}>
            <Text style={s.primaryBtnTxt}>Review mistakes</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={s.ghostBtn} onPress={() => router.replace(`/practice/exam/${slug}`)}>
            <Text style={s.ghostTxt}>Retake exam</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={s.ghostBtn} onPress={() => router.replace('/practice/exam')}>
            <Text style={s.ghostTxt}>← Back to exams</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    )
  }

  // --- exam phase ---
  const fq = questions[idx]
  if (!fq) {
    return (
      <SafeAreaView style={s.root}>
        <WebTopSpacer />
        <Text style={s.loading}>Loading exam…</Text>
      </SafeAreaView>
    )
  }
  const q = fq.q
  const sel = answers[idx]
  const answeredIdxs = new Set(Object.keys(answers).map(Number))
  const isLast = idx === questions.length - 1
  const canGoBack = idx > floorIdx

  return (
    <SafeAreaView style={s.root}>
      <WebTopSpacer />
      <View style={s.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Leave exam" onPress={() => router.back()} hitSlop={10}>
          <Text style={s.back}>‹</Text>
        </Pressable>
        <Text style={s.topTitle} numberOfLines={1}>
          {sectionBlocked ? fq.sectionName : (blueprint?.name ?? 'Mock Exam')}
        </Text>
        {sectionBlocked ? (
          <View style={[s.timerPill, sectionRemaining <= 60 && s.timerPillLow]}>
            <Text style={[s.timerTxt, sectionRemaining <= 60 && s.timerTxtLow]}>⏱ {fmtTime(sectionRemaining)}</Text>
          </View>
        ) : null}
        <View style={[s.timerPill, remaining <= 60 && s.timerPillLow]}>
          <Text style={[s.timerTxt, remaining <= 60 && s.timerTxtLow]}>{sectionBlocked ? 'Σ ' : '⏱ '}{fmtTime(remaining)}</Text>
        </View>
        <Text style={s.counter}>{idx + 1}/{questions.length}</Text>
      </View>

      <QuestionNavigator total={questions.length} currentIdx={idx} answeredIdxs={answeredIdxs} onJump={i => { if (!submitting && i >= floorIdx) setIdx(i) }} />

      <SectionGrid sections={sectionChips} onJump={start => { if (!submitting) setIdx(Math.max(start, floorIdx)) }} />

      {/* Subject/topic bar lives in the fixed header zone with a fixed min height so it
          never mounts/unmounts (and never shifts layout) between questions. */}
      <View style={s.subjectBar}>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={s.subjectBarText}>
          {fq.q.mainSubject || fq.sectionName ? (
            <Text style={s.subjectBold}>{fq.q.mainSubject ? fq.q.mainSubject : fq.sectionName}</Text>
          ) : (
            <Text style={s.subjectBold}>{''}</Text>
          )}
          {fq.q.topic ? <Text style={s.subjectTopic}>{` · ${fq.q.topic}`}</Text> : null}
        </Text>
      </View>

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
          onPress={() => setIdx(i => Math.max(floorIdx, i - 1))}
          disabled={!canGoBack || submitting}
        >
          <Text style={[s.footGhostTxt, (!canGoBack || submitting) && { opacity: 0.3 }]}>Back</Text>
        </Pressable>
        {isLast ? (
          // Fix 2: the last question never submits directly anymore — it opens
          // a review sheet listing every question's answered/unanswered state,
          // with an explicit "Submit exam" confirmation inside it.
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
        answeredIdxs={answeredIdxs}
        flaggedIdxs={new Set(Object.keys(reported).map(Number))}
        onJump={i => { if (!submitting && i >= floorIdx) setIdx(i) }}
        onClose={() => setReviewOpen(false)}
        onSubmit={() => { setReviewOpen(false); void submit() }}
      />

      <ReportQuestionModal
        visible={reportIdx !== null}
        onClose={() => setReportIdx(null)}
        onSubmit={(reason) => {
          const qi = reportIdx
          if (qi == null) return
          const rq = questions[qi]?.q
          if (rq) {
            // Blueprint questions come from upcat_questions; offline-first, never throws.
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
    loading: { color: t.textTertiary, textAlign: 'center', marginTop: 80, fontFamily: 'Lexend_400Regular' },
    emptyTitle: { fontSize: typo.xl, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginTop: 40, marginBottom: 10, textAlign: 'center' },
    emptyBody: { fontSize: typo.md, color: t.textSecondary, fontFamily: 'Lexend_400Regular', textAlign: 'center', lineHeight: 22 },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 8 },
    back: { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
    topTitle: { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    counter: { fontSize: typo.sm, fontWeight: '700', color: t.accentText, fontFamily: 'Lexend_600SemiBold' },
    timerPill: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
    timerPillLow: { backgroundColor: t.dangerSurface, borderColor: 'rgba(239,68,68,0.35)' },
    timerTxt: { fontSize: typo.xs, fontWeight: '700', color: t.textSecondary, fontFamily: 'Outfit_700Bold', fontVariant: ['tabular-nums'] },
    timerTxtLow: { color: t.danger },
    metaCard: {
      backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 20, borderCurve: 'continuous',
      padding: 18, marginBottom: spacing.md, alignItems: 'center',
    },
    metaBig: { fontSize: typo.xl, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    metaSub: { fontSize: typo.sm, color: t.textTertiary, marginTop: 4, fontFamily: 'Lexend_400Regular' },
    noteCard: {
      backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 14, borderCurve: 'continuous',
      padding: 14, marginBottom: spacing.md,
    },
    noteTxt: { fontSize: typo.sm, color: t.textSecondary, lineHeight: 20, fontFamily: 'Lexend_400Regular' },
    warnCard: {
      backgroundColor: t.dangerSurface, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
      borderRadius: 14, borderCurve: 'continuous', padding: 14, marginBottom: spacing.md,
    },
    warnTitle: { fontSize: typo.sm, fontWeight: '700', color: t.danger, fontFamily: 'Outfit_700Bold', marginBottom: 4 },
    warnTxt: { fontSize: typo.sm, color: t.textSecondary, lineHeight: 20, fontFamily: 'Lexend_400Regular' },
    structRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: t.surface, borderWidth: 1, borderColor: t.divider, borderRadius: 12, borderCurve: 'continuous',
      padding: spacing.md, marginBottom: 6,
    },
    structRowSoon: { backgroundColor: t.surface2, opacity: 0.6 },
    structName: { fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_600SemiBold' },
    structCount: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
    structSoonTxt: { color: t.textTertiary, fontStyle: 'italic' },
    courseNote: {
      backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 12, borderCurve: 'continuous',
      padding: spacing.md, marginBottom: 6,
    },
    courseCluster: { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Lexend_600SemiBold' },
    courseNoteTxt: { fontSize: typo.xs, color: t.textSecondary, marginTop: 2, fontFamily: 'Lexend_400Regular', lineHeight: 17 },
    // B1: subject/topic bar — fixed min height so the header zone never shifts
    subjectBar: { paddingHorizontal: 14, marginBottom: spacing.xs, minHeight: 22, justifyContent: 'center' },
    subjectBarText: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_600SemiBold' },
    subjectBold: { color: t.textPrimary, fontFamily: 'Lexend_600SemiBold', fontSize: typo.sm },
    subjectTopic: { color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontSize: typo.sm },
    footer: {
      flexDirection: 'row', gap: spacing.sm, padding: 14,
      backgroundColor: t.bg, borderTopWidth: 1, borderColor: t.border,
    },
    footBtnGhost: {
      paddingVertical: 13, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderCurve: 'continuous',
      borderWidth: 1, borderColor: t.border,
    },
    footGhostTxt: { fontSize: typo.sm, fontWeight: '600', color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
    footBtnPrimary: {
      flex: 1, paddingVertical: 13, borderRadius: radius.md, borderCurve: 'continuous',
      backgroundColor: 'rgba(128,0,0,0.85)', alignItems: 'center',
    },
    footDisabled: { opacity: 0.4 },
    footPrimaryTxt: { fontSize: typo.md, fontWeight: '700', color: t.textInverse, fontFamily: 'Outfit_700Bold' },
    scorePenalty: { fontSize: typo.sm, fontWeight: '700', color: t.accentText, marginTop: 6, fontFamily: 'Lexend_600SemiBold' },
    deltaCard: {
      backgroundColor: t.accentSurface, borderWidth: 1, borderColor: t.border, borderRadius: 12,
      borderCurve: 'continuous', padding: spacing.md, marginBottom: 18, alignItems: 'center',
    },
    deltaText: { fontSize: typo.sm, fontWeight: '600', color: t.accentText, fontFamily: 'Lexend_600SemiBold', textAlign: 'center' },
    sectionLbl: {
      fontSize: typo.sm, fontWeight: '700', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8,
      marginBottom: 8, marginTop: 8, fontFamily: 'Lexend_600SemiBold',
    },
    subtestRow: {
      flexDirection: 'row', justifyContent: 'space-between', backgroundColor: t.surface2, borderWidth: 1,
      borderColor: t.divider, borderRadius: 12, borderCurve: 'continuous', padding: spacing.md, marginBottom: 6,
    },
    subtestName: { fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_600SemiBold' },
    subtestScore: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
    // Wave 3b: review section accordion styles
    reviewSectionWrap: {
      backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
      borderRadius: 14, borderCurve: 'continuous', marginBottom: 8, overflow: 'hidden',
    },
    reviewSectionHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      padding: 14, minHeight: 44,
    },
    reviewSectionHeaderLeft: { flex: 1, gap: 2 },
    reviewSectionName: { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Lexend_600SemiBold' },
    reviewSectionCount: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    reviewSectionChevron: { fontSize: 12, color: t.textTertiary, marginLeft: 8 },
    reviewSectionBody: { paddingHorizontal: 10, paddingBottom: 10 },
    footnote: { fontSize: typo.xs, color: t.textTertiary, marginTop: 10, marginBottom: 4, lineHeight: 17, fontFamily: 'Lexend_400Regular', fontStyle: 'italic' },
    primaryBtn: { backgroundColor: 'rgba(128,0,0,0.85)', borderRadius: 16, borderCurve: 'continuous', paddingVertical: 14, alignItems: 'center', marginTop: spacing.sm },
    primaryBtnTxt: { color: t.textInverse, fontWeight: '700', fontSize: typo.md, fontFamily: 'Outfit_700Bold' },
    sprintBtn: {
      backgroundColor: t.accentSurface, borderWidth: 1, borderColor: t.accent, borderRadius: 16, borderCurve: 'continuous',
      paddingVertical: 14, alignItems: 'center', marginTop: spacing.sm,
    },
    sprintBtnTxt: { color: t.accentText, fontWeight: '700', fontSize: typo.md, fontFamily: 'Outfit_700Bold' },
    ghostBtn: { paddingVertical: 12, alignItems: 'center' },
    ghostTxt: { color: t.textTertiary, fontSize: typo.sm, fontFamily: 'Lexend_400Regular' },
  })
}
