import { selectRecommendedScholarships, isOpenOrUpcoming, type ScholarshipListingLike } from '../scholarshipRecommendations'

function makeScholarship(overrides: Partial<ScholarshipListingLike> = {}): ScholarshipListingLike {
  return {
    id: overrides.id ?? 'id-1',
    slug: overrides.slug ?? 'sch-1',
    title: overrides.title ?? 'Sample Scholarship',
    type: 'scholarship',
    status: overrides.status ?? 'active',
    isVerified: true,
    incomeCeiling: null,
    gwaRequirement: null,
    serviceObligationYears: null,
    province: null,
    city: null,
    scope: 'national',
    targetCourses: ['all'],
    scholarshipMeta: '{}',
    deadline: null,
    ...overrides,
  }
}

describe('isOpenOrUpcoming', () => {
  it('accepts active and upcoming', () => {
    expect(isOpenOrUpcoming('active')).toBe(true)
    expect(isOpenOrUpcoming('upcoming')).toBe(true)
  })
  it('rejects closed / unknown statuses', () => {
    expect(isOpenOrUpcoming('closed')).toBe(false)
    expect(isOpenOrUpcoming(null)).toBe(false)
    expect(isOpenOrUpcoming(undefined)).toBe(false)
  })
})

describe('selectRecommendedScholarships', () => {
  it('excludes closed scholarships and non-scholarship listings', () => {
    const rows = [
      makeScholarship({ id: 'a', status: 'active' }),
      makeScholarship({ id: 'b', status: 'closed' }),
      { ...makeScholarship({ id: 'c' }), type: 'exam' },
    ]
    const result = selectRecommendedScholarships(rows)
    expect(result.map(r => r.listing.id)).toEqual(['a'])
  })

  it('ranks eligible scholarships above ineligible ones', () => {
    const rows = [
      makeScholarship({ id: 'low-gwa', gwaRequirement: 95 }),
      makeScholarship({ id: 'no-req' }),
    ]
    const result = selectRecommendedScholarships(rows, { profile: { gwa: 80 } })
    // no-req has no criteria → 'unknown'; low-gwa's 95 requirement vs gwa 80 → 'ineligible'
    expect(result[0]!.listing.id).toBe('no-req')
    expect(result[0]!.status).toBe('unknown')
    expect(result[1]!.status).toBe('ineligible')
  })

  it('caps to the limit (default 6)', () => {
    const rows = Array.from({ length: 10 }, (_, i) => makeScholarship({ id: `s${i}` }))
    expect(selectRecommendedScholarships(rows)).toHaveLength(6)
    expect(selectRecommendedScholarships(rows, { limit: 3 })).toHaveLength(3)
  })

  it('attaches the eligibility status for each candidate', () => {
    const rows = [makeScholarship({ id: 'gwa-eligible', gwaRequirement: 85 })]
    const result = selectRecommendedScholarships(rows, { profile: { gwa: 90 } })
    expect(result[0]!.status).toBe('eligible')
  })
})
