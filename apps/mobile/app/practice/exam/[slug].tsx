import { useState, useEffect, useMemo, useRef } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { useDb } from '../../../hooks/useDb'
import { useRecordSession } from '../../../hooks/useRecordSession'
import { getExamBlueprint, getQuestionsByCategory, getAllPassages, getTargetCourseClusters, type ExamBlueprint } from '../../../services/examBlueprints'
import { buildBlueprintExam, scoreBlueprintExam, filterCourseNotesByClusters, estimatePercentileBand, groupReviewBySection, sectionChipState, type BuiltExam, type ReviewSection } from '../../../utils/examBuilder'
import type { ExamQuestion } from '../../../utils/upcatExam'
import { PassagePanel } from '../../../components/upcat/PassagePanel'
import { QuestionNavigator } from '../../../components/upcat/QuestionNavigator'
import { useTheme } from '../../../theme/ThemeContext'
import { spacing, radius } from '../../../theme/tokens'

const LETTERS = ['A', 'B', 'C', 'D'] as const
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

function computeBounds(built: BuiltExam): SectionBound[] {
  const bounds: SectionBound[] = []
  let cursor = 0
  for (const bs of built.runnable) {
    const len = bs.questions.length
    bounds.push({ name: bs.section.name, start: cursor, end: cursor + len, timeMinutes: bs.section.timeMinutes })
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
}

function ReviewAccordion({ reviewSections, questions, answers, styles: s }: ReviewAccordionProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

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
                  const sel = answers[ref.flatIndex]
                  const ok = ref.status === 'correct'
                  return (
                    <View key={q.questionId} style={[s.reviewCard, ok ? s.reviewOk : s.reviewBad]}>
                      <Text style={s.reviewQ}>Q{ref.flatIndex + 1}. {q.questionText}</Text>
                      {q.options.map((o, oi) => (
                        <Text
                          key={oi}
                          style={[
                            s.reviewOpt,
                            oi === q.correctIndex && { color: '#16a34a', fontWeight: '700' },
                            oi === sel && oi !== q.correctIndex ? { color: '#dc2626' } : null,
                          ]}
                        >
                          {LETTERS[oi]}. {o}
                          {oi === q.correctIndex ? '  ✓' : oi === sel ? '  ✗' : ''}
                        </Text>
                      ))}
                      {q.explanation ? <Text style={s.reviewExp}>💡 {q.explanation}</Text> : null}
                    </View>
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

  const [phase, setPhase] = useState<Phase>('loading')
  const [blueprint, setBlueprint] = useState<ExamBlueprint | null>(null)
  const [built, setBuilt] = useState<BuiltExam | null>(null)
  const [courseClusters, setCourseClusters] = useState<string[]>([])
  const [questions, setQuestions] = useState<FlatQuestion[]>([])
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const startRef = useState(() => Date.now())[0]

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

  const bounds = useMemo(() => (built ? computeBounds(built) : []), [built])
  const sectionBlocked = !!blueprint?.sectionBlocked && bounds.length > 0

  // B2: section chip state — recomputed whenever idx, floorIdx, or sectionBlocked changes.
  const sectionChips = useMemo(
    () => sectionChipState(bounds, idx, floorIdx, sectionBlocked),
    [bounds, idx, floorIdx, sectionBlocked],
  )

  useEffect(() => {
    void (async () => {
      try {
        const bp = await getExamBlueprint(db, slug)
        if (!bp) { setQuestions([]); setBuilt(null); setPhase('empty'); return }
        const cats = Array.from(new Set(bp.sections.map(s => s.skillCategory)))
        const [pools, passages, clusters] = await Promise.all([getQuestionsByCategory(db, cats), getAllPassages(db), getTargetCourseClusters(db)])
        const b = buildBlueprintExam(bp, pools, passages)
        const flat: FlatQuestion[] = b.runnable.flatMap(bs => bs.questions.map(q => ({ q, sectionName: bs.section.name })))
        setBlueprint(bp); setBuilt(b); setQuestions(flat); setCourseClusters(clusters)
        setPhase(flat.length ? 'prestart' : 'empty')
      } catch {
        // Unexpected failure: show the empty/back screen rather than hang on loading.
        setPhase('empty')
      }
    })()
  }, [db, slug])

  const s = useMemo(() => makeStyles(t, typo), [t, typo])

  const visibleNotes = useMemo(
    () => blueprint ? filterCourseNotesByClusters(blueprint.courseNotes, courseClusters) : [],
    [blueprint, courseClusters],
  )

  // --- Start the exam: arm the total timer (and the first section timer if blocked). ---
  function startExam() {
    if (!blueprint) return
    const now = Date.now()
    setEndTime(now + blueprint.totalTimeMinutes * 60_000)
    if (sectionBlocked) {
      const first = bounds[0]!
      setSectionIdx(0)
      setIdx(first.start)
      setFloorIdx(first.start)
      setSectionEndTime(now + (first.timeMinutes ?? blueprint.totalTimeMinutes) * 60_000)
    }
    setPhase('exam')
  }

  function submit() {
    if (submittedRef.current) return  // guard against double-submit (timer + tap)
    submittedRef.current = true
    if (blueprint) {
      // Group raw correct/total by section for the gamification record.
      const bySection = new Map<string, { correct: number; total: number }>()
      questions.forEach((fq, i) => {
        const cur = bySection.get(fq.sectionName) ?? { correct: 0, total: 0 }
        cur.total++
        if (answers[i] === fq.q.correctIndex) cur.correct++
        bySection.set(fq.sectionName, cur)
      })
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
        <Text style={s.loading}>Loading exam…</Text>
      </SafeAreaView>
    )
  }

  if (phase === 'empty') {
    return (
      <SafeAreaView style={s.root}>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
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
    const runnableNames = new Set(built.runnable.map(b => b.section.name))
    return (
      <SafeAreaView style={s.root}>
        <View style={s.topBar}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10}>
            <Text style={s.back}>‹</Text>
          </Pressable>
          <Text style={s.topTitle} numberOfLines={1}>{blueprint.name}</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={s.metaCard}>
            <Text style={s.metaBig}>{blueprint.totalItems} items · {hours}h</Text>
            <Text style={s.metaSub}>{built.totalQuestions} items available now</Text>
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
            return (
              <View key={sec.id} style={[s.structRow, !live && s.structRowSoon]}>
                <Text style={[s.structName, !live && s.structSoonTxt]}>{sec.name}</Text>
                <Text style={[s.structCount, !live && s.structSoonTxt]}>
                  {live ? `${sec.itemCount} items${sectionBlocked && sec.timeMinutes ? ` · ${sec.timeMinutes}m` : ''}` : 'Content coming soon'}
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

          <Pressable
            accessibilityRole="button"
            style={[s.primaryBtn, built.totalQuestions === 0 && s.footDisabled]}
            disabled={built.totalQuestions === 0}
            onPress={startExam}
          >
            <Text style={s.primaryBtnTxt}>Start exam</Text>
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
    const pb = estimatePercentileBand(pct)

    // Per-section raw breakdown.
    const bySection = new Map<string, { correct: number; total: number }>()
    questions.forEach((fq, i) => {
      const cur = bySection.get(fq.sectionName) ?? { correct: 0, total: 0 }
      cur.total++
      if (answers[i] === fq.q.correctIndex) cur.correct++
      bySection.set(fq.sectionName, cur)
    })

    // Cut-off notes that have a minPercentile (for verdict) or just a note.
    const notesWithCutoff = visibleNotes.filter(n => n.minPercentile != null)
    const notesWithoutCutoff = visibleNotes.filter(n => n.minPercentile == null)

    // Wave 3b: grouped review sections with wrong-first ordering
    const correctIndexes = questions.map(fq => fq.q.correctIndex)
    const reviewSections = groupReviewBySection(questions, answers, correctIndexes)

    return (
      <SafeAreaView style={s.root}>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={[s.scoreCard, pct >= 60 ? s.pass : s.fail]}>
            <Text style={[s.scorePct, { color: pct >= 60 ? '#16a34a' : t.accentText }]}>{pct}%</Text>
            <Text style={s.scoreVerdict}>{pct >= 60 ? '🎉 Great work' : '📚 Keep practicing'}</Text>
            <Text style={s.scoreSub}>{correct}/{total} correct</Text>
            {blueprint.hasGuessingPenalty ? (
              <Text style={s.scorePenalty}>Penalty-adjusted: {Math.round(score.adjusted * 100) / 100}</Text>
            ) : null}
          </View>

          <View style={s.bandCard}>
            <Text style={s.bandPct}>est. ~{pb.percentile}th</Text>
            <Text style={s.bandLabel}>{pb.band}</Text>
            <Text style={s.bandBlurb}>{pb.blurb}</Text>
            <Text style={s.bandDisclaimer}>Estimated percentile (not a normed score)</Text>
          </View>

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
              <Text style={s.sectionLbl}>Course cut-offs</Text>
              {notesWithCutoff.map((cn, i) => {
                const onTrack = pb.percentile >= (cn.minPercentile ?? 0)
                return (
                  <View key={`cutoff-${cn.courseCluster}-${i}`} style={s.courseNote}>
                    <View style={s.cutoffRow}>
                      <Text style={s.courseCluster}>{cn.courseCluster}</Text>
                      <View style={[s.verdictPill, onTrack ? s.verdictOn : s.verdictOff]}>
                        <Text style={[s.verdictTxt, onTrack ? s.verdictTxtOn : s.verdictTxtOff]}>
                          {onTrack ? '✓ On track (est.)' : `Below cut-off (need ${cn.minPercentile}th)`}
                        </Text>
                      </View>
                    </View>
                    <Text style={s.courseNoteTxt}>{cn.note}</Text>
                  </View>
                )
              })}
              {notesWithoutCutoff.map((cn, i) => (
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
            reviewSections={reviewSections}
            questions={questions}
            answers={answers}
            styles={s}
          />

          {blueprint.scoringNote ? <Text style={s.footnote}>{blueprint.scoringNote}</Text> : null}

          <Pressable accessibilityRole="button" style={s.primaryBtn} onPress={() => router.replace(`/practice/exam/${slug}`)}>
            <Text style={s.primaryBtnTxt}>Retake exam</Text>
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
      <View style={s.topBar}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10}>
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

      <QuestionNavigator total={questions.length} currentIdx={idx} answeredIdxs={answeredIdxs} onJump={i => { if (i >= floorIdx) setIdx(i) }} />

      {bounds.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {sectionChips.map(chip => (
            <Pressable
              key={chip.name}
              style={[s.sChip, chip.active && s.sChipOn, chip.disabled && s.sChipDisabled]}
              disabled={chip.disabled}
              accessibilityRole="button"
              accessibilityState={{ disabled: chip.disabled }}
              onPress={() => { if (!chip.disabled) setIdx(Math.max(chip.start, floorIdx)) }}
            >
              <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[s.sChipTxt, chip.active && s.sChipTxtOn]}>{chip.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {q.passageText ? <PassagePanel passage={q.passageText} /> : null}
        <View style={s.subjectBar}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={s.subjectBarText}>
            <Text style={s.subjectBold}>{fq.q.mainSubject ? fq.q.mainSubject : fq.sectionName}</Text>
            {fq.q.topic ? <Text style={s.subjectTopic}>{` · ${fq.q.topic}`}</Text> : null}
          </Text>
        </View>
        <View style={s.qCard}>
          <Text style={s.qText}>{q.questionText}</Text>
        </View>
        <View style={s.opts}>
          {q.options.map((o, oi) => (
            <Pressable
              key={oi}
              accessibilityRole="button"
              style={[s.opt, sel === oi && s.optOn]}
              onPress={() => setAnswers(a => ({ ...a, [idx]: oi }))}
            >
              <View style={[s.optLetter, sel === oi && s.optLetterOn]}>
                <Text style={[s.optLetterTxt, sel === oi && { color: '#fff' }]}>{LETTERS[oi]}</Text>
              </View>
              <Text style={s.optTxt}>{o}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={s.footer}>
        <Pressable
          accessibilityRole="button"
          style={s.footBtnGhost}
          onPress={() => setIdx(i => Math.max(floorIdx, i - 1))}
          disabled={!canGoBack}
        >
          <Text style={[s.footGhostTxt, !canGoBack && { opacity: 0.3 }]}>Back</Text>
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
    timerPillLow: { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.35)' },
    timerTxt: { fontSize: typo.xs, fontWeight: '700', color: t.textSecondary, fontFamily: 'Outfit_700Bold', fontVariant: ['tabular-nums'] },
    timerTxtLow: { color: '#dc2626' },
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
      backgroundColor: 'rgba(239,68,68,0.07)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
      borderRadius: 14, borderCurve: 'continuous', padding: 14, marginBottom: spacing.md,
    },
    warnTitle: { fontSize: typo.sm, fontWeight: '700', color: '#dc2626', fontFamily: 'Outfit_700Bold', marginBottom: 4 },
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
    // B2: section chip row
    chipRow: { paddingHorizontal: 14, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', paddingVertical: spacing.xs, marginBottom: spacing.xs },
    sChip: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 1 },
    sChipOn: { backgroundColor: 'rgba(128,0,0,0.82)', borderColor: 'transparent' },
    sChipDisabled: { opacity: 0.4 },
    sChipTxt: { fontSize: typo.sm, fontWeight: '600', color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
    sChipTxtOn: { color: '#fff' },
    // B1: subject/topic bar
    subjectBar: { paddingHorizontal: 14, marginBottom: spacing.xs },
    subjectBarText: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_600SemiBold' },
    subjectBold: { color: t.textPrimary, fontFamily: 'Lexend_600SemiBold', fontSize: typo.sm },
    subjectTopic: { color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontSize: typo.sm },
    qCard: {
      backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 20, borderCurve: 'continuous',
      padding: 18, marginHorizontal: 14, marginBottom: spacing.md,
    },
    qText: { fontSize: typo.lg, fontWeight: '600', color: t.textPrimary, lineHeight: 24, fontFamily: 'Outfit_600SemiBold' },
    opts: { gap: 9, paddingHorizontal: 14 },
    opt: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: t.surface, borderWidth: 1.5,
      borderColor: t.border, borderRadius: 16, borderCurve: 'continuous', paddingVertical: 13, paddingHorizontal: 13,
    },
    optOn: { backgroundColor: t.accentSurface, borderColor: t.accent },
    optLetter: { width: 30, height: 30, borderRadius: 9, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' },
    optLetterOn: { backgroundColor: t.accent },
    optLetterTxt: { fontSize: typo.sm, fontWeight: '700', color: t.textSecondary, fontFamily: 'Outfit_700Bold' },
    optTxt: { flex: 1, fontSize: typo.md, color: t.textPrimary, fontFamily: 'Lexend_400Regular', lineHeight: 19 },
    footer: {
      position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: spacing.sm, padding: 14,
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
    footPrimaryTxt: { fontSize: typo.md, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
    bandCard: {
      backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, borderRadius: 20, borderCurve: 'continuous',
      padding: 18, marginBottom: spacing.md, alignItems: 'center',
    },
    bandPct: { fontSize: 36, fontWeight: '700', color: t.accentText, fontFamily: 'Outfit_700Bold' },
    bandLabel: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginTop: 2 },
    bandBlurb: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', marginTop: 4, textAlign: 'center', lineHeight: 20 },
    bandDisclaimer: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 6, fontStyle: 'italic' },
    cutoffRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    verdictPill: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
    verdictOn: { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.30)' },
    verdictOff: { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)' },
    verdictTxt: { fontSize: typo.xs, fontFamily: 'Lexend_600SemiBold' },
    verdictTxtOn: { color: '#16a34a' },
    verdictTxtOff: { color: '#dc2626' },
    scoreCard: { borderRadius: 24, borderCurve: 'continuous', padding: 22, marginBottom: 18, borderWidth: 1, alignItems: 'center' },
    pass: { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.25)' },
    fail: { backgroundColor: 'rgba(239,68,68,0.07)', borderColor: 'rgba(239,68,68,0.20)' },
    scorePct: { fontSize: 52, fontWeight: '700', fontFamily: 'Outfit_700Bold' },
    scoreVerdict: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    scoreSub: { fontSize: typo.sm, color: t.textTertiary, marginTop: 2, fontFamily: 'Lexend_400Regular' },
    scorePenalty: { fontSize: typo.sm, fontWeight: '700', color: t.accentText, marginTop: 6, fontFamily: 'Lexend_600SemiBold' },
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
    reviewCard: { borderRadius: 16, borderCurve: 'continuous', borderWidth: 1, padding: 14, marginBottom: 10 },
    reviewOk: { backgroundColor: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.18)' },
    reviewBad: { backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.18)' },
    reviewQ: { fontSize: typo.md, fontWeight: '600', color: t.textPrimary, marginBottom: 8, fontFamily: 'Outfit_600SemiBold' },
    reviewOpt: { fontSize: typo.sm, color: t.textSecondary, lineHeight: 20, fontFamily: 'Lexend_400Regular' },
    reviewExp: { fontSize: typo.xs, color: t.textTertiary, marginTop: 8, lineHeight: 17, fontFamily: 'Lexend_400Regular' },
    footnote: { fontSize: typo.xs, color: t.textTertiary, marginTop: 10, marginBottom: 4, lineHeight: 17, fontFamily: 'Lexend_400Regular', fontStyle: 'italic' },
    primaryBtn: { backgroundColor: 'rgba(128,0,0,0.85)', borderRadius: 16, borderCurve: 'continuous', paddingVertical: 14, alignItems: 'center', marginTop: spacing.sm },
    primaryBtnTxt: { color: '#fff', fontWeight: '700', fontSize: typo.md, fontFamily: 'Outfit_700Bold' },
    ghostBtn: { paddingVertical: 12, alignItems: 'center' },
    ghostTxt: { color: t.textTertiary, fontSize: typo.sm, fontFamily: 'Lexend_400Regular' },
  })
}
