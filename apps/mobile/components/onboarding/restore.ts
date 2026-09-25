/**
 * Rebuild the onboarding answers from what each step persisted, so a relaunch
 * mid-flow shows every earlier answer again (and the courses step can still
 * recommend from the chosen exams). Pure: reads the saved settings row and the
 * focus-listing slugs, the same storage the steps write to.
 */
import { examAcronymToListingSlug, type ExamOption, type CourseOption } from '../../utils/targetExams'
import { isSchoolFocusSlug, schoolFocusSlug } from '../../utils/focusSlug'
import { INCOME_BANDS, type IncomeBracket } from '../../utils/scholarshipMatch'

export interface SavedOnboardingSettings {
  targetExams?: string | null
  targetCourses?: string | null
  incomeBracket?: string | null
  gwa?: number | null
  province?: string | null
}

export interface RestoredAnswers {
  /**
   * Stubs carrying what the goal step saved (school id/name, exam acronym).
   * The screen swaps them for full catalog entries once the catalog loads,
   * which is what course recommendations read.
   */
  selectedExams: ExamOption[]
  /** Scholarship slugs: focus rows that no picked exam produced. */
  selectedSlugs: string[]
  selectedCourses: CourseOption[]
  incomeBracket: IncomeBracket | null
  gwaText: string
  province: string
}

function parseArray(json: string | null | undefined): Record<string, unknown>[] {
  try {
    const v = JSON.parse(json ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []
  } catch {
    return []
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** The focus slug the goal step writes for a picked exam (see confirmGoals). */
export function examFocusSlug(e: Pick<ExamOption, 'examAcronym' | 'schoolId'>): string {
  return examAcronymToListingSlug(e.examAcronym) ?? schoolFocusSlug(e.schoolId)
}

export function restoreAnswers(s: SavedOnboardingSettings | undefined, focusSlugs: string[]): RestoredAnswers {
  const selectedExams: ExamOption[] = parseArray(s?.targetExams)
    .filter(e => str(e.schoolId))
    .map(e => ({
      schoolId: str(e.schoolId),
      schoolName: str(e.schoolName),
      acronym: null,
      examAcronym: str(e.examAcronym),
      examName: null,
      examMonth: null,
      region: '',
      province: null,
      rankInProvince: null,
      national: false,
      knownForCourses: [],
      prcTopCourses: [],
    }))

  const fromExams = new Set(selectedExams.map(examFocusSlug))
  const selectedSlugs = Array.from(new Set(focusSlugs))
    .filter(slug => slug && !isSchoolFocusSlug(slug) && !fromExams.has(slug))

  const selectedCourses: CourseOption[] = parseArray(s?.targetCourses)
    .filter(c => str(c.id) && str(c.label))
    .map(c => ({
      id: str(c.id),
      label: str(c.label),
      careerCourseId: typeof c.careerCourseId === 'string' ? c.careerCourseId : null,
    }))

  const income = s?.incomeBracket ?? null
  const incomeBracket = income && income in INCOME_BANDS ? (income as IncomeBracket) : null

  return {
    selectedExams,
    selectedSlugs,
    selectedCourses,
    incomeBracket,
    gwaText: typeof s?.gwa === 'number' && Number.isFinite(s.gwa) ? String(s.gwa) : '',
    province: s?.province?.trim() ?? '',
  }
}
