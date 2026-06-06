import { computeHsGwa, isTargetCampusFar, validateGwa } from '../estimatorInputs'

describe('computeHsGwa', () => {
  it('averages provided grades, skipping null/undefined', () => {
    expect(computeHsGwa({ g8: 90, g9: 92, g10: 88, g11: 94 })).toBe(91)
    expect(computeHsGwa({ g9: 90, g10: 90, g11: 90 })).toBe(90) // g8 missing
    expect(computeHsGwa({})).toBeNull()
  })
})
describe('validateGwa', () => {
  it('returns the number in 0-100 else null', () => {
    expect(validateGwa(88)).toBe(88); expect(validateGwa(150)).toBeNull()
    expect(validateGwa(-1)).toBeNull(); expect(validateGwa(NaN)).toBeNull()
  })
})
describe('isTargetCampusFar', () => {
  it('false when same island group', () => {
    expect(isTargetCampusFar('UP Diliman', 'NCR')).toBe(false)           // both Luzon
    expect(isTargetCampusFar('UP Visayas', 'Region VII (Central Visayas)')).toBe(false)
  })
  it('true when different island group', () => {
    expect(isTargetCampusFar('UP Mindanao', 'NCR')).toBe(true)           // Mindanao vs Luzon
    expect(isTargetCampusFar('UP Diliman', 'Region XI (Davao)')).toBe(true)
  })
  it('false when unknown/missing (no penalty by default)', () => {
    expect(isTargetCampusFar('UP Diliman', undefined)).toBe(false)
    expect(isTargetCampusFar(undefined, 'NCR')).toBe(false)
    expect(isTargetCampusFar('UP Diliman', 'Atlantis')).toBe(false)
  })
})
