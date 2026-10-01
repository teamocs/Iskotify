import type { ExamBlueprint, BlueprintSection } from '../services/examBlueprints'
import { isMissingRequiredFigure, groupIntoUnits, type QuestionUnit, type RawUpcatQuestion, type RawUpcatPassage, type ExamQuestion } from './upcatExam'
import { rankUnseenFirst, servedOrder, type SamplingOptions } from './unseenFirst'

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

/**
 * Pick whole units (passage sets / single questions) for a section target.
 * A passage set is never truncated or split. Units are visited unseen-first
 * (utils/unseenFirst: never-served units in random order, then the least
 * recently served; a plain shuffle with no history) and taken only while they
 * still fit within `target`; if a gap remains
 * and the smallest leftover unit lands closer to the target than staying short
 * does, that one unit is added (so a section overshoots by less than the gap it
 * would otherwise leave). When nothing fits (every unit is larger than the
 * target, e.g. one 5-question passage for a 3-item section) the smallest unit
 * is taken whole: a section may therefore exceed its target, but only by
 * finishing a passage, never by cutting one. The picked units are served in
 * random order (each still whole; utils/unseenFirst servedOrder).
 */
function pickUnits(units: QuestionUnit[], target: number, opts: SamplingOptions = {}): QuestionUnit[] {
  const rng = opts.rng ?? Math.random
  const goal = Math.max(1, target)
  const picked: QuestionUnit[] = []
  const leftover: QuestionUnit[] = []
  let count = 0
  for (const u of rankUnseenFirst(units, unit => unit.map(q => q.questionId), opts.seen, rng)) {
    if (count + u.length <= goal) { picked.push(u); count += u.length } else leftover.push(u)
  }
  if (leftover.length === 0) return servedOrder(picked, opts)
  // reduce keeps the FIRST of equal sizes, i.e. the best-ranked one.
  const smallest = leftover.reduce((a, b) => (b.length < a.length ? b : a))
  if (picked.length === 0) return [smallest]
  const deficit = goal - count
  if (deficit > 0 && smallest.length - deficit < deficit) picked.push(smallest)
  return servedOrder(picked, opts)
}

/** Build a timed mock from a blueprint: each section samples about item_count questions
 *  from its skill_category pool. Sections whose pool is empty are returned as comingSoon
 *  (shown in the structure preview, excluded from the runnable timed exam). Passage sets
 *  are kept whole and contiguous (sorted by setPosition) with the passage text attached to
 *  every question of the set, using the same grouping as the UPCAT subtest builder, and a
 *  question is never placed in two sections. `sampling` (P4) makes it
 *  unseen-first: pass the student's last-seen map for NEW runs only. */
