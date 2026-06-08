// Pure logic for the onboarding "Target University Exams" + "Target Courses" steps.
// Operates on already-loaded Drizzle rows so it is easy to unit-test.

import { canonicalizeRegion, isNcr } from './region'

export interface TertiarySchoolRow {
  id: string
  name: string
  acronym: string | null
  region: string | null
  province: string | null
  rankInProvince: number | null
}

export interface UniversityProfileRow {
  schoolId: string
  dataTier: string | null
  entranceExamAcronym: string | null
  entranceExamName: string | null
  examMonth: string | null
  knownForCourses: string[]
  prcTopCourses: string[]
}

export interface ExamOption {
  schoolId: string
  schoolName: string
  acronym: string | null
  examAcronym: string
  examName: string | null
  examMonth: string | null
  region: string
  province: string | null
  rankInProvince: number | null
  national: boolean
  knownForCourses: string[]
  prcTopCourses: string[]
}

const NON_EXAM = new Set(['', 'n/a', 'na', 'none', 'tba', 'unknown', 'verify', '—', '-'])

/** A university has a real entrance exam when the acronym isn't a sentinel/"N/A …" note. */
export function isRealExamAcronym(acronym: string | null | undefined): boolean {
  const v = (acronym ?? '').trim().toLowerCase()
  if (!v || NON_EXAM.has(v)) return false
  if (v.startsWith('n/a')) return false // e.g. "N/A (no separate entrance test)"
  return true
}

/**
 * Build the catalog of selectable university exams from the synced
 * university_profiles ⋈ tertiary_schools rows. One option per school that has a
 * real entrance exam.
 */
export function buildExamCatalog(
  profiles: UniversityProfileRow[],
  schools: TertiarySchoolRow[],
): ExamOption[] {
  const byId = new Map(schools.map(s => [s.id, s]))
  const out: ExamOption[] = []
  for (const p of profiles) {
    if (!isRealExamAcronym(p.entranceExamAcronym)) continue
    const s = byId.get(p.schoolId)
    if (!s) continue
    out.push({
      schoolId: p.schoolId,
      schoolName: s.name,
      acronym: s.acronym,
      examAcronym: (p.entranceExamAcronym ?? '').trim(),
      examName: (p.entranceExamName ?? '').trim() || null,
      examMonth: (p.examMonth ?? '').trim() || null,
      region: canonicalizeRegion(s.region),
      province: s.province,
      rankInProvince: s.rankInProvince,
      national: p.dataTier === 'FULL_PROFILE' || isNcr(s.region),
      knownForCourses: p.knownForCourses ?? [],
      prcTopCourses: p.prcTopCourses ?? [],
    })
  }
  return out
}

/**
 * Order: national (top PH / curated / NCR) first, then the user's own region,
 * then the rest. Within each group, by province rank (nulls last) then name.
 */
export function orderExams(options: ExamOption[], userRegion: string | null | undefined): ExamOption[] {
  const uReg = canonicalizeRegion(userRegion)
  const groupRank = (o: ExamOption) => (o.national ? 0 : uReg && o.region === uReg ? 1 : 2)
  return [...options].sort((a, b) => {
    const ga = groupRank(a)
    const gb = groupRank(b)
    if (ga !== gb) return ga - gb
    const pa = a.rankInProvince ?? Number.POSITIVE_INFINITY
    const pb = b.rankInProvince ?? Number.POSITIVE_INFINITY
    if (pa !== pb) return pa - pb
    return a.schoolName.localeCompare(b.schoolName)
  })
}

export function searchExams(options: ExamOption[], query: string): ExamOption[] {
  const q = query.trim().toLowerCase()
  if (!q) return options
  return options.filter(o =>
    o.schoolName.toLowerCase().includes(q) ||
    (o.acronym ?? '').toLowerCase().includes(q) ||
    o.examAcronym.toLowerCase().includes(q) ||
    (o.examName ?? '').toLowerCase().includes(q),
  )
}

// Map a university's entrance-exam acronym to a curated `listings.slug` (the
// flashcard/focus tagging key) where one exists. Only UPCAT has authored content
// today, but the rest keep the focus model consistent.
const ACRONYM_TO_SLUG: Array<[string, string]> = [
  ['UPCAT', 'upcat'],
  ['ACET', 'acet'],
  ['DCAT', 'dcat-dlsu'],
  ['USTET', 'ustet'],
  ['PUPCET', 'pupcet'],
  ['MSU-SASE', 'msu-sase'],
  ['SASE', 'msu-sase'],
  ['BUCET', 'bucet'],
  ['ADNU', 'adnu-cea'],
  ['FEUCAT', 'feucat'],
  ['MPASS', 'mpass-mapua'],
  ['BEE', 'bee-benilde'],
]

export function examAcronymToListingSlug(acronym: string | null | undefined): string | null {
  const key = (acronym ?? '').trim().toUpperCase()
  if (!key) return null
  for (const [k, v] of ACRONYM_TO_SLUG) if (key === k) return v
  for (const [k, v] of ACRONYM_TO_SLUG) if (key.includes(k)) return v
  return null
}

// ── Target Courses ────────────────────────────────────────────────────────────

export interface TaxonomyRow { courseTab: string; careerCourseId: string | null; label: string | null }
export interface CareerCourseRow { courseId: string; name: string | null }
export interface CourseOption { id: string; label: string; careerCourseId: string | null }

function norm(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** The full searchable course list: taxonomy labels first, then career courses. */
export function allCourseOptions(taxonomy: TaxonomyRow[], careerCourses: CareerCourseRow[]): CourseOption[] {
  const out: CourseOption[] = []
  const seen = new Set<string>()
  for (const t of taxonomy) {
    if (!t.label) continue
    const k = norm(t.label)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push({ id: `tax:${t.courseTab}`, label: t.label, careerCourseId: t.careerCourseId })
  }
  for (const c of careerCourses) {
    if (!c.name) continue
    const k = norm(c.name)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push({ id: `cc:${c.courseId}`, label: c.name, careerCourseId: c.courseId })
  }
  return out.sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Recommend courses from the selected exams' universities: fuzzy-match each
 * university's known_for / prc_top course strings against the canonical course
 * labels (taxonomy preferred, then career courses).
 */
export function recommendCourses(
  selectedExams: ExamOption[],
  taxonomy: TaxonomyRow[],
  careerCourses: CareerCourseRow[],
): CourseOption[] {
  const candidates = new Set<string>()
  for (const e of selectedExams) {
    for (const c of [...e.prcTopCourses, ...e.knownForCourses]) {
      const n = norm(c)
      if (n) candidates.add(n)
    }
  }
  const taxIdx = taxonomy.filter(t => t.label).map(t => ({ t, n: norm(t.label) }))
  const ccIdx = careerCourses.filter(c => c.name).map(c => ({ c, n: norm(c.name) }))
  const out: CourseOption[] = []
  const seen = new Set<string>()
  const add = (id: string, label: string, ccid: string | null) => {
    const k = label.toLowerCase()
    if (!seen.has(k)) { seen.add(k); out.push({ id, label, careerCourseId: ccid }) }
  }
  for (const s of candidates) {
    const tax = taxIdx.find(({ n }) => n && (n === s || n.includes(s) || s.includes(n)))
    if (tax) { add(`tax:${tax.t.courseTab}`, tax.t.label!, tax.t.careerCourseId); continue }
    const cc = ccIdx.find(({ n }) => n && (n === s || n.includes(s) || s.includes(n)))
    if (cc) add(`cc:${cc.c.courseId}`, cc.c.name!, cc.c.courseId)
  }
  return out
}
