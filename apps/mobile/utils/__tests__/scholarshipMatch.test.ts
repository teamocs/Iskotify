import { matchScholarship, INCOME_BANDS, type StudentProfile, type MatchInput } from '../scholarshipMatch'

function L(p: Partial<MatchInput>): MatchInput {
  return {
    scope: 'national', isVerified: true, incomeCeiling: null, gwaRequirement: null,
    serviceObligationYears: null, province: null, city: null, targetYearLevels: [],
    hucExcluded: false, ...p,
  }
}
const S = (p: Partial<StudentProfile> = {}): StudentProfile => ({ ...p })

describe('matchScholarship — income', () => {
  it('ineligible when band lower bound exceeds ceiling', () => {
    const r = matchScholarship(L({ incomeCeiling: 100000 }), S({ incomeBracket: '300k-600k' }))
    expect(r.status).toBe('ineligible')
    expect(r.reasons.join(' ')).toMatch(/income/i)
  })
  it('eligible when band fully under ceiling', () => {
    const r = matchScholarship(L({ incomeCeiling: 600000 }), S({ incomeBracket: '<=100k' }))
    expect(r.status).toBe('eligible')
  })
  it('maybe when band straddles ceiling', () => {
    const r = matchScholarship(L({ incomeCeiling: 200000 }), S({ incomeBracket: '100k-300k' }))
    expect(r.status).toBe('maybe')
  })
  it('maybe + warning when means-tested but income unknown', () => {
    const r = matchScholarship(L({ incomeCeiling: 100000 }), S({}))
    expect(r.status).toBe('maybe')
    expect(r.warnings.join(' ')).toMatch(/income/i)
  })
})

describe('matchScholarship — GWA', () => {
  it('ineligible below requirement', () => {
    expect(matchScholarship(L({ gwaRequirement: 90 }), S({ gwa: 85 })).status).toBe('ineligible')
  })
  it('maybe within 2 points', () => {
    expect(matchScholarship(L({ gwaRequirement: 90 }), S({ gwa: 88.5 })).status).toBe('maybe')
  })
  it('eligible at/above requirement', () => {
    expect(matchScholarship(L({ gwaRequirement: 90 }), S({ gwa: 92 })).status).toBe('eligible')
  })
  it('maybe + prompt when GWA required but missing', () => {
    const r = matchScholarship(L({ gwaRequirement: 90 }), S({}))
    expect(r.status).toBe('maybe'); expect(r.warnings.join(' ')).toMatch(/GWA/i)
  })
})

describe('matchScholarship — LGU residency', () => {
  it('ineligible when province differs', () => {
    const r = matchScholarship(L({ scope: 'provincial', province: 'Ilocos Norte' }), S({ province: 'Cebu' }))
    expect(r.status).toBe('ineligible'); expect(r.reasons.join(' ')).toMatch(/Ilocos Norte/)
  })
  it('eligible when province matches', () => {
    expect(matchScholarship(L({ scope: 'provincial', province: 'Cebu' }), S({ province: 'Cebu' })).status).toBe('eligible')
  })
  it('HUC warning for excluded city resident', () => {
    const r = matchScholarship(L({ scope: 'provincial', province: 'Cebu', hucExcluded: true }), S({ province: 'Cebu', city: 'Cebu City' }))
    expect(r.warnings.join(' ')).toMatch(/Cebu City|HUC|highly urbanized/i)
  })
})

describe('matchScholarship — city-scope residency', () => {
  it('city match → eligible', () => {
    const r = matchScholarship(L({ scope: 'city', city: 'Cebu City' }), S({ city: 'Cebu City' }))
    expect(r.status).toBe('eligible')
    expect(r.reasons.join(' ')).toMatch(/Cebu City/)
  })
  it('city mismatch → ineligible', () => {
    const r = matchScholarship(L({ scope: 'city', city: 'Cebu City' }), S({ city: 'Davao City' }))
    expect(r.status).toBe('ineligible')
    expect(r.reasons.join(' ')).toMatch(/Cebu City/)
  })
  it('city-scope + listing.city set + student.city missing → maybe', () => {
    const r = matchScholarship(L({ scope: 'city', city: 'Cebu City' }), S({}))
    expect(r.status).toBe('maybe')
    expect(r.warnings.join(' ')).toMatch(/Cebu City/)
  })
  it('city-scope with listing.city null and no other criteria → unknown', () => {
    const r = matchScholarship(L({ scope: 'city', city: null }), S({ city: 'Cebu City' }))
    expect(r.status).toBe('unknown')
  })
})

describe('matchScholarship — verified + unknown', () => {
  it('unverified always warns', () => {
    expect(matchScholarship(L({ isVerified: false }), S()).warnings.join(' ')).toMatch(/verify|unverified/i)
  })
  it('unknown when no typed criteria', () => {
    expect(matchScholarship(L({}), S()).status).toBe('unknown')
  })
  it('exposes INCOME_BANDS map', () => {
    expect(INCOME_BANDS['<=100k']).toEqual([0, 100000])
  })
})
