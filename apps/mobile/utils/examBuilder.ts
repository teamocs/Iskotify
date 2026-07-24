import type { ExamBlueprint, BlueprintSection } from '../services/examBlueprints'
import type { RawUpcatQuestion, RawUpcatPassage, ExamQuestion } from './upcatExam'

// ---------------------------------------------------------------------------
// Section chip state (B2)
// ---------------------------------------------------------------------------

export interface SectionChip { name: string; start: number; active: boolean; disabled: boolean }

/**
 * Compute display state for the section-chip row shown under the QuestionNavigator.
 *
 * @param bounds        Array of { name, start, end } section boundaries.
 * @param idx           Current flat question index.
 * @param floorIdx      Lowest index the user may navigate back to (sections before this are locked).
 * @param sectionBlocked  Whether the blueprint enforces section-locked timing.
 */
export function sectionChipState(
  bounds: { name: string; start: number; end: number }[],
  idx: number,
  floorIdx: number,
  sectionBlocked: boolean,
): SectionChip[] {
  return bounds.map(b => {
    const active = b.start <= idx && idx < b.end
    const disabled = sectionBlocked ? !active : false
    return { name: b.name, start: b.start, active, disabled }
  })
}

export interface BuiltSection { section: BlueprintSection; questions: ExamQuestion[]; available: number }
export interface BuiltExam { runnable: BuiltSection[]; comingSoon: BlueprintSection[]; totalQuestions: number }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!] }
  return a
}

/** Build a timed mock from a blueprint: each section samples up to item_count questions
 *  from its skill_category pool. Sections whose pool is empty are returned as comingSoon
 *  (shown in the structure preview, excluded from the runnable timed exam). Passage sets
 *  are kept contiguous and the passage text is attached. */
export function buildBlueprintExam(
  blueprint: ExamBlueprint,
  questionsByCategory: Map<string, RawUpcatQuestion[]>,
  passages: RawUpcatPassage[],
  itemCountFor?: (section: BlueprintSection) => number,
): BuiltExam {
  const passageById = new Map(passages.map(p => [p.setId, p.passageText]))
  const runnable: BuiltSection[] = []
  const comingSoon: BlueprintSection[] = []
  for (const section of [...blueprint.sections].sort((a, b) => a.displayOrder - b.displayOrder)) {
    const pool = questionsByCategory.get(section.skillCategory) ?? []
    if (pool.length === 0) { comingSoon.push(section); continue }
    const target = itemCountFor ? itemCountFor(section) : section.itemCount
    const picked = shuffle(pool).slice(0, Math.max(1, target))
    const questions: ExamQuestion[] = picked.map(q => ({ ...q, passageText: q.setId ? (passageById.get(q.setId) ?? null) : null }))
    runnable.push({ section, questions, available: pool.length })
  }
  return { runnable, comingSoon, totalQuestions: runnable.reduce((n, s) => n + s.questions.length, 0) }
}

// ---------------------------------------------------------------------------
// Timer scaling (Task 4) — a thin question pool can sample far fewer questions
// than a blueprint declares (buildBlueprintExam caps each section at the
// available pool size). Left unscaled, the countdown would still run the FULL
// declared time against a short exam. These are pure so the math is unit-
// tested independent of the [slug].tsx screen that arms the timers.
// ---------------------------------------------------------------------------

/**
 * Scale a blueprint's total time budget down when the runnable exam sampled
 * fewer questions than the blueprint declares. Never scales UP (an over-
 * supplied or exactly-matched pool keeps the declared time). Always at least
 * 1 minute. Guards divide-by-zero when declaredTotal is 0.
 */
export function scaleExamTimeMinutes(totalTimeMinutes: number, sampledTotal: number, declaredTotal: number): number {
  if (declaredTotal <= 0 || sampledTotal >= declaredTotal) return totalTimeMinutes
  return Math.max(1, Math.round((totalTimeMinutes * sampledTotal) / declaredTotal))
}

/**
 * Same scaling, applied to a single section's own declared time budget using
 * ITS OWN sampled/declared ratio (not the blueprint-wide ratio) — sections
 * shrink independently since pool availability varies per skill category.
 * Sections without a declared time budget (timeMinutes === null, i.e.
 * unblocked blueprints) pass through unchanged.
 */
