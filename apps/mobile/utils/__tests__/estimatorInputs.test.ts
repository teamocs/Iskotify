import { computeHsGwa, isTargetCampusFar, validateGwa, gwaFailingWarning } from '../estimatorInputs'

describe('computeHsGwa', () => {
  it('averages provided grades, skipping null/undefined', () => {
    expect(computeHsGwa({ g8: 90, g9: 92, g10: 88, g11: 94 })).toBe(91)
    expect(computeHsGwa({ g9: 90, g10: 90, g11: 90 })).toBe(90) // g8 missing
    expect(computeHsGwa({})).toBeNull()
  })
  it('keeps 2 decimal places for fractional averages', () => {
    expect(computeHsGwa({ g9: 90, g10: 91 })).toBe(90.5)
  })
})
describe('validateGwa', () => {
  it('returns the number in 0-100 else null', () => {
    expect(validateGwa(88)).toBe(88); expect(validateGwa(150)).toBeNull()
    expect(validateGwa(-1)).toBeNull(); expect(validateGwa(NaN)).toBeNull()
  })
})
describe('gwaFailingWarning', () => {
  it('warns for a grade between 0 and 60 (exclusive of 0) — a DepEd failing mark', () => {
    expect(gwaFailingWarning(45)).toMatch(/Below 60 is a failing grade in DepEd/i)
    expect(gwaFailingWarning(59.9)).toMatch(/Below 60 is a failing grade in DepEd/i)
  })
  it('does not warn at or above 60', () => {
    expect(gwaFailingWarning(60)).toBeNull()
    expect(gwaFailingWarning(75)).toBeNull()
    expect(gwaFailingWarning(100)).toBeNull()
  })
  it('does not warn at exactly 0 (treated as unset, not a typo signal)', () => {
    expect(gwaFailingWarning(0)).toBeNull()
  })
  it('does not warn for negative or non-finite values (validateGwa already rejects those)', () => {
    expect(gwaFailingWarning(-5)).toBeNull()
    expect(gwaFailingWarning(NaN)).toBeNull()
  })
})
describe('isTargetCampusFar', () => {
  it('false when same island group (region strings)', () => {
    expect(isTargetCampusFar('UP Diliman', 'NCR')).toBe(false)           // both Luzon
    expect(isTargetCampusFar('UP Visayas', 'Region VII (Central Visayas)')).toBe(false)
  })
  it('true when different island group (region strings)', () => {
    expect(isTargetCampusFar('UP Mindanao', 'NCR')).toBe(true)           // Mindanao vs Luzon
    expect(isTargetCampusFar('UP Diliman', 'Region XI (Davao)')).toBe(true)
  })
  it('false when unknown/missing (no penalty by default)', () => {
    expect(isTargetCampusFar('UP Diliman', undefined)).toBe(false)
    expect(isTargetCampusFar(undefined, 'NCR')).toBe(false)
    expect(isTargetCampusFar('UP Diliman', 'Atlantis')).toBe(false)
  })
  it('resolves province names to correct island group', () => {
    // Luzon province vs Mindanao campus → far
    expect(isTargetCampusFar('UP Mindanao', 'Batangas')).toBe(true)
    // Visayas province vs Visayas campus → not far
    expect(isTargetCampusFar('UP Visayas', 'Cebu')).toBe(false)
    // Mindanao province vs Luzon campus → far
    expect(isTargetCampusFar('UP Diliman', 'Davao del Sur')).toBe(true)
    // Mindanao province vs Mindanao campus → not far
    expect(isTargetCampusFar('UP Mindanao', 'Davao del Norte')).toBe(false)
    // Visayas province vs Luzon campus → far
    expect(isTargetCampusFar('UP Manila', 'Iloilo')).toBe(true)
    // Luzon province vs Luzon campus → not far
    expect(isTargetCampusFar('UP Los Baños', 'Laguna')).toBe(false)
  })
})
