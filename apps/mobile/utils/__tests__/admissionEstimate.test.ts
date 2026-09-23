import { estimateAdmissionScore, type CutoffRow } from '../admissionEstimate'

// Campus-level cutoffs as seeded in production (2019 estimates) plus one
// program-level row, mirroring upcat_cutoffs.
const CUTOFFS: CutoffRow[] = [
  { campus: 'UP Diliman', program: null, cutoff: 2.174, year: 2019, isEstimate: true },
  { campus: 'UP Baguio', program: null, cutoff: 2.421, year: 2019, isEstimate: true },
  { campus: 'UP Manila', program: null, cutoff: 2.58, year: 2019, isEstimate: true },
  { campus: 'UP Cebu', program: null, cutoff: 2.7, year: 2019, isEstimate: true },
  { campus: 'UP Diliman', program: 'BS Computer Science', cutoff: 1.55, year: 2025, isEstimate: false },
]

describe('estimateAdmissionScore', () => {
  // Parity with the server RPC estimate_admission_score (migration 020), run on
  // production 2026-09-24 with this exact payload: point 2.352, low 2.152, high 2.552.
  it('matches the server computation for a public-school student', () => {
    const r = estimateAdmissionScore(
      { hsGWA: 92, math: 65, reading: 70, language: 72, science: 60, schoolType: 'public_general' },
      CUTOFFS,
    )
    expect(r.point).toBeCloseTo(2.352, 3)
    expect(r.low).toBeCloseTo(2.152, 3)
    expect(r.high).toBeCloseTo(2.552, 3)
    expect(r.eeas).toEqual({ palugit: 0.05, pabigat: 0, eligiblePalugit: true })
  })

  it('applies no palugit to a private-school student and a pabigat for a far campus', () => {
    const base = { hsGWA: 92, math: 65, reading: 70, language: 72, science: 60 }
    const priv = estimateAdmissionScore({ ...base, schoolType: 'private' }, CUTOFFS)
    const far = estimateAdmissionScore({ ...base, schoolType: 'private', targetCampusFar: true }, CUTOFFS)
    expect(priv.point).toBeCloseTo(2.402, 3)
    expect(far.point).toBeCloseTo(2.452, 3)
    expect(far.eeas).toEqual({ palugit: 0, pabigat: 0.05, eligiblePalugit: false })
  })

  it('grants palugit to Indigenous Peoples applicants regardless of school type', () => {
    const r = estimateAdmissionScore({ hsGWA: 92, math: 65, reading: 70, language: 72, science: 60, schoolType: 'private', isIndigenous: true }, CUTOFFS)
    expect(r.eeas.eligiblePalugit).toBe(true)
  })

  // Lower is better on the UP scale: "likely" when the point estimate meets the
  // cutoff, "possible" when the optimistic end of the range (point − 0.20) does.
  it('rates campuses likely / possible / unlikely against the range, most competitive first', () => {
    const r = estimateAdmissionScore(
      { hsGWA: 92, math: 65, reading: 70, language: 72, science: 60, schoolType: 'public_general' },
      CUTOFFS,
    )
    const status = Object.fromEntries(r.campuses.map(c => [`${c.campus}${c.program ? ' – ' + c.program : ''}`, c.status]))
    expect(status).toEqual({
      'UP Diliman – BS Computer Science': 'Unlikely', // 2.352 vs 1.55, low 2.152 still above
      'UP Diliman': 'Possible', // point 2.352 > 2.174, low 2.152 ≤ 2.174
      'UP Baguio': 'Likely',
      'UP Manila': 'Likely',
      'UP Cebu': 'Likely',
    })
    expect(r.campuses.map(c => c.cutoff)).toEqual([1.55, 2.174, 2.421, 2.58, 2.7])
    expect(r.campuses.find(c => c.campus === 'UP Diliman' && !c.program)!.gap).toBeCloseTo(0.178, 3)
  })

  it('clamps inputs to 0–100 and the estimate to the 1.00–5.00 scale', () => {
    const best = estimateAdmissionScore({ hsGWA: 140, math: 150, reading: 150, language: 150, science: 150 }, [])
    const worst = estimateAdmissionScore({ hsGWA: -5, math: -10, reading: 0, language: 0, science: 0 }, [])
    expect(best.point).toBeGreaterThanOrEqual(1)
    expect(best.low).toBeGreaterThanOrEqual(1)
    expect(worst.point).toBeLessThanOrEqual(5)
    expect(worst.high).toBeLessThanOrEqual(5)
  })

  it('improves (goes down) as practice scores rise', () => {
    const lo = estimateAdmissionScore({ hsGWA: 90, math: 50, reading: 55, language: 60, science: 50 }, [])
    const hi = estimateAdmissionScore({ hsGWA: 90, math: 70, reading: 75, language: 80, science: 70 }, [])
    expect(hi.point).toBeLessThan(lo.point)
  })
})
