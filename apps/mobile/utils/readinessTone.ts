// Pure helper for the Home screen's "My Focus" readiness progress bars.
// No React, no DB — fully unit-testable.

export type ReadinessTone = 'strong' | 'fair' | 'weak' | 'none'

/**
 * readinessTone — map a readiness percentage (0–100) to a semantic tone band.
 * Thresholds: ≥75 → strong, ≥50 → fair, otherwise → weak. A null/undefined pct
 * (the listing has not been practiced yet) → 'none' so the UI can render an
 * em-dash with no fill instead of a misleading 0% "weak" bar.
 */
export function readinessTone(pct: number | null | undefined): ReadinessTone {
  if (pct == null) return 'none'
  if (pct >= 75) return 'strong'
  if (pct >= 50) return 'fair'
  return 'weak'
}