export function scaleSectionTimeMinutes(sectionTimeMinutes: number | null, sampledCount: number, declaredCount: number): number | null {
  if (sectionTimeMinutes == null) return null
  if (declaredCount <= 0 || sampledCount >= declaredCount) return sectionTimeMinutes
  return Math.max(1, Math.round((sectionTimeMinutes * sampledCount) / declaredCount))
}

export interface ScaledBlueprintTiming {
  totalMinutes: number
  /** section.id -> scaled minutes (null when the section has no declared time budget). */
  sectionMinutes: Map<string, number | null>
}

/**
 * Combine the two scalers over a built exam — the single call site (startExam
 * in app/practice/exam/[slug].tsx) needs both the total countdown and, for
 * section-blocked blueprints, each section's own countdown.
 */
export function scaleBlueprintTiming(
  blueprint: { totalItems: number; totalTimeMinutes: number },
  built: BuiltExam,
): ScaledBlueprintTiming {
  const totalMinutes = scaleExamTimeMinutes(blueprint.totalTimeMinutes, built.totalQuestions, blueprint.totalItems)
  const sectionMinutes = new Map<string, number | null>()
  for (const bs of built.runnable) {
    sectionMinutes.set(bs.section.id, scaleSectionTimeMinutes(bs.section.timeMinutes, bs.questions.length, bs.section.itemCount))
  }
  return { totalMinutes, sectionMinutes }
}

// ---------------------------------------------------------------------------
// Study Sprint (Task 4) — a fixed 30-minute mode that proportionally samples
// fewer questions per section so a full mock's pacing roughly holds at 1/9th
// the length (or whatever fraction of the declared total the fixed sprint
// budget represents).
// ---------------------------------------------------------------------------

export const STUDY_SPRINT_MINUTES = 30

/**
 * Study Sprint item budget per section: proportionally scale each section's
 * declared item_count down to fit the sprint's fixed minute budget
 * (round-to-nearest, minimum 1 so any section with content still appears).
 * Guards divide-by-zero by returning the full item_count when totalTimeMinutes
 * is 0.
 */
export function computeSprintItemCounts(
  sections: readonly { id: string; itemCount: number }[],
  totalTimeMinutes: number,
  sprintMinutes: number = STUDY_SPRINT_MINUTES,
): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of sections) {
    const scaled = totalTimeMinutes > 0 ? Math.round((s.itemCount * sprintMinutes) / totalTimeMinutes) : s.itemCount
    map.set(s.id, Math.max(1, scaled))
  }
  return map
}

/**
 * Build a Study Sprint exam: same section/pool sampling as buildBlueprintExam,
 * but each section's item_count is first scaled down to the sprint budget via
 * computeSprintItemCounts. Sections with an empty pool are still excluded as
 * comingSoon exactly like the full mock.
 */
export function buildStudySprintExam(
  blueprint: ExamBlueprint,
  questionsByCategory: Map<string, RawUpcatQuestion[]>,
  passages: RawUpcatPassage[],
  sprintMinutes: number = STUDY_SPRINT_MINUTES,
): BuiltExam {
  const counts = computeSprintItemCounts(blueprint.sections, blueprint.totalTimeMinutes, sprintMinutes)
  return buildBlueprintExam(blueprint, questionsByCategory, passages, sec => counts.get(sec.id) ?? sec.itemCount)
}

export interface PenaltyScore { raw: number; adjusted: number; correct: number; wrong: number; blank: number }

/** Raw = correct; adjusted subtracts penalty×wrong when the exam has a guessing penalty
 *  (blanks are never penalized). */
export function scoreBlueprintExam(total: number, correct: number, wrong: number, hasPenalty: boolean, penalty: number): PenaltyScore {
  const blank = Math.max(0, total - correct - wrong)
  const adjusted = hasPenalty ? correct - penalty * wrong : correct
  return { raw: correct, adjusted, correct, wrong, blank }
}

export interface CourseNote { courseCluster: string; note: string; minPercentile: number | null }

/** Keep universal ("all") notes plus any whose cluster the student is targeting.
 *  Empty clusters (student set no target courses) → return all notes unfiltered. */
export function filterCourseNotesByClusters<T extends { courseCluster: string }>(notes: T[], clusters: string[]): T[] {
  if (clusters.length === 0) return notes
  const set = new Set(clusters.map(c => c.trim().toLowerCase()))
  return notes.filter(n => {
    const c = n.courseCluster.trim().toLowerCase()
    return c === 'all' || set.has(c)
  })
}

