import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ChevronDownOutlined, ChevronUpOutlined, ChevronLeftOutlined } from '@lineiconshq/free-icons'
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
import { advanceSectionClocks, clampNavIndex } from '../../../utils/sectionClock'
import { createTimingState, onIdxChange, finalizeTiming, type TimingState } from '../../../utils/attemptTiming'
import { buildAttemptRows } from '../../../utils/attemptRows'
import { prefetchSessionImages } from '../../../utils/prefetchQuestionImages'
import { subtestBreakdown } from '../../../utils/subtestBreakdown'
import { groupSectionResults, questionSubtest, isReached } from '../../../utils/examSubmit'
import type { ExamQuestion, RawUpcatQuestion, RawUpcatPassage } from '../../../utils/upcatExam'
import { QuestionCard } from '../../../components/practice/QuestionCard'
import { OptionList } from '../../../components/practice/OptionList'
import { ReviewCard } from '../../../components/practice/ReviewCard'
import { ReportQuestionModal } from '../../../components/practice/ReportQuestionModal'
import { ExamReviewSheet } from '../../../components/practice/ExamReviewSheet'
import { ResultsScoreCard } from '../../../components/practice/ResultsScoreCard'
import { ResultsBreakdown } from '../../../components/practice/ResultsBreakdown'
import { ExamFocusHeader } from '../../../components/practice/ExamFocusHeader'
import { QuestionNavPanel } from '../../../components/practice/QuestionNavPanel'
import { submitQuestionReport } from '../../../services/questionReports'
import { WebTopSpacer } from '../../../components/ui/WebTopSpacer'
import { Screen } from '../../../components/ui/Screen'
import { Button } from '../../../components/ui/Button'
import { StatNumber } from '../../../components/ui/StatNumber'
import { SectionHeader } from '../../../components/ui/SectionHeader'
import { Skeleton } from '../../../components/ui/Skeleton'
import { EmptyState } from '../../../components/ui/EmptyState'
import { ErrorState } from '../../../components/ui/ErrorState'
import { decorative, focusRing, type WebPressableState } from '../../../components/ui/a11y'
import { useTheme } from '../../../theme/ThemeContext'
import { spacing, radius, textStyle } from '../../../theme/tokens'
import { useBreakpoint, pagePadding, contentMaxWidth } from '../../../hooks/useBreakpoint'
import { usePreventLeave } from '../../../hooks/usePreventLeave'
import { useBeforeUnloadWarning } from '../../../hooks/useBeforeUnloadWarning'
import { useExamRunPersistence } from '../../../hooks/useExamRunPersistence'
import { confirmAction } from '../../../utils/confirmAction'
import { runKeyFor, reorderByIds, reconstructBuiltExamFromRun, remapIndexedById, remapSingleIndex, isRunExpired } from '../../../utils/examRunPersistence'
import { fullMockAllowedNow } from '../../../services/premiumGate'
import { usePremium } from '../../../hooks/usePremium'
import { UpgradeCard, FULL_MOCK_CAP_BODY } from '../../../components/premium/UpgradeCard'

type Phase = 'loading' | 'prestart' | 'empty' | 'error' | 'exam' | 'results'

/** A flattened exam question that remembers which section it belongs to. */
interface FlatQuestion { q: ExamQuestion; sectionName: string }

/** The reading column: direction C keeps the question at a readable measure on any screen. */
const READING = contentMaxWidth('reading')

function minutesLabel(minutes: number): { value: string; unit: string } {
  if (minutes < 60) return { value: String(minutes), unit: 'min' }
  return { value: String(Math.round((minutes / 60) * 10) / 10), unit: 'h' }
}

/** Section boundary: the flat index where this runnable section begins, plus its time budget. */
interface SectionBound { name: string; start: number; end: number; timeMinutes: number }

/** scaleBlueprintTiming resolves every runnable section of a section-blocked
 *  blueprint to concrete minutes (a null budget becomes an equal share of the
 *  total), so a section clock is never "0 minutes" here. timing is null only
 *  for the pre-scaling render pass, where the declared time (or 1 minute) is
 *  the fallback. */
function computeBounds(built: BuiltExam, timing: ScaledBlueprintTiming | null): SectionBound[] {
  const bounds: SectionBound[] = []
  let cursor = 0
  for (const bs of built.runnable) {
    const len = bs.questions.length
    const timeMinutes = timing?.sectionMinutes.get(bs.section.id) ?? bs.section.timeMinutes ?? 1
    bounds.push({ name: bs.section.name, start: cursor, end: cursor + len, timeMinutes })
    cursor += len
  }
  return bounds
}

