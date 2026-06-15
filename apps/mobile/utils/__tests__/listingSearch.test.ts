import { searchListings, parseIntent, reorderByIds, rankForDisplay, type SearchableListing, type RankableListing } from '../listingSearch'
import type { StudentProfile } from '../scholarshipMatch'

const L: SearchableListing[] = [
  { id: '1', slug: 'upcat', title: 'UPCAT', type: 'exam', region: 'NCR', provider: 'UP' },
  { id: '2', slug: 'bucet', title: 'BUCET', type: 'exam', region: 'Region V (Bicol)', provider: 'Bicol University' },
  { id: '3', slug: 'dost', title: 'DOST Scholarship', type: 'scholarship', region: 'National', provider: 'DOST', incomeCeiling: 300000, isVerified: true },
  { id: '4', slug: 'sm', title: 'SM Foundation Scholarship', type: 'scholarship', region: 'National', provider: 'SM', incomeCeiling: 150000, isVerified: false },
  { id: '5', slug: 'nursing-grant', title: 'Nursing Tuition Grant', type: 'scholarship', region: 'Region V (Bicol)', provider: 'CHED', incomeCeiling: null, isVerified: true },
]

describe('parseIntent', () => {
  it('detects scholarship + low-income intent', () => {
    const i = parseIntent('free scholarships for low income students')
    expect(i.wantsScholarship).toBe(true)
    expect(i.lowIncome).toBe(true)
    expect(i.wantsExam).toBe(false)
  })
  it('detects exam + near-me intent', () => {
    const i = parseIntent('entrance exams near me')
    expect(i.wantsExam).toBe(true)
    expect(i.nearMe).toBe(true)
  })
})

describe('searchListings', () => {
  it('returns everything for a blank query', () => {
    expect(searchListings(L, '').length).toBe(L.length)
  })

  it('matches by title token', () => {
    expect(searchListings(L, 'bucet')[0]!.id).toBe('2')
  })

  it('matches by provider', () => {
    expect(searchListings(L, 'DOST').map(l => l.id)).toContain('3')
  })

  it('ranks scholarships first for a scholarship-intent query and drops exams', () => {
    const res = searchListings(L, 'scholarships')
    expect(res.length).toBeGreaterThan(0)
    expect(res.every(l => l.type === 'scholarship')).toBe(true)
  })

  it('"nursing" surfaces the nursing grant', () => {
    expect(searchListings(L, 'nursing')[0]!.id).toBe('5')
  })

  it('"near me" boosts the user-region listing', () => {
    // user in Bicol → exams near me should rank the Bicol exam (id 2) first
    const res = searchListings(L, 'exams near me', 'Bicol')
    expect(res[0]!.id).toBe('2')
  })

  it('low-income scholarship intent favors low/no income ceiling', () => {
    const res = searchListings(L, 'free scholarship for poor students')
    // id 4 (150k) and id 5 (no ceiling) should outrank id 3 (300k)
    expect(res.slice(0, 2).map(l => l.id).sort()).toEqual(['4', '5'])
  })
})

describe('reorderByIds', () => {
  it('reorders to the given id order, dropping unknown ids', () => {
    const out = reorderByIds(L, ['5', '1', 'zzz', '3'])
    expect(out.map(l => l.id)).toEqual(['5', '1', '3'])
  })
})

