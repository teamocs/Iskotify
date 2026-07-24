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

describe('selectRecommendedScholarships — focused-listing pinning', () => {
  it('pins a focused scholarship first even when it ranks outside the top 6', () => {
    // 7 equally-ranked candidates → without pinning, rankForDisplay's stable
    // index-tiebreak keeps input order and the 7th (last) one is sliced off.
    const rows = Array.from({ length: 7 }, (_, i) => makeScholarship({ id: `s${i}`, slug: `s${i}` }))
    const focusedListings = [{ slug: 's6', type: 'scholarship', priority: 1 }]

    const unpinned = selectRecommendedScholarships(rows)
    expect(unpinned.map(r => r.listing.id)).not.toContain('s6')

    const pinned = selectRecommendedScholarships(rows, { focusedListings })
    expect(pinned).toHaveLength(6)
    expect(pinned[0]!.listing.id).toBe('s6')
  })

  it('orders multiple focused scholarships by focus priority', () => {
    const rows = Array.from({ length: 8 }, (_, i) => makeScholarship({ id: `s${i}`, slug: `s${i}` }))
    // priority 2 listed before priority 1 in the input — output must respect priority order.
    const focusedListings = [
      { slug: 's7', type: 'scholarship', priority: 2 },
      { slug: 's6', type: 'scholarship', priority: 1 },
    ]
    const result = selectRecommendedScholarships(rows, { focusedListings })
    expect(result[0]!.listing.id).toBe('s6')
    expect(result[1]!.listing.id).toBe('s7')
  })

  it('does not duplicate a focused scholarship that also ranks in the top 6', () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeScholarship({ id: `s${i}`, slug: `s${i}` }))
    const focusedListings = [{ slug: 's0', type: 'scholarship', priority: 1 }]
    const result = selectRecommendedScholarships(rows, { focusedListings })
    const ids = result.map(r => r.listing.id)
    expect(ids.filter(id => id === 's0')).toHaveLength(1)
    expect(ids).toEqual(['s0', 's1', 's2', 's3', 's4'])
  })

  it('does not force-include a focused scholarship that is not in the candidate set (e.g. closed)', () => {
    const rows = [
      makeScholarship({ id: 'open-1', slug: 'open-1' }),
      makeScholarship({ id: 'closed-1', slug: 'closed-1', status: 'closed' }),
    ]
    const focusedListings = [{ slug: 'closed-1', type: 'scholarship', priority: 1 }]
    const result = selectRecommendedScholarships(rows, { focusedListings })
    expect(result.map(r => r.listing.id)).toEqual(['open-1'])
  })

  it('ignores focused listings that are not scholarships', () => {
    const rows = [makeScholarship({ id: 'open-1', slug: 'open-1' })]
    const focusedListings = [{ slug: 'upcat', type: 'exam', priority: 1 }]
    const result = selectRecommendedScholarships(rows, { focusedListings })
    expect(result.map(r => r.listing.id)).toEqual(['open-1'])
  })
})
