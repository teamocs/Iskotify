// Units-weighted University of the Philippines General Weighted Average (GWA).
// UP scale: 1.00 (highest) … 3.00 (lowest passing) … 5.00 (fail) — lower is better.
// GWA = Σ(grade × units) / Σ(units). Mirrors the logic of up-gwa.vercel.app.

export interface GwaSubject {
  grade: number
  units: number
}

/** A grade is valid on the UP scale when it is finite and within [1.00, 5.00]. */
export function isValidGrade(grade: number): boolean {
  return Number.isFinite(grade) && grade >= 1.0 && grade <= 5.0
}

/** A units value is valid when it is finite and strictly positive. */
export function isValidUnits(units: number): boolean {
  return Number.isFinite(units) && units > 0
}

/**
 * Units-weighted GWA over the valid rows. Returns null when no row has both a
 * valid grade (1.00–5.00) and positive units. Rounded to 4 decimal places.
 */
export function computeGwa(subjects: GwaSubject[]): number | null {
  const valid = subjects.filter(s => isValidGrade(s.grade) && isValidUnits(s.units))
  if (valid.length === 0) return null
  const totalUnits = valid.reduce((sum, s) => sum + s.units, 0)
  const weighted = valid.reduce((sum, s) => sum + s.grade * s.units, 0)
  return Math.round((weighted / totalUnits) * 10000) / 10000
}

/** Total units across valid rows (for display). */
export function totalUnits(subjects: GwaSubject[]): number {
  return subjects.filter(s => isValidUnits(s.units) && isValidGrade(s.grade)).reduce((sum, s) => sum + s.units, 0)
}

/**
 * UP Latin honors require the cumulative GWA to fall in a band AND no failing
 * grade. On the UP scale, a grade numerically greater than 3.00 is below the
 * passing line and disqualifies honors.
 */
export function hasDisqualifyingGrade(subjects: GwaSubject[]): boolean {
  return subjects.some(s => isValidGrade(s.grade) && s.grade > 3.0)
}

/** Latin honor for a GWA. Summa ≤1.20, Magna ≤1.45, Cum Laude ≤1.75. */
export function latinHonor(gwa: number | null, disqualified = false): string | null {
  if (gwa == null || disqualified) return null
  if (gwa <= 1.2) return 'Summa Cum Laude'
  if (gwa <= 1.45) return 'Magna Cum Laude'
  if (gwa <= 1.75) return 'Cum Laude'
  return null
}