describe('rankForDisplay', () => {
  // Fixed clock so date-proximity ordering is deterministic.
  const NOW = 1_700_000_000_000 // some epoch ms
  const DAY = 86_400_000

  // A profile that makes income/gwa criteria resolvable to eligible/ineligible.
  const richProfile: StudentProfile = { incomeBracket: '<=100k', gwa: 95, province: 'Albay', city: 'Legazpi City' }

  describe('scholarships', () => {
    it('orders by eligibility bucket: eligible before maybe before ineligible', () => {
      const rows: RankableListing[] = [
        // ineligible: GWA requirement the student misses outright (95 < 99 - 2)
        { id: 'inel', slug: 'inel', title: 'Honors-Only Grant', type: 'scholarship', incomeCeiling: null, gwaRequirement: 99 },
        // maybe: income unknown criterion (student has income, but gwa near cutoff) → use a near-cutoff gwa req
        { id: 'maybe', slug: 'maybe', title: 'Close Call Grant', type: 'scholarship', incomeCeiling: null, gwaRequirement: 96 },
        // eligible: within ceiling and meets gwa
        { id: 'elig', slug: 'elig', title: 'Open Grant', type: 'scholarship', incomeCeiling: 100000, gwaRequirement: 90 },
      ]
      const out = rankForDisplay(rows, { tab: 'scholarships', profile: richProfile, now: NOW })
      expect(out.map(r => r.id)).toEqual(['elig', 'maybe', 'inel'])
    })

    it('within the same eligibility bucket, target-course (cluster) match ranks first', () => {
      const clusters = new Set(['Nursing & Allied Health'])
      const rows: RankableListing[] = [
        { id: 'nomatch', slug: 'nomatch', title: 'General Grant', type: 'scholarship', incomeCeiling: 100000, targetCourses: ['Engineering'] },
        { id: 'match', slug: 'match', title: 'Nursing Grant', type: 'scholarship', incomeCeiling: 100000, targetCourses: ['Nursing & Allied Health'] },
      ]
      const out = rankForDisplay(rows, { tab: 'scholarships', profile: richProfile, clusters, now: NOW })
      expect(out[0]!.id).toBe('match')
    })

    it('treats targetCourses ["all"] as a course match', () => {
      const clusters = new Set(['Nursing & Allied Health'])
      const rows: RankableListing[] = [
        { id: 'specific-other', slug: 'a', title: 'Eng Grant', type: 'scholarship', incomeCeiling: 100000, targetCourses: ['Engineering'] },
        { id: 'all', slug: 'b', title: 'Universal Grant', type: 'scholarship', incomeCeiling: 100000, targetCourses: ['all'] },
      ]
      const out = rankForDisplay(rows, { tab: 'scholarships', profile: richProfile, clusters, now: NOW })
      expect(out[0]!.id).toBe('all')
    })

    it('within the same bucket+course, future deadlines come before past/none, soonest first', () => {
      const rows: RankableListing[] = [
        { id: 'past', slug: 'past', title: 'Past Grant', type: 'scholarship', incomeCeiling: 100000, deadline: NOW - 10 * DAY },
        { id: 'none', slug: 'none', title: 'No-Deadline Grant', type: 'scholarship', incomeCeiling: 100000, deadline: null },
        { id: 'far', slug: 'far', title: 'Far Grant', type: 'scholarship', incomeCeiling: 100000, deadline: NOW + 30 * DAY },
        { id: 'soon', slug: 'soon', title: 'Soon Grant', type: 'scholarship', incomeCeiling: 100000, deadline: NOW + 3 * DAY },
      ]
      const out = rankForDisplay(rows, { tab: 'scholarships', profile: richProfile, now: NOW })
      // soonest future first, then later future, then none/past after
      expect(out.map(r => r.id).slice(0, 2)).toEqual(['soon', 'far'])
      expect(out.map(r => r.id).indexOf('soon')).toBeLessThan(out.map(r => r.id).indexOf('past'))
      expect(out.map(r => r.id).indexOf('far')).toBeLessThan(out.map(r => r.id).indexOf('none'))
    })

    it('is a stable sort: equal rows keep their incoming order', () => {
      // All three are eligible, no course match, no deadline → fully tied; incoming order must hold.
      const rows: RankableListing[] = [
        { id: 'b', slug: 'b', title: 'B Grant', type: 'scholarship', incomeCeiling: 100000 },
        { id: 'a', slug: 'a', title: 'A Grant', type: 'scholarship', incomeCeiling: 100000 },
        { id: 'c', slug: 'c', title: 'C Grant', type: 'scholarship', incomeCeiling: 100000 },
      ]
      const out = rankForDisplay(rows, { tab: 'scholarships', profile: richProfile, now: NOW })
      expect(out.map(r => r.id)).toEqual(['b', 'a', 'c'])
    })
  })

  describe('universities', () => {
    it('boosts an upcoming exam over a far-future and a past/none exam (soonest future first)', () => {
      const rows: RankableListing[] = [
        { id: 'past', slug: 'past', title: 'Past Exam', type: 'exam', examDate: NOW - 5 * DAY },
        { id: 'far', slug: 'far', title: 'Far Exam', type: 'exam', examDate: NOW + 60 * DAY },
        { id: 'soon', slug: 'soon', title: 'Soon Exam', type: 'exam', examDate: NOW + 2 * DAY },
      ]
      const out = rankForDisplay(rows, { tab: 'universities', now: NOW })
      expect(out[0]!.id).toBe('soon')
      expect(out.map(r => r.id).indexOf('far')).toBeLessThan(out.map(r => r.id).indexOf('past'))
    })

    it('boosts a cluster/region match above an otherwise-equal listing', () => {
      const clusters = new Set(['Engineering'])
      const rows: RankableListing[] = [
        { id: 'plain', slug: 'plain', title: 'Plain U', type: 'exam', region: 'NCR', examDate: null, targetCourses: ['Nursing'] },
        { id: 'match', slug: 'match', title: 'Match U', type: 'exam', region: 'Region V (Bicol)', examDate: null, targetCourses: ['Engineering'] },
      ]
      const out = rankForDisplay(rows, { tab: 'universities', clusters, region: 'Bicol', now: NOW })
      expect(out[0]!.id).toBe('match')
    })

    it('is a stable sort: fully-tied universities keep their incoming order', () => {
      const rows: RankableListing[] = [
        { id: 'z', slug: 'z', title: 'Z Exam', type: 'exam', examDate: null },
        { id: 'y', slug: 'y', title: 'Y Exam', type: 'exam', examDate: null },
        { id: 'x', slug: 'x', title: 'X Exam', type: 'exam', examDate: null },
      ]
      const out = rankForDisplay(rows, { tab: 'universities', now: NOW })
      expect(out.map(r => r.id)).toEqual(['z', 'y', 'x'])
    })
  })

  it('does not mutate the input array', () => {
    const rows: RankableListing[] = [
      { id: 'a', slug: 'a', title: 'A', type: 'scholarship', incomeCeiling: 50 },
      { id: 'b', slug: 'b', title: 'B', type: 'scholarship', incomeCeiling: 100000 },
    ]
    const before = rows.map(r => r.id)
    rankForDisplay(rows, { tab: 'scholarships', profile: richProfile, now: NOW })
    expect(rows.map(r => r.id)).toEqual(before)
  })

  it('returns rows unchanged for non uni/scholarship tabs', () => {
    const rows: RankableListing[] = [
      { id: 'a', slug: 'a', title: 'A', type: 'scholarship', incomeCeiling: 50 },
      { id: 'b', slug: 'b', title: 'B', type: 'scholarship', incomeCeiling: 100000 },
    ]
    const out = rankForDisplay(rows, { tab: 'courses', now: NOW })
    expect(out.map(r => r.id)).toEqual(['a', 'b'])
  })
})
