/**
 * Onboarding step model (redesign M2): one question per step, grouped into
 * four short sections for the progress indicator. Pure, so the order, the
 * position label and the resume point are unit-tested without rendering.
 */
export type StepId =
  | 'consent'
  | 'name' | 'grade' | 'school'
  | 'goals' | 'courses'
  | 'sensitive' | 'income' | 'gwa' | 'province'
  | 'check'

export type Section = 'About you' | 'Your goal' | 'Scholarship match' | 'Quick check'

interface StepDef {
  id: StepId
  section: Section
  /** Optional steps show "Skip this question"; the rest gate Continue (or, for the opt-in, are a choice in themselves). */
  optional: boolean
}

export const ONBOARDING_STEPS: readonly StepDef[] = [
  { id: 'consent',   section: 'About you',         optional: false },
  { id: 'name',      section: 'About you',         optional: false },
  { id: 'grade',     section: 'About you',         optional: false },
  { id: 'school',    section: 'About you',         optional: true },
  { id: 'goals',     section: 'Your goal',         optional: false },
  { id: 'courses',   section: 'Your goal',         optional: true },
  { id: 'sensitive', section: 'Scholarship match', optional: false },
  { id: 'income',    section: 'Scholarship match', optional: true },
  { id: 'gwa',       section: 'Scholarship match', optional: true },
  { id: 'province',  section: 'Scholarship match', optional: true },
  { id: 'check',     section: 'Quick check',       optional: true },
] as const

const IDS = ONBOARDING_STEPS.map(s => s.id)

/**
 * Steps that collect sensitive personal information (household income, grades).
 * They are only shown after the student says yes on the 'sensitive' step.
 */
const SENSITIVE_STEPS: readonly StepId[] = ['income', 'gwa']

/** The steps this student will actually see. */
function activeIds(sensitive: boolean): StepId[] {
  return IDS.filter(id => sensitive || !SENSITIVE_STEPS.includes(id))
}

export function stepPosition(id: StepId, sensitive: boolean): { index: number; total: number; section: Section } {
  const ids = activeIds(sensitive)
  const i = ids.indexOf(id)
  return {
    index: (i < 0 ? IDS.indexOf(id) : i) + 1,
    total: ids.length,
    section: ONBOARDING_STEPS[IDS.indexOf(id)]!.section,
  }
}

export function nextStep(id: StepId, sensitive: boolean): StepId | null {
  const ids = activeIds(sensitive)
  const from = IDS.indexOf(id)
  return ids.find(x => IDS.indexOf(x) > from) ?? null
}

export function prevStep(id: StepId, sensitive: boolean): StepId | null {
  const ids = activeIds(sensitive)
  const from = IDS.indexOf(id)
  const before = ids.filter(x => IDS.indexOf(x) < from)
  return before[before.length - 1] ?? null
}

export function isOptional(id: StepId): boolean {
  return ONBOARDING_STEPS.find(s => s.id === id)!.optional
}

/** Persisted progress marker: the furthest step completed, or 'done' once finished. */
export type ProgressMarker = StepId | 'done'

/** Position of a saved marker: -1 = none/unknown, IDS.length = finished. */
function markerRank(m: string | null | undefined): number {
  if (m === 'done') return IDS.length
  return IDS.indexOf(m as StepId)
}

/**
 * The marker to save after completing `completed`: the later of it and the
 * saved one, so going Back and answering again never moves resume backwards.
 */
export function furthestStep(saved: string | null | undefined, completed: ProgressMarker): ProgressMarker {
  return markerRank(saved) > markerRank(completed) ? (saved as ProgressMarker) : completed
}

/**
 * Where to pick up after a relaunch, or 'done' when onboarding was finished.
 *
 * Missing consent always comes first: nothing else is asked (or resumed) until
 * the student has agreed to the Terms and Privacy Policy.
 *
 * `furthest` is the persisted marker: resume at the step after it, because an
 * optional step can't be judged by its answer (skipping it is a valid answer).
 * A missing REQUIRED answer always wins, whatever the marker says. Without a
 * marker (profiles saved before it existed) the first unanswered required
 * question decides, and a saved focus resumes at the courses. Steps that ask for
 * sensitive details are skipped unless `sensitive` consent is on.
 */
export function resumeStep(saved: {
  consented: boolean
  sensitive: boolean
  fullName?: string | null
  gradeLevel?: number | null
  hasFocus?: boolean
  furthest?: string | null
}): StepId | 'done' {
  if (!saved.consented) return 'consent'
  const required: StepId | null =
    !saved.fullName?.trim() ? 'name'
      : !saved.gradeLevel ? 'grade'
        : !saved.hasFocus ? 'goals'
          : null
  const rank = markerRank(saved.furthest)
  if (rank < 0) return required ?? 'courses'
  const next: StepId | 'done' = activeIds(saved.sensitive).find(x => IDS.indexOf(x) > rank) ?? 'done'
  if (required && (next === 'done' || IDS.indexOf(required) < IDS.indexOf(next))) return required
  return next
}
