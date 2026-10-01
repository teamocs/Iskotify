/**
 * Onboarding step model (P4 short flow): four steps, consent first, then the
 * name and grade together, the exam, and an optional quick check. Everything
 * else (school, courses, the sensitive-data opt-in, income, GWA, province)
 * moved to the scholarship profile, which Today prompts for later. Pure, so the
 * order, the position label and the resume point are unit-tested without
 * rendering.
 */
export type StepId = 'consent' | 'about' | 'goals' | 'check'

export type Section = 'Before we start' | 'About you' | 'Your exam' | 'Quick check'

interface StepDef {
  id: StepId
  section: Section
  /** Optional steps show "Skip this question"; the rest gate Continue. */
  optional: boolean
}

export const ONBOARDING_STEPS: readonly StepDef[] = [
  { id: 'consent', section: 'Before we start', optional: false },
  { id: 'about',   section: 'About you',       optional: false },
  { id: 'goals',   section: 'Your exam',       optional: false },
  { id: 'check',   section: 'Quick check',     optional: true },
] as const

const IDS = ONBOARDING_STEPS.map(s => s.id)

export function stepPosition(id: StepId): { index: number; total: number; section: Section } {
  const i = IDS.indexOf(id)
  return { index: i + 1, total: IDS.length, section: ONBOARDING_STEPS[i]!.section }
}

export function nextStep(id: StepId): StepId | null {
  return IDS[IDS.indexOf(id) + 1] ?? null
}

export function prevStep(id: StepId): StepId | null {
  const i = IDS.indexOf(id)
  return i > 0 ? IDS[i - 1]! : null
}

export function isOptional(id: StepId): boolean {
  return ONBOARDING_STEPS.find(s => s.id === id)!.optional
}

/** Persisted progress marker: the furthest step completed, or 'done' once finished. */
export type ProgressMarker = StepId | 'done'

/**
 * Markers written by the older 11-step flow, mapped to the new step that now
 * covers the same ground. 'name' alone did not finish about-you (the grade was
 * still to come); the scholarship steps after the goal were folded into the
 * profile, so finishing any of them counts as finishing the exam step.
 */
const LEGACY_MARKERS: Record<string, ProgressMarker> = {
  name: 'consent',
  grade: 'about',
  school: 'about',
  courses: 'goals',
  sensitive: 'goals',
  income: 'goals',
  gwa: 'goals',
  province: 'goals',
}

/** A saved marker in today's terms, or null when there is none (or it is unknown). */
export function normalizeMarker(m: string | null | undefined): ProgressMarker | null {
  if (!m) return null
  if (m === 'done' || (IDS as string[]).includes(m)) return m as ProgressMarker
  return LEGACY_MARKERS[m] ?? null
}

/** Position of a saved marker: -1 = none/unknown, IDS.length = finished. */
function markerRank(m: string | null | undefined): number {
  const n = normalizeMarker(m)
  if (n === 'done') return IDS.length
  return n ? IDS.indexOf(n) : -1
}

/**
 * The marker to save after completing `completed`: the later of it and the
 * saved one, so going Back and answering again never moves resume backwards.
 * Always a current id: an old-flow marker is rewritten as the step it maps to.
 */
export function furthestStep(saved: string | null | undefined, completed: ProgressMarker): ProgressMarker {
  return markerRank(saved) > markerRank(completed) ? normalizeMarker(saved)! : completed
}

/**
 * Where to pick up after a relaunch, or 'done' when onboarding was finished.
 *
 * Missing consent always comes first: nothing else is asked (or resumed) until
 * the student has agreed to the Terms and Privacy Policy.
 *
 * `furthest` is the persisted marker (old-flow markers included, see
 * normalizeMarker): resume at the step after it, because the optional quick
 * check can't be judged by an answer. A missing REQUIRED answer always wins,
 * whatever the marker says. Without a marker (profiles saved before it
 * existed) the first unanswered required question decides, and a saved focus
 * resumes at the quick check.
 */
export function resumeStep(saved: {
  consented: boolean
  fullName?: string | null
  gradeLevel?: number | null
  hasFocus?: boolean
  furthest?: string | null
}): StepId | 'done' {
  if (!saved.consented) return 'consent'
  const required: StepId | null =
    !saved.fullName?.trim() || !saved.gradeLevel ? 'about'
      : !saved.hasFocus ? 'goals'
        : null
  const rank = markerRank(saved.furthest)
  if (rank < 0) return required ?? 'check'
  const next: StepId | 'done' = IDS[rank + 1] ?? 'done'
  if (required && (next === 'done' || IDS.indexOf(required) < IDS.indexOf(next))) return required
  return next
}
