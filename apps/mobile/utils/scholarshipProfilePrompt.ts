/**
 * The "Complete your scholarship profile" prompt on Today (P4). The short
 * onboarding stops at name, grade and exam; the school, target courses,
 * province and the sensitive-data opt-in (grades, income) are filled in later
 * on the scholarship profile. Pure, so what counts as missing is unit-tested.
 */
import { hasSensitiveConsent } from './consent'

export interface ScholarshipPromptSettings {
  school?: string | null
  province?: string | null
  /** JSON array of the picked courses, as user_settings stores it. */
  targetCourses?: string | null
  sensitiveConsentAt?: number | null
  /** When the student said no to (or withdrew) sharing grades and income; 0 = never. */
  sensitiveWithdrawnAt?: number | null
  /** 'minor' | 'adult' | '' from the consent step. */
  ageBand?: string | null
  gwa?: number | null
  /** When the student dismissed the prompt, epoch ms; 0 = never. */
  profilePromptDismissedAt?: number | null
}

export type ScholarshipGap = 'school' | 'target courses' | 'province' | 'grades and income'

function hasCourses(json: string | null | undefined): boolean {
  try {
    const v: unknown = JSON.parse(json ?? '[]')
    return Array.isArray(v) && v.length > 0
  } catch {
    return false
  }
}

/** The parts of the scholarship profile still missing, in the order the profile screen shows them. */
export function scholarshipProfileGaps(s: ScholarshipPromptSettings): ScholarshipGap[] {
  const gaps: ScholarshipGap[] = []
  if (!s.school?.trim()) gaps.push('school')
  if (!hasCourses(s.targetCourses)) gaps.push('target courses')
  if (!s.province?.trim()) gaps.push('province')
  // Grades and income need their own opt-in. Ask an adult who opted in but has no
  // GWA yet, or who never decided. Never re-ask after a no or a withdrawal, and
  // never nudge an under-18 student toward sharing sensitive data (RA 10173).
  const consented = hasSensitiveConsent({ sensitiveConsentAt: s.sensitiveConsentAt })
  const declined = Number(s.sensitiveWithdrawnAt ?? 0) > 0
  if (consented ? s.gwa == null : !declined && s.ageBand !== 'minor') gaps.push('grades and income')
  return gaps
}

/** Show the prompt while something is missing, until the student dismisses it. */
export function shouldShowScholarshipPrompt(s: ScholarshipPromptSettings | null | undefined): boolean {
  if (!s) return false
  if (Number(s.profilePromptDismissedAt ?? 0) > 0) return false
  return scholarshipProfileGaps(s).length > 0
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join('')
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

export function scholarshipPromptMessage(gaps: ScholarshipGap[]): string {
  return `Add your ${list(gaps)} to see the scholarships you can apply for.`
}
