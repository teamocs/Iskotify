import { searchListings, parseIntent, reorderByIds, type SearchableListing } from '../listingSearch'

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