export interface PercentileBand { percentile: number; band: string; blurb: string }

/** Honest, distribution-free estimate: percentile ≈ raw % correct, clamped to [1,99].
 *  Labelled "estimated" in the UI — NOT a normed score. */
export function estimatePercentileBand(pct: number): PercentileBand {
  const percentile = Math.max(1, Math.min(99, Math.round(pct)))
  let band: string, blurb: string
  if (percentile >= 90) { band = 'Top tier'; blurb = 'On track for the most selective programs.' }
  else if (percentile >= 75) { band = 'Competitive'; blurb = 'Strong — competitive for many programs.' }
  else if (percentile >= 50) { band = 'Developing'; blurb = 'Building up — keep drilling weak sections.' }
  else { band = 'Foundational'; blurb = 'Focus on fundamentals before timed mocks.' }
  return { percentile, band, blurb }
}

// ---------------------------------------------------------------------------
// Blueprint ordering helper (C2)
// ---------------------------------------------------------------------------

/**
 * Recommended-first ordering: blueprints whose slug appears in focusSlugs come first,
 * ordered by their position in focusSlugs (focus priority); the rest keep their existing
 * relative order (displayOrder from the query). Pure — caller slices to cap.
 */
export function orderBlueprintsForUser<T extends { slug: string }>(blueprints: T[], focusSlugs: string[]): T[] {
  const focusSet = new Set(focusSlugs)
  const focusIndex = new Map(focusSlugs.map((slug, i) => [slug, i]))
  // ?? 0 is belt-and-suspenders: both slugs are already confirmed in focusSet above,
  // so focusIndex.get() will always return a number — the fallback is unreachable.
  const focused = blueprints.filter(b => focusSet.has(b.slug)).sort((a, b) => (focusIndex.get(a.slug) ?? 0) - (focusIndex.get(b.slug) ?? 0))
  const rest = blueprints.filter(b => !focusSet.has(b.slug))
  return [...focused, ...rest]
}

// ---------------------------------------------------------------------------
// Review grouping helpers (Wave 3b)
// ---------------------------------------------------------------------------

export interface ReviewQuestionRef {
  /** Flat index into the questions array */
  flatIndex: number
  /** 'incorrect' | 'unanswered' | 'correct' — for wrong-first ordering */
  status: 'incorrect' | 'unanswered' | 'correct'
}

export interface ReviewSection {
  sectionName: string
  /** Sorted: incorrect first, then unanswered, then correct. Within each bucket the original relative order is preserved. */
  questionRefs: ReviewQuestionRef[]
  correct: number
  total: number
}

/**
 * Group a flat question list into per-section review buckets with wrong-first ordering.
 *
 * @param questions  Flat array of `{ sectionName: string }` items (any superset of this shape).
 * @param answers    Map of flat index → selected option index.
 * @param correctIndexes  Map of flat index → correct option index.
 * @returns Array of ReviewSection in the order the sections first appear in `questions`.
 */
export function groupReviewBySection(
  questions: ReadonlyArray<{ sectionName: string }>,
  answers: Readonly<Record<number, number>>,
  correctIndexes: ReadonlyArray<number>,
): ReviewSection[] {
  const sectionOrder: string[] = []
  const sectionMap = new Map<string, { incorrect: ReviewQuestionRef[]; unanswered: ReviewQuestionRef[]; correct: ReviewQuestionRef[] }>()

  questions.forEach((fq, i) => {
    const name = fq.sectionName
    if (!sectionMap.has(name)) {
      sectionOrder.push(name)
      sectionMap.set(name, { incorrect: [], unanswered: [], correct: [] })
    }
    const bucket = sectionMap.get(name)!
    const sel = answers[i]
    const correctIdx = correctIndexes[i]!
    let status: ReviewQuestionRef['status']
    if (sel === undefined) {
      status = 'unanswered'
    } else if (sel === correctIdx) {
      status = 'correct'
    } else {
      status = 'incorrect'
    }
    bucket[status === 'incorrect' ? 'incorrect' : status === 'unanswered' ? 'unanswered' : 'correct'].push({ flatIndex: i, status })
  })

  return sectionOrder.map(name => {
    const b = sectionMap.get(name)!
    const questionRefs = [...b.incorrect, ...b.unanswered, ...b.correct]
    const correct = b.correct.length
    const total = questionRefs.length
    return { sectionName: name, questionRefs, correct, total }
  })
}
