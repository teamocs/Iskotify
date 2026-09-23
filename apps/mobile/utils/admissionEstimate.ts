// On-device Estimated Admission Score (UPCAT). A pure port of the server RPC
// estimate_admission_score (supabase/migrations/020_admission_score.sql), so the
// estimator works offline like the rest of the app. The regression coefficients
// are the published Manlapaz (1976) model; nothing here is confidential.
//
// Compliance (UP Office of Admissions): this is NOT a student's UPG. Every screen
// that shows these numbers must say "Estimated Admission Score", describe campus
// status as "may qualify based on historical cutoffs", and carry the disclaimer
// in components/estimator/ScoreDisclaimerModal.tsx. No UP branding.

export type SchoolType =
  | 'public_general' | 'public_vocational' | 'public_barangay'
  | 'public_science' | 'private' | string

export interface EstimateInput {
  /** High-school GWA, Grades 8–11, 0–100. */
  hsGWA: number
  /** Percent correct per UPCAT subtest, 0–100. */
  math: number
  reading: number
  language: number
  science: number
  schoolType?: SchoolType | null
  isIndigenous?: boolean | null
  targetCampusFar?: boolean | null
}

export interface CutoffRow {
  campus: string
  program: string | null
  cutoff: number
  year: number | null
  isEstimate: boolean
}

export type CampusStatus = 'Likely' | 'Possible' | 'Unlikely'

export interface CampusResult extends CutoffRow {
  status: CampusStatus
  /** Estimate minus cutoff; ≤ 0 means the point estimate already meets it. */
  gap: number
}

export interface EstimateResult {
  point: number
  low: number
  high: number
  eeas: { palugit: number; pabigat: number; eligiblePalugit: boolean }
  campuses: CampusResult[]
}

// Static population baselines (mean, SD) — same values as the server RPC.
const BASELINE = {
  math: [50, 12],
  reading: [58, 10],
  language: [62, 9],
  science: [52, 11],
  hsGWA: [88, 5],
} as const

// Excellence and Equity Admission System adjustments.
const PALUGIT = 0.05 // public-school / IP applicants
const PABIGAT = 0.05 // applying to a campus far from home
const PALUGIT_SCHOOLS = new Set(['public_general', 'public_vocational', 'public_barangay'])

/** Half-width of the range: the static baselines can't see UP's per-school standardisation. */
export const RANGE_MARGIN = 0.2

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi)
const round3 = (n: number) => Math.round(n * 1000) / 1000
const z = (value: number, [mean, sd]: readonly [number, number]) => (clamp(value, 0, 100) - mean) / sd

export function estimateAdmissionScore(input: EstimateInput, cutoffs: CutoffRow[]): EstimateResult {
  const zMA = z(input.math, BASELINE.math)
  const zRC = z(input.reading, BASELINE.reading)
  const zLP = z(input.language, BASELINE.language)
  const zSC = z(input.science, BASELINE.science)
  const zHS = z(input.hsGWA, BASELINE.hsGWA)

  const upg = clamp(
    2.8101 - 0.047147 * zMA - 0.046402 * zRC - 0.1381 * zLP - 0.15531 * zHS - 0.025178 * (zSC * zLP * zHS),
    1, 5,
  )

  const eligiblePalugit = !!input.isIndigenous || PALUGIT_SCHOOLS.has(input.schoolType ?? '')
  const palugit = eligiblePalugit ? PALUGIT : 0
  const pabigat = input.targetCampusFar ? PABIGAT : 0
  const point = clamp(upg - palugit + pabigat, 1, 5)
  const low = clamp(point - RANGE_MARGIN, 1, 5)  // optimistic end (lower is better)
  const high = clamp(point + RANGE_MARGIN, 1, 5) // conservative end

  const campuses = cutoffs
    .map((c): CampusResult => ({
      ...c,
      status: point <= c.cutoff ? 'Likely' : low <= c.cutoff ? 'Possible' : 'Unlikely',
      gap: round3(point - c.cutoff),
    }))
    .sort((a, b) => a.cutoff - b.cutoff)

  return {
    point: round3(point),
    low: round3(low),
    high: round3(high),
    eeas: { palugit, pabigat, eligiblePalugit },
    campuses,
  }
}

/**
 * A11y (review finding): the per-campus status was only announced via the
 * Likely/Possible/Unlikely group header, so a screen-reader user landing
 * directly on a row heard nothing about its outcome. This combines every
 * fact the row's own text renders (campus/program, status, cutoff, year,
 * "estimate") into one accessibilityLabel for the row itself.
 */
export function campusAccessibilityLabel(row: CampusResult): string {
  const name = row.program ? `${row.campus} – ${row.program}` : row.campus
  const yearPart = row.year != null ? ` (${row.year})` : ''
  const estimatePart = row.isEstimate ? ', estimate' : ''
  return `${name}, ${row.status}, cutoff ${row.cutoff.toFixed(2)}${yearPart}${estimatePart}`
}