/** A plain back control for the non-exam phases (the exam itself uses Leave). */
function BackButton({ label = 'Back' }: { label?: string }) {
  const { theme: t } = useTheme()
  return (
    <Pressable
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={(state) => {
        const { pressed, focused } = state as WebPressableState
        return [
          {
            width: 44, height: 44, minWidth: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
            backgroundColor: pressed ? t.surface2 : 'transparent', marginLeft: -spacing.sm,
          },
          focusRing(t.focusRing, focused),
        ]
      }}
    >
      <Lineicons icon={ChevronLeftOutlined} size={22} color={t.textSecondary} />
    </Pressable>
  )
}

/** A neutral bordered block (notes, cut-off context). Border only — no shadow. */
function Panel({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'warning' }) {
  const { theme: t } = useTheme()
  return (
    <View
      style={{
        backgroundColor: tone === 'warning' ? t.warningSurface : t.surface,
        borderWidth: 1,
        borderColor: tone === 'warning' ? t.warningBorder : t.border,
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        padding: spacing.lg,
        gap: spacing.xs,
      }}
    >
      {children}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Wave 3b: Review accordion — collapsed sections, wrong-answers-first
// ---------------------------------------------------------------------------

interface ReviewAccordionProps {
  reviewSections: ReviewSection[]
  questions: FlatQuestion[]
  answers: Record<number, number>
  /** Fix 3: "Review mistakes" is the results screen's primary action — it expands
   *  every section at once instead of making the student open each one by hand. */
  initiallyExpanded?: boolean
}

function ReviewAccordion({ reviewSections, questions, answers, initiallyExpanded }: ReviewAccordionProps) {
  const { theme: t } = useTheme()
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    initiallyExpanded ? Object.fromEntries(reviewSections.map(sec => [sec.sectionName, true])) : {},
  )

  function toggle(name: string) {
    setExpanded(prev => ({ ...prev, [name]: !prev[name] }))
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {reviewSections.map(sec => {
        const isOpen = !!expanded[sec.sectionName]
        const toReview = sec.total - sec.correct
        const reviewLine = toReview === 0 ? 'All correct' : `${toReview} to review`
        return (
          <View
            key={sec.sectionName}
            style={{
              backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
              borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden',
            }}
          >
            <Pressable
              onPress={() => toggle(sec.sectionName)}
              accessibilityRole="button"
              accessibilityLabel={`${sec.sectionName}, ${reviewLine}`}
              aria-expanded={isOpen}
              style={(state) => {
                const { pressed, focused } = state as WebPressableState
                return [
                  {
                    minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
                    backgroundColor: pressed ? t.surface2 : 'transparent',
                  },
                  focusRing(t.focusRing, focused),
                ]
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={1.6}>{sec.sectionName}</Text>
                <Text style={textStyle('caption', t.textSecondary)} maxFontSizeMultiplier={1.6}>
                  {reviewLine}
                </Text>
              </View>
              <View {...decorative}>
                <Lineicons icon={isOpen ? ChevronUpOutlined : ChevronDownOutlined} size={18} color={t.textSecondary} />
              </View>
            </Pressable>
            {isOpen ? (
              <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
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
  const { theme: t } = useTheme()
  const bp = useBreakpoint()
  const expanded = bp === 'expanded'
  const gutter = pagePadding(bp)
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
  // Sitting start (ms). Reset when a run actually starts and restored from the saved
  // run on resume, so duration and the attempt key describe the real sitting.
  const [startedAt, setStartedAt] = useState(() => Date.now())
  // Question indexes the student has actually seen (visited or answered). Questions never
  // reached are not written as attempts when a run is submitted early / times out.
  const visitedRef = useRef<Set<number>>(new Set())
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
  // P3 Full Access: the free full mock for this exam is used up (never true with the paywall flag off).
  const [fullMockLocked, setFullMockLocked] = useState(false)
  const { unlimited: premiumUnlimited, loading: premiumLoading } = usePremium()
  // The saved run's time already ran out: offer Submit / Discard, never a silent auto-submit.
  const [resumeStale, setResumeStale] = useState(false)
  // Set by "Submit what I answered": the restored run is submitted once the exam phase is up.
  const [submitStale, setSubmitStale] = useState(false)
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
  // Latest section position/clock, so a confirm dialog opened earlier can tell the
  // section moved on (clock expiry) while it was open instead of acting on stale state.
  const sectionIdxRef = useRef(0)
  const sectionEndRef = useRef<number | null>(null)
  sectionIdxRef.current = sectionIdx
  sectionEndRef.current = sectionEndTime
  const submitRef = useRef<() => void>(() => {})
  // Question pane (middle scroll zone) — reset to top whenever the question changes
  // so scroll offset never carries over between questions.
  const qPaneRef = useRef<ScrollView>(null)
  const { height: winH } = useWindowDimensions()

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
  useEffect(() => {
    if (phase === 'exam') visitedRef.current.add(idx)
  }, [phase, idx])

  // Timer scaling (Task 4): when a thin question pool sampled fewer questions than
  // the blueprint declares, scale the total + per-section time budgets down by the
  // same ratio rather than running the full declared clock against a short exam.
  const timing = useMemo(
    () => (blueprint && built ? scaleBlueprintTiming({ ...blueprint, sectionBlocked: blueprint.sectionBlocked && examMode === 'full' }, built) : null),
    [blueprint, built, examMode],
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
    } catch (err) {
      // Redesign M2: a load failure is its own retryable state, never shown as
      // "no questions yet" (DESIGN.md: a failed query is not an empty list).
      console.warn('[exam/[slug]] load failed:', err)
      setPhase('error')
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
        setResumeStale(isRunExpired(run, Date.now()))
        setResumeAvailable(true)
      }
    })
    return () => { cancelled = true }
  }, [phase, slug, loadRun])

  // P3 Full Access: a free student gets one full mock per exam. Study Sprint and
  // resuming a started run are never gated. Re-checked whenever the premium
  // state changes: Full Access arriving unlocks it, and the fail-open answer
  // given while that state was still loading is replaced once it has loaded.
  useEffect(() => {
    if (phase !== 'prestart' || !slug) return
    let cancelled = false
    void fullMockAllowedNow(db, slug).then(ok => { if (!cancelled) setFullMockLocked(!ok) })
    return () => { cancelled = true }
  }, [phase, slug, db, premiumUnlimited, premiumLoading])

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
      startedAt,
    }).catch(err => console.warn('[exam/[slug]] saveRun failed:', err))
  }, [phase, slug, examMode, questions, answers, idx, sectionIdx, floorIdx, endTime, sectionEndTime, startedAt, saveRun])

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
   *  countdown effects below chain/fast-forward any section clock that expired
   *  while the app was closed. A run whose TOTAL time already ran out never gets
   *  here through "Resume": the prestart screen offers Submit / Discard instead
   *  (see submitStaleRun / discardStaleRun). */
  function restoreRun(): boolean {
    const run = savedRunRef.current
    if (!blueprint || !run) return false
    const allRaw = Array.from(poolsRef.current.values()).flat()
    const orderedRaw = reorderByIds<RawUpcatQuestion, 'questionId'>(allRaw, run.questionIds, 'questionId')
    if (orderedRaw.length === 0) {
      // Nothing left to resume (e.g. every sampled question was unpublished since).
      void clearRun(run.runKey)
      setResumeAvailable(false)
      setResumeStale(false)
      return false
    }
    const passageById = new Map(passagesRef.current.map(p => [p.setId, p.passageText]))
    const sectionByQuestionId = new Map(run.questionIds.map((id, i) => [id, run.sectionNames[i] ?? '']))
    const flat: FlatQuestion[] = orderedRaw.map(q => ({
      q: { ...q, passageText: q.setId ? (passageById.get(q.setId) ?? null) : null },
      sectionName: sectionByQuestionId.get(q.questionId) ?? '',
    }))
    const rebuilt = reconstructBuiltExamFromRun<BlueprintSection, ExamQuestion>(blueprint.sections, flat)
    setBuilt(rebuilt)
    setExamMode(run.mode === 'sprint' ? 'sprint' : 'full')
    setQuestions(flat)
    // Review finding #1: reorderByIds compacts away vanished questions, so
    // answers/idx/floorIdx saved against the ORIGINAL id order must be
    // remapped through the surviving order — not applied at their old
    // positions, which would land on the wrong question.
    const newIds = flat.map(fq => fq.q.questionId)
    setAnswers(remapIndexedById(run.questionIds, newIds, run.answers))
    let restoredIdx = remapSingleIndex(run.questionIds, newIds, run.idx)
    let restoredFloor = remapSingleIndex(run.questionIds, newIds, run.floorIdx)
    let restoredSection = run.sectionIdx
    if (run.mode !== 'sprint' && blueprint.sectionBlocked) {
      // A shorter rebuilt exam can have fewer sections than the saved one. An index past
      // the end would leave no section ceiling (free navigation), silently lifting the
      // lock, so pin the section into range and the position inside that section.
      const rb = computeBounds(rebuilt, null)
      if (rb.length > 0) {
        restoredSection = Math.max(0, Math.min(run.sectionIdx, rb.length - 1))
        const cur = rb[restoredSection]!
        restoredFloor = Math.max(cur.start, Math.min(restoredFloor, cur.end - 1))
        restoredIdx = Math.max(restoredFloor, Math.min(restoredIdx, cur.end - 1))
      }
    }
    setIdx(restoredIdx)
    setFloorIdx(restoredFloor)
    setSectionIdx(restoredSection)
    setEndTime(run.endTime)
    setSectionEndTime(run.sectionEndTime)
    setStartedAt(run.startedAt)
    // Reached = answered, or visited up to the saved position (the saved run does not
    // record which later questions were jumped over, so the position is the best bound).
    const reached = new Set<number>(Object.keys(remapIndexedById(run.questionIds, newIds, run.answers)).map(Number))
    for (let i = 0; i <= restoredIdx; i++) reached.add(i)
    visitedRef.current = reached
    setPhase('exam')
    return true
  }

  function resumeExam() { restoreRun() }

  /** "Submit what I answered": restore the expired run, then submit it for what it holds. */
  function submitStaleRun() {
    if (restoreRun()) setSubmitStale(true)
  }

  function discardStaleRun() {
    const run = savedRunRef.current
    if (run) void clearRun(run.runKey)
    savedRunRef.current = null
    setResumeAvailable(false)
    setResumeStale(false)
  }

  // Web: if the screen loaded before the fire-and-forget catalog sync delivered
  // blueprints/questions, it would be stuck on 'empty'. Re-load when the practice
  // cache refreshes (post-sync), but only while still empty — never mid-exam.
  useEffect(() => {
    const unsub = subscribe('practice:', () => { if (!examLoadedRef.current) void loadExam() })
    return unsub
  }, [loadExam])

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
    if (mode === 'full' && fullMockLocked) return
    setExamMode(mode)
    const now = Date.now()
    setStartedAt(now)
    visitedRef.current = new Set()

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
      setSectionEndTime(now + first.timeMinutes * 60_000)
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
      // Group raw correct/total by section for the session rows. Each row is
      // persisted under the section's CANONICAL subtest (the question's own),
      // not the display name — 'Language Proficiency (English & Filipino)'
      // matched no readiness/estimator label.
      const sectionResults = groupSectionResults(questions, answers, visitedRef.current)

      // Task D: per-question attempt rows, written before recordSession so
      // they're committed before recordSession's fire-and-forget backup push.
      const elapsedByIdx = timingRef.current ? finalizeTiming(timingRef.current, Date.now()) : {}
      const rows = buildAttemptRows({
        sessionKey: startedAt,
        sourceTable: 'upcat_questions',
        listingSlug: slug,
        questions: questions.map(fq => ({
          questionId: fq.q.questionId,
          correctIndex: fq.q.correctIndex,
          subtest: questionSubtest(fq),
          topic: fq.q.topic ?? null,
        })),
        answers,
        elapsedByIdx,
        reached: visitedRef.current,
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

      // Every section row of this sitting shares attemptKey so Progress/Best
      // group them as one attempt; a Study Sprint is a different kind so it is
      // never mistaken for a full mock.
      // sectionResults only holds REACHED questions (the same set the attempt rows
      // cover), so a section's total is what the student saw and a section never
      // reached (early submit / total timer ran out) has no row, not a 0% session.
      for (const sec of sectionResults) {
        void recordSession({
          listingSlug: slug,
          topicId: '',
          deckId: '',
          score: sec.correct,
          total: sec.total,
          startTime: startedAt,
          subtest: sec.subtest,
          kind: examMode === 'sprint' ? 'sprint' : 'mock',
          attemptKey: startedAt,
        }).catch(err => console.warn('[exam/[slug]] recordSession failed:', err))
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

  // "Submit what I answered" on an expired run: submit once the restored exam phase is up.
  // Declared BEFORE the countdown effects so submittedRef is already set when they run.
  useEffect(() => {
    if (phase !== 'exam' || !submitStale) return
    setSubmitStale(false)
    void submitRef.current()
  }, [phase, submitStale])

  // --- Total countdown tick: auto-submits at zero. ---
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

  // --- Per-section countdown tick (section-blocked exams only). On expiry, lock the
  //     current section and advance into the next; expiry of the last section submits. ---
  useEffect(() => {
    if (phase !== 'exam' || !sectionBlocked || sectionEndTime == null) return
    const tick = () => {
      if (submittedRef.current) return
      const now = Date.now()
      setSectionRemaining(Math.max(0, Math.round((sectionEndTime - now) / 1000)))
      // Chain from the previous end and fast-forward through every section that already
      // expired (e.g. the app was closed): see utils/sectionClock.ts.
      const state = advanceSectionClocks({ sectionIdx, sectionEndTime, now, minutes: bounds.map(b => b.timeMinutes) })
      if (state.finished) { submitRef.current(); return }
      if (state.sectionIdx !== sectionIdx) {
        const nb = bounds[state.sectionIdx]!
        setSectionIdx(state.sectionIdx)
        setIdx(nb.start)
        setFloorIdx(nb.start)
        setSectionEndTime(state.sectionEndTime)
        setSectionRemaining(Math.max(0, Math.round((state.sectionEndTime - now) / 1000)))
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [phase, sectionBlocked, sectionEndTime, sectionIdx, bounds])

  // ── Redesign M2: render ───────────────────────────────────────────────────
  // Every phase keeps one primary (maroon) action. The exam phase is a focus
  // mode: one slim header, the question in a reading column no wider than 720,
  // a fixed options zone, a fixed footer, and — on expanded widths only — the
  // question navigator as a side panel.

  if (phase === 'loading') {
    return (
      <Screen header={<View style={{ paddingTop: spacing.sm }}><BackButton /></View>}>
        <View accessible accessibilityLabel="Loading mock exam" aria-busy style={{ gap: spacing.md, paddingTop: spacing.md }}>
          <Skeleton width="60%" height={32} />
          <View style={{ flexDirection: 'row', gap: spacing.xxl }}>
            <Skeleton width={72} height={40} />
            <Skeleton width={72} height={40} />
          </View>
          <Skeleton height={56} radius={radius.lg} />
          <Skeleton height={56} radius={radius.lg} />
          <Skeleton height={56} radius={radius.lg} />
        </View>
      </Screen>
    )
  }

  if (phase === 'error') {
    return (
      <Screen header={<View style={{ paddingTop: spacing.sm }}><BackButton /></View>}>
        <ErrorState
          title="Couldn't load this mock exam"
          body="Check your connection, then try again. Any exam you started is still saved."
          onRetry={() => { setPhase('loading'); void loadExam() }}
        />
      </Screen>
    )
  }

  if (phase === 'empty') {
    return (
      <Screen header={<View style={{ paddingTop: spacing.sm }}><BackButton /></View>}>
        <EmptyState
          title="This mock isn't ready yet"
          body={`${blueprint?.name ?? 'This mock exam'}'s questions are still being written. Check back soon, or practise a subject in the meantime.`}
          actionLabel="Back to mock exams"
          onAction={() => router.back()}
        />
      </Screen>
    )
  }

  if (phase === 'prestart' && blueprint && built) {
    const declared = minutesLabel(blueprint.totalTimeMinutes)
    const scaledMinutes = timing?.totalMinutes ?? blueprint.totalTimeMinutes
    const scaled = minutesLabel(scaledMinutes)
    // Only a genuinely thinner exam is "matched to the items available now"; section
    // minutes that merely differ from the blueprint total are not that.
    const declaredItems = built.runnable.reduce((n, bs) => n + bs.section.itemCount, 0) + built.comingSoon.reduce((n, sct) => n + sct.itemCount, 0)
    const isScaled = built.totalQuestions < declaredItems && scaledMinutes !== blueprint.totalTimeMinutes
    const noItems = built.totalQuestions === 0
    return (
      <Screen header={<View style={{ paddingTop: spacing.sm }}><BackButton /></View>}>
        <View style={{ gap: spacing.xxl, paddingTop: spacing.xs }}>
          <View style={{ gap: spacing.lg }}>
            <Text accessibilityRole="header" style={textStyle('title', t.textPrimary)} maxFontSizeMultiplier={1.4}>
              {blueprint.name}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxxl }}>
              {/* What will really run: the built question count and the actual timer,
                  not the declared blueprint figures (a short pool builds fewer items). */}
              <StatNumber value={built.totalQuestions} label="Items" />
              <StatNumber value={scaled.value} unit={scaled.unit} label="Time" />
            </View>
            {isScaled ? (
              <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={1.6}>
                The full {blueprint.acronym || blueprint.name} runs {declared.value} {declared.unit}. Today&apos;s Full Mock timer is {scaled.value} {scaled.unit}, matched to the items available now.
              </Text>
            ) : null}
          </View>

          {blueprint.mechanicsNote ? (
            <Panel>
              <Text style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={1.6}>{blueprint.mechanicsNote}</Text>
            </Panel>
          ) : null}

          {blueprint.hasGuessingPenalty ? (
            <Panel tone="warning">
              <Text style={textStyle('titleSm', t.warningStrong)} maxFontSizeMultiplier={1.6}>Guessing penalty</Text>
              <Text style={textStyle('bodySm', t.textPrimary)} maxFontSizeMultiplier={1.6}>
                Wrong answers deduct {blueprint.guessingPenalty}; blanks are 0. Answer when you are reasonably sure.
              </Text>
            </Panel>
          ) : null}

          <View>
            <SectionHeader title="Structure" />
            <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, borderCurve: 'continuous', paddingHorizontal: spacing.lg }}>
              {[...blueprint.sections].sort((a, b) => a.displayOrder - b.displayOrder).map((sec, i) => {
                const builtSec = built.runnable.find(b => b.section.id === sec.id)
                const live = !!builtSec
                const secMinutes = timing?.sectionMinutes.get(sec.id) ?? sec.timeMinutes
                return (
                  <View
                    key={sec.id}
                    style={{
                      minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md,
                      paddingVertical: spacing.md, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.divider,
                    }}
                  >
                    <Text style={[textStyle('body', live ? t.textPrimary : t.textSecondary), { flexShrink: 1 }]} maxFontSizeMultiplier={1.6}>{sec.name}</Text>
                    <Text style={[textStyle('bodySm', t.textSecondary), { fontVariant: ['tabular-nums'] }]} maxFontSizeMultiplier={1.6}>
                      {builtSec ? `${builtSec.questions.length} items${blueprint.sectionBlocked && secMinutes ? ` · ${secMinutes} min` : ''}` : 'Not available yet'}
                    </Text>
                  </View>
                )
              })}
            </View>
          </View>

          {visibleNotes.length ? (
            <View>
              <SectionHeader
                title={courseClusters.length > 0 && visibleNotes.length < blueprint.courseNotes.length ? 'Cut-offs for your courses' : 'Course cut-offs'}
                subtitle="Historical figures for context, not a prediction"
              />
              <View style={{ gap: spacing.sm }}>
                {visibleNotes.map((cn, i) => (
                  <Panel key={`${cn.courseCluster}-${i}`}>
                    <Text style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={1.6}>{cn.courseCluster}</Text>
                    <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={1.6}>{cn.note}</Text>
                  </Panel>
                ))}
              </View>
            </View>
          ) : null}

          <View style={{ gap: spacing.sm }}>
            {resumeAvailable && resumeStale ? (
              <>
                <Panel tone="warning">
                  <Text style={textStyle('titleSm', t.warningStrong)} maxFontSizeMultiplier={1.6}>Your last attempt ran out of time</Text>
                  <Text style={textStyle('bodySm', t.textPrimary)} maxFontSizeMultiplier={1.6}>
                    You can submit the answers you gave (questions you never reached are not counted), or discard that attempt.
                  </Text>
                </Panel>
                <Button label="Submit what I answered" onPress={submitStaleRun} fullWidth size="lg" />
                <Button label="Discard" variant="secondary" fullWidth onPress={discardStaleRun} />
              </>
            ) : null}
            {resumeAvailable && !resumeStale ? (
              <Button label="Resume where you left off" onPress={resumeExam} fullWidth size="lg" />
            ) : null}
            {fullMockLocked ? (
              <UpgradeCard title="Your free full mock is done" body={FULL_MOCK_CAP_BODY} source="full_mock_cap" />
            ) : (
              <Button
                label="Full Mock"
                variant={resumeAvailable ? 'secondary' : 'primary'}
                size={resumeAvailable ? 'md' : 'lg'}
                fullWidth
                disabled={noItems}
                onPress={() => startExam('full')}
                accessibilityHint={resumeAvailable ? 'Starts a new attempt instead of resuming' : undefined}
              />
            )}
            <Button
              label={`Study Sprint · ${STUDY_SPRINT_MINUTES} min`}
              variant="secondary"
              fullWidth
              disabled={noItems}
              onPress={() => startExam('sprint')}
            />
          </View>
        </View>
      </Screen>
    )
  }

  if (phase === 'results' && blueprint) {
    const correct = questions.reduce((n, fq, i) => n + (answers[i] === fq.q.correctIndex ? 1 : 0), 0)
    const wrong = questions.reduce((n, fq, i) => n + (answers[i] !== undefined && answers[i] !== fq.q.correctIndex ? 1 : 0), 0)
    // Only the questions the student reached count, the same set the saved sessions use.
    const total = questions.reduce((n, _fq, i) => n + (isReached(i, answers, visitedRef.current) ? 1 : 0), 0)
    const unreached = questions.length - total
    const score = scoreBlueprintExam(total, correct, wrong, blueprint.hasGuessingPenalty, blueprint.guessingPenalty)
    const pct = total ? Math.round((correct / total) * 100) : 0

    // Per-subtest raw breakdown (neutral; see ResultsBreakdown).
    const rows = subtestBreakdown(questions, answers, visitedRef.current)

    // Wave 3b: grouped review sections with wrong-first ordering
    const correctIndexes = questions.map(fq => fq.q.correctIndex)
    const reviewSections = groupReviewBySection(questions, answers, correctIndexes)

    return (
      <Screen>
        <View style={{ gap: spacing.xxl, paddingTop: spacing.lg }}>
          {/* Peak-end moment: warm, short, then the facts. Never a verdict. */}
          <View style={{ gap: spacing.xs }}>
            <Text accessibilityRole="header" style={textStyle('title', t.textPrimary)} maxFontSizeMultiplier={1.4}>
              Tapos na! Mock complete.
            </Text>
            <Text style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={1.6}>
              Here is how {blueprint.name} went. Every mock shows you what to practise next.
            </Text>
          </View>

          {/* Fix 3: one neutral card regardless of score — no pass/fail colouring,
              no percentile, no cut-off verdict. */}
          <View style={{ gap: spacing.sm }}>
            <ResultsScoreCard pct={pct} correct={correct} total={total} />
            {blueprint.hasGuessingPenalty ? (
              <Text style={[textStyle('bodySm', t.textSecondary), { textAlign: 'center' }]} maxFontSizeMultiplier={1.6}>
                Penalty-adjusted: {Math.round(score.adjusted * 100) / 100}
              </Text>
            ) : null}
            {scoreDelta ? (
              <Panel>
                <Text style={[textStyle('bodySm', t.textPrimary), { textAlign: 'center' }]} maxFontSizeMultiplier={1.6}>{scoreDelta}</Text>
              </Panel>
            ) : null}
          </View>

          <ResultsBreakdown rows={rows} />
          {unreached > 0 ? (
            <Text style={textStyle('caption', t.textSecondary)} maxFontSizeMultiplier={1.6}>
              Questions you never reached are not counted.
            </Text>
          ) : null}

          {visibleNotes.length > 0 ? (
            <View>
              <SectionHeader title="Course cut-off context" subtitle="Historical figures for context, not a prediction" />
              <View style={{ gap: spacing.sm }}>
                {visibleNotes.map((cn, i) => (
                  <Panel key={`note-${cn.courseCluster}-${i}`}>
                    <Text style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={1.6}>{cn.courseCluster}</Text>
                    <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={1.6}>{cn.note}</Text>
                  </Panel>
                ))}
              </View>
            </View>
          ) : null}

          {/* Wave 3b: Review grouped by section, collapsed accordion, wrong-answers-first */}
          <View>
            <SectionHeader title="Review" subtitle="Mistakes first, with explanations" />
            <ReviewAccordion
              key={reviewMistakesTapped ? 'expanded' : 'collapsed'}
              reviewSections={reviewSections}
              questions={questions}
              answers={answers}
              initiallyExpanded={reviewMistakesTapped}
            />
          </View>

          {blueprint.scoringNote ? (
            <Text style={textStyle('caption', t.textSecondary)} maxFontSizeMultiplier={1.6}>{blueprint.scoringNote}</Text>
          ) : null}

          {/* Fix 3: "Review mistakes" is the primary action, "Retake" is secondary. */}
          <View style={{ gap: spacing.sm }}>
            <Button label="Review mistakes" onPress={() => setReviewMistakesTapped(true)} fullWidth size="lg" />
            <Button label="Retake exam" variant="secondary" fullWidth onPress={() => router.replace(`/practice/exam/${slug}`)} />
            <Button label="Back to exams" variant="ghost" fullWidth onPress={() => router.replace('/practice/exam')} />
          </View>
        </View>
      </Screen>
    )
  }

  // --- exam phase ---
  const fq = questions[idx]
  if (!fq) {
    return (
      <Screen>
        <View accessible accessibilityLabel="Loading question" aria-busy style={{ gap: spacing.md, paddingTop: spacing.xxl }}>
          <Skeleton height={28} />
          <Skeleton width="70%" height={28} />
        </View>
      </Screen>
    )
  }
  const q = fq.q
  const sel = answers[idx]
  const answeredIdxs = new Set(Object.keys(answers).map(Number))
  const flaggedIdxs = new Set(Object.keys(reported).map(Number))
  const isLast = idx === questions.length - 1
  const canGoBack = idx > floorIdx
  // Section lock (section-blocked blueprints): navigation stays inside the current
  // section [floorIdx, sectionEnd). Free-navigation blueprints have no ceiling.
  const sectionEnd = sectionBlocked ? bounds[sectionIdx]?.end : undefined
  const lastInSection = sectionEnd !== undefined && idx === sectionEnd - 1 && !isLast
  const jump = (i: number) => { if (!submitting && i >= floorIdx && (sectionEnd === undefined || i < sectionEnd)) setIdx(i) }
  const jumpSection = (start: number) => { if (!submitting) setIdx(clampNavIndex(start, floorIdx, sectionEnd)) }
  const stepForward = () => setIdx(i => clampNavIndex(i + 1, floorIdx, sectionEnd))
  /** Finish the current section early: confirm, lock it, start the next section's clock. */
  const finishSection = () => {
    const next = sectionIdx + 1
    const cur = bounds[sectionIdx]
    const nb = bounds[next]
    if (!cur || !nb || submitting) return
    let unanswered = 0
    for (let i = cur.start; i < cur.end; i++) if (answers[i] === undefined) unanswered++
    const note = unanswered > 0 ? `You have ${unanswered} unanswered question${unanswered === 1 ? '' : 's'} in this section. ` : ''
    confirmAction(
      'Finish this section?',
      `${note}You can’t come back to ${cur.name} once you continue.`,
      'Finish section',
      () => {
        // The dialog can sit open while the section clock runs out and the tick moves the
        // student on (or the exam auto-submits). Act only if nothing moved meanwhile.
        if (submittedRef.current || sectionIdxRef.current !== sectionIdx) return
        const now = Date.now()
        const clock = nb.timeMinutes * 60_000
        // Finishing early starts the next clock now, but never later than the chain
        // (this section's end + the next clock), the time it would have had anyway.
        const chained = (sectionEndRef.current ?? now) + clock
        sectionIdxRef.current = next
        setSectionIdx(next)
        setIdx(nb.start)
        setFloorIdx(nb.start)
        setSectionEndTime(Math.min(now + clock, chained))
      },
      { cancelLabel: 'Keep working', destructive: unanswered > 0 },
    )
  }
  const subjectTag = [q.mainSubject || fq.sectionName, q.topic].filter(Boolean).join(' · ')
  const column = { width: '100%' as const, maxWidth: READING, alignSelf: 'center' as const, paddingHorizontal: gutter }
  const options = (
    <OptionList
      options={q.options}
      selectedIndex={sel}
      disabled={submitting}
      onSelect={oi => { if (!submitting) setAnswers(a => ({ ...a, [idx]: oi })) }}
    />
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <WebTopSpacer />
      <ExamFocusHeader
        title={sectionBlocked ? fq.sectionName : (blueprint?.acronym || blueprint?.name || 'Mock Exam')}
        position={idx + 1}
        total={questions.length}
        answered={answeredIdxs.size}
        remaining={remaining}
        sectionRemaining={sectionBlocked ? sectionRemaining : null}
        onLeave={() => router.back()}
        onOpenOverview={expanded ? undefined : () => setReviewOpen(true)}
      />

      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {/* Middle pane: passage + question scroll; options live in their own fixed
              zone below so they never jump as question/passage length changes. */}
          <ScrollView
            ref={qPaneRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingTop: spacing.xl, paddingBottom: spacing.lg }}
            showsVerticalScrollIndicator={false}
          >
            <View testID="exam-reading-column" style={column}>
              <QuestionCard
                questionText={q.questionText}
                passageText={q.passageText}
                subjectTag={subjectTag || undefined}
                reported={reported[idx]}
                onReport={() => setReportIdx(idx)}
                imageUrl={q.imageUrl}
                imageAlt={q.imageAlt}
                imageWidth={q.imageWidth}
                imageHeight={q.imageHeight}
              />
              {/* Desktop: options follow the question in the reading column. */}
              {expanded ? <View style={{ marginTop: spacing.xl }}>{options}</View> : null}
            </View>
          </ScrollView>

          {/* Phones/tablets: a fixed options zone, capped at 42% of the window so the
              question pane keeps the majority of the viewport and the options never
              jump between questions; very long option lists scroll inside it. */}
          {expanded ? null : (
          <ScrollView
            style={{ flexGrow: 0, maxHeight: winH * 0.42 }}
            contentContainerStyle={{ paddingVertical: spacing.sm }}
            showsVerticalScrollIndicator={false}
          >
            <View style={column}>{options}</View>
          </ScrollView>
          )}

          <View style={{ borderTopWidth: 1, borderTopColor: t.divider, backgroundColor: t.bg }}>
            <View style={[column, { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.md }]}>
              <Button
                label="Back"
                variant="secondary"
                disabled={!canGoBack || submitting}
                onPress={() => setIdx(i => Math.max(floorIdx, i - 1))}
              />
              {isLast ? (
                // Fix 2: the last question never submits directly anymore — it opens
                // a review sheet listing every question's answered/unanswered state,
                // with an explicit "Submit exam" confirmation inside it.
                <Button
                  label="Review & submit"
                  disabled={submitting}
                  onPress={() => setReviewOpen(true)}
                  style={{ flex: 1 }}
                />
              ) : lastInSection ? (
                // Section-locked exams: the last question of a section never steps into
                // the next one; the student explicitly finishes (and locks) the section.
                <Button label="Finish section" disabled={submitting} onPress={finishSection} style={{ flex: 1 }} />
              ) : (
                <>
                  <Button label="Skip" variant="ghost" disabled={submitting} onPress={stepForward} />
                  <Button
                    label="Next"
                    disabled={sel === undefined || submitting}
                    onPress={stepForward}
                    style={{ flex: 1 }}
                  />
                </>
              )}
            </View>
          </View>
        </View>

        {expanded ? (
          <QuestionNavPanel
            total={questions.length}
            currentIdx={idx}
            answeredIdxs={answeredIdxs}
            flaggedIdxs={flaggedIdxs}
            floorIdx={floorIdx}
            ceilIdx={sectionEnd}
            onJump={jump}
            sections={sectionChips}
            onJumpSection={jumpSection}
          />
        ) : null}
      </View>

      <ExamReviewSheet
        visible={reviewOpen}
        total={questions.length}
        currentIdx={idx}
        answeredIdxs={answeredIdxs}
        flaggedIdxs={flaggedIdxs}
        floorIdx={floorIdx}
        ceilIdx={sectionEnd}
        sections={sectionChips}
        onJumpSection={jumpSection}
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
