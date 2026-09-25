/**
 * Onboarding step model (redesign M2): one question per step, grouped into
 * four short sections for the progress indicator. Pure, so the order, the
 * position label and the resume point are unit-tested without rendering.
 */
export type StepId =
  | 'name' | 'grade' | 'school'
  | 'goals' | 'courses'
  | 'income' | 'gwa' | 'province'
  | 'check'

export type Section = 'About you' | 'Your goal' | 'Scholarship match' | 'Quick check'

interface StepDef {
  id: StepId
  section: Section
  /** Optional steps show "Skip this question"; required ones gate Continue. */
  optional: boolean
}

export const ONBOARDING_STEPS: readonly StepDef[] = [
  { id: 'name',     section: 'About you',         optional: false },
  { id: 'grade',    section: 'About you',         optional: false },
  { id: 'school',   section: 'About you',         optional: true },
  { id: 'goals',    section: 'Your goal',         optional: false },
  { id: 'courses',  section: 'Your goal',         optional: true },
  { id: 'income',   section: 'Scholarship match', optional: true },
  { id: 'gwa',      section: 'Scholarship match', optional: true },
  { id: 'province', section: 'Scholarship match', optional: true },
  { id: 'check',    section: 'Quick check',       optional: true },
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

/**
 * Where to pick up after a relaunch. Every answer is saved when the student
 * continues, so the saved profile is the resume record: the first unanswered
 * REQUIRED question. Optional steps already passed are not asked again.
 */
export function resumeStep(saved: { fullName?: string | null; gradeLevel?: number | null; hasFocus?: boolean }): StepId {
  if (!saved.fullName?.trim()) return 'name'
  if (!saved.gradeLevel) return 'grade'
  if (!saved.hasFocus) return 'goals'
  return 'courses'
}