export function buildBlueprintExam(
  blueprint: ExamBlueprint,
  questionsByCategory: Map<string, RawUpcatQuestion[]>,
  passages: RawUpcatPassage[],
  itemCountFor?: (section: BlueprintSection) => number,
  sampling: SamplingOptions = {},
): BuiltExam {
  const passageById = new Map(passages.map(p => [p.setId, p.passageText]))
  const runnable: BuiltSection[] = []
  const comingSoon: BlueprintSection[] = []
  // Ids already placed in an earlier section: sections sharing a skill_category
  // must not serve the same question twice in one sitting.
  const used = new Set<string>()
  for (const section of [...blueprint.sections].sort((a, b) => a.displayOrder - b.displayOrder)) {
    // Exclude questions whose required figure is missing (has_visual=true,
    // image_url=null) — a student must never see "refer to the diagram" with
    // no diagram. Filtered here (not just at the getQuestionsByCategory source)
    // so this holds regardless of how questionsByCategory was produced.
    const pool = (questionsByCategory.get(section.skillCategory) ?? []).filter(q => !isMissingRequiredFigure(q) && !used.has(q.questionId))
    if (pool.length === 0) { comingSoon.push(section); continue }
    const target = itemCountFor ? itemCountFor(section) : section.itemCount
    const picked = pickUnits(groupIntoUnits(pool), target, sampling).flat()
    for (const q of picked) used.add(q.questionId)
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
  /** section.id -> scaled minutes. Null only for a section without a declared time
   *  budget on a NON-blocked blueprint (its per-section clock never runs). */
  sectionMinutes: Map<string, number | null>
}

/**
 * Combine the two scalers over a built exam — the single call site (startExam
 * in app/practice/exam/[slug].tsx) needs both the total countdown and, for
 * section-blocked blueprints, each section's own countdown.
 *
 * The declared item total is the SUM of the sections' item_counts (runnable and
 * coming-soon alike), never blueprint.totalItems: that column can drift from
 * the sections (DOST-SEI live data: total_items 170, sections sum to 210), and
 * a ratio against the wrong denominator mis-sizes the whole clock.
 *
 * Section-blocked blueprints run one clock per section, so:
 *  - a section with no declared minutes takes an equal share of what is left of
 *    the (scaled) blueprint total after the sections that do declare minutes,
 *    so a null never means "expires instantly" in one place and "whole exam"
 *    in another. If the declared sections already use the whole total, its share
 *    is its item-proportional slice (its questions / all questions * scaled
 *    total) instead; either way never less than 1 minute per 2 questions;
 *  - the total is the SUM of the scaled section clocks, which also means it can
 *    never be shorter than the sections it contains (a coming-soon section
 *    dropping out, or sections declaring more than the blueprint total, used to
 *    let the total clock auto-submit before the last section clock ended).
 */
export function scaleBlueprintTiming(
  blueprint: { totalItems?: number; totalTimeMinutes: number; sectionBlocked?: boolean },
  built: BuiltExam,
): ScaledBlueprintTiming {
  const declaredTotal =
    built.runnable.reduce((n, bs) => n + bs.section.itemCount, 0) +
    built.comingSoon.reduce((n, s) => n + s.itemCount, 0)
  const scaledTotal = scaleExamTimeMinutes(blueprint.totalTimeMinutes, built.totalQuestions, declaredTotal)
  const sectionMinutes = new Map<string, number | null>()
  for (const bs of built.runnable) {
    sectionMinutes.set(bs.section.id, scaleSectionTimeMinutes(bs.section.timeMinutes, bs.questions.length, bs.section.itemCount))
  }
  if (!blueprint.sectionBlocked) return { totalMinutes: scaledTotal, sectionMinutes }

  const nullSections = built.runnable.filter(bs => sectionMinutes.get(bs.section.id) == null)
  if (nullSections.length > 0) {
    let declared = 0
    for (const m of sectionMinutes.values()) declared += m ?? 0
    const remaining = scaledTotal - declared
    const sumItems = built.runnable.reduce((n, bs) => n + bs.questions.length, 0)
    for (const bs of nullSections) {
      const n = bs.questions.length
      // Normal case: an equal share of what the declared sections left over. When the
      // declared sections already use up the whole total there is nothing left to share,
      // so fall back to this section's item-proportional slice of the scaled total.
      const base = remaining > 0
        ? remaining / nullSections.length
        : sumItems > 0 ? (n / sumItems) * scaledTotal : 1
      // Never tighter than 1 minute per 2 questions (and never under 1 minute).
      sectionMinutes.set(bs.section.id, Math.max(1, Math.ceil(n / 2), Math.round(base)))
    }
  }
  let sum = 0
  for (const m of sectionMinutes.values()) sum += m ?? 0
  return { totalMinutes: sum > 0 ? sum : scaledTotal, sectionMinutes }
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
 * comingSoon exactly like the full mock. Same unseen-first `sampling`.
 */
export function buildStudySprintExam(
  blueprint: ExamBlueprint,
  questionsByCategory: Map<string, RawUpcatQuestion[]>,
  passages: RawUpcatPassage[],
  sprintMinutes: number = STUDY_SPRINT_MINUTES,
  sampling: SamplingOptions = {},
): BuiltExam {
  const counts = computeSprintItemCounts(blueprint.sections, blueprint.totalTimeMinutes, sprintMinutes)
  return buildBlueprintExam(blueprint, questionsByCategory, passages, sec => counts.get(sec.id) ?? sec.itemCount, sampling)
}

/**
 * The item count the prestart will build, from per-category runnable counts alone (no
 * question rows): sections in display order each take min(item_count, still unused in
 * their category) since sections sharing a category never serve a question twice, and a
 * section with nothing left is left out, like buildBlueprintExam's comingSoon. Passage
 * sets are kept whole when the real build picks units, so it can overshoot by finishing a
 * passage; this is the item_count / pool-size figure.
 */
export function plannedItemCount(
  sections: readonly { skillCategory: string; itemCount: number; displayOrder: number }[],
  runnableByCategory: ReadonlyMap<string, number>,
): number {
  const left = new Map(runnableByCategory)
  let total = 0
  for (const sec of [...sections].sort((a, b) => a.displayOrder - b.displayOrder)) {
    const avail = left.get(sec.skillCategory) ?? 0
    const take = Math.min(sec.itemCount, avail)
    if (take <= 0) continue
    left.set(sec.skillCategory, avail - take)
    total += take
  }
  return total
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

export interface ScoreBand { band: string; blurb: string }

/**
 * Fix 3 (exam safety): this used to be `estimatePercentileBand`, returning a
 * `percentile` field that was really just raw % correct relabeled — it drove
 * "Below cut-off (need Nth)" verdict pills that read like a normed
 * qualification score. There is no percentile concept here anymore: a
 * descriptive, non-judgemental band + blurb only, derived straight from raw
 * % correct (clamped so extreme inputs still land on the top/bottom band).
 */
export function scoreBand(pct: number): ScoreBand {
  const clamped = Math.max(0, Math.min(100, pct))
  if (clamped >= 90) return { band: 'Top tier', blurb: 'On track for the most selective programs.' }
  if (clamped >= 75) return { band: 'Competitive', blurb: 'Strong — competitive for many programs.' }
  if (clamped >= 50) return { band: 'Developing', blurb: 'Building up — keep drilling weak sections.' }
  return { band: 'Foundational', blurb: 'Focus on fundamentals before timed mocks.' }
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

/**
 * The exam's real timer for lists and labels: a section-locked exam runs on its
 * section clocks, so their sum is what the student gets; otherwise the
 * blueprint total. (The runner may scale either down for a thin pool.)
 */
export function examMinutes(bp: { sectionBlocked?: boolean; totalTimeMinutes: number; sections: readonly { timeMinutes: number | null }[] }): number {
  const sectionMinutes = bp.sections.reduce((n, s) => n + (s.timeMinutes ?? 0), 0)
  return bp.sectionBlocked && sectionMinutes > 0 ? sectionMinutes : bp.totalTimeMinutes
}
