/**
 * The web glimpse (P4), pure rules. A signed-out web visitor (iOS has no app
 * yet) may take the free diagnostic, then is invited to create a free account.
 * Routing lives in utils/webEntryTarget.ts (GUEST_ROUTES); the device side in
 * services/guestPreview.ts.
 */
import type { RunnableBlueprint } from '../services/examBlueprints'
import { DIAGNOSTIC_SUBTESTS, QUESTIONS_PER_SUBTEST } from './diagnosticExam'
import { BLUEPRINT_DIAGNOSTIC_MAX_QUESTIONS, examSlugLabel } from './diagnosticTarget'

export const GUEST_INTRO_HREF = '/try'
/** Where the guest's results send them: sign-in, opened on the create-account form. */
export const GUEST_SIGNUP_HREF = '/auth/sign-in?mode=signup'

export interface GuestExamOption {
  slug: string
  acronym: string
  name: string
  /** The most questions this diagnostic can have (one minute each). */
  maxQuestions: number
}

const UPCAT_OPTION: GuestExamOption = {
  slug: 'upcat',
  acronym: 'UPCAT',
  name: 'UP College Admission Test',
  maxQuestions: DIAGNOSTIC_SUBTESTS.length * QUESTIONS_PER_SUBTEST,
}

/**
 * The exams a guest can try: UPCAT (its diagnostic always builds, from the bank
 * or the bundled set), then every exam with a runnable blueprint, in display
 * order. An exam with nothing runnable is never offered.
 */
export function buildGuestExamOptions(runnable: readonly RunnableBlueprint[]): GuestExamOption[] {
  const rest = runnable
    .filter(b => b.slug !== UPCAT_OPTION.slug)
    .map(b => ({
      slug: b.slug,
      acronym: b.acronym || examSlugLabel(b.slug),
      name: b.name,
      maxQuestions: Math.max(1, Math.min(BLUEPRINT_DIAGNOSTIC_MAX_QUESTIONS, b.items)),
    }))
  return [UPCAT_OPTION, ...rest]
}

export function guestExamCaption(o: Pick<GuestExamOption, 'maxQuestions'>): string {
  return `Up to ${o.maxQuestions} ${o.maxQuestions === 1 ? 'question' : 'questions'} · one minute each`
}

export function guestDiagnosticHref(slug: string): string {
  return `/practice/diagnostic?exam=${encodeURIComponent(slug)}`
}

const filled = (v: unknown): boolean => typeof v === 'string' && v.trim() !== ''

/**
 * True when this browser still holds an account's data (someone signed out but
 * kept it here). A guest run would then be written into that person's data and
 * uploaded the next time they sign in, so the preview is not offered there.
 */
export function isDeviceHeldByAccount(
  s: { ownerUserId?: string | null; googleId?: string | null; email?: string | null; fullName?: string | null } | undefined,
): boolean {
  if (!s) return false
  return filled(s.ownerUserId) || filled(s.googleId) || filled(s.email) || filled(s.fullName)
}
