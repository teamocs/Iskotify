import {
  FREE_DAILY_PRACTICE_QUESTIONS,
  FREE_FULL_MOCKS_PER_EXAM,
  canStartPractice,
  practiceAllowance,
  canStartFullMock,
  manilaDayBounds,
  isPaywallEnabled,
  resolvePremium,
  trimToAllowance,
} from '../premiumLimits'

describe('premium limits', () => {
  it('keeps the agreed free numbers in one place', () => {
    expect(FREE_DAILY_PRACTICE_QUESTIONS).toBe(30)
    expect(FREE_FULL_MOCKS_PER_EXAM).toBe(1)
  })

  it('lets a free student practise until 30 answers today, then stops', () => {
    expect(canStartPractice(0)).toBe(true)
    expect(canStartPractice(29)).toBe(true)
    expect(canStartPractice(30)).toBe(false)
    expect(canStartPractice(45)).toBe(false)
  })

  it('never limits Full Access', () => {
    expect(canStartPractice(500, true)).toBe(true)
    expect(canStartFullMock(9, true)).toBe(true)
    expect(practiceAllowance(500, true)).toBe(Infinity)
  })

  it('tells a run how many questions are still free today', () => {
    expect(practiceAllowance(0)).toBe(30)
    expect(practiceAllowance(22)).toBe(8)
    expect(practiceAllowance(31)).toBe(0)
    // A negative or broken count never grants more than the daily allowance.
    expect(practiceAllowance(-5)).toBe(30)
    expect(practiceAllowance(Number.NaN)).toBe(30)
  })

  it('allows one free full mock per exam', () => {
    expect(canStartFullMock(0)).toBe(true)
    expect(canStartFullMock(1)).toBe(false)
  })

  it('counts the day in Manila time, whatever the device zone', () => {
    // 2026-10-01 23:30 UTC = 2026-10-02 07:30 in Manila.
    const now = Date.UTC(2026, 9, 1, 23, 30)
    const { start, end } = manilaDayBounds(now)
    expect(start).toBe(Date.UTC(2026, 9, 1, 16, 0)) // Manila midnight, Oct 2
    expect(end - start).toBe(86_400_000)
    expect(now >= start && now < end).toBe(true)
  })

  describe('isPaywallEnabled', () => {
    const prev = process.env.EXPO_PUBLIC_PAYWALL_ENABLED
    afterEach(() => {
      if (prev === undefined) delete process.env.EXPO_PUBLIC_PAYWALL_ENABLED
      else process.env.EXPO_PUBLIC_PAYWALL_ENABLED = prev
    })

    it('is off unless the flag is exactly "1"', () => {
      delete process.env.EXPO_PUBLIC_PAYWALL_ENABLED
      expect(isPaywallEnabled()).toBe(false)
      process.env.EXPO_PUBLIC_PAYWALL_ENABLED = 'true'
      expect(isPaywallEnabled()).toBe(false)
      process.env.EXPO_PUBLIC_PAYWALL_ENABLED = '1'
      expect(isPaywallEnabled()).toBe(true)
    })
  })

  describe('resolvePremium', () => {
    it('is false when signed out (a purchase needs an account)', () => {
      expect(resolvePremium({ signedIn: false, row: true, cached: true })).toBe(false)
    })

    it('follows the server entitlement row when it could be read', () => {
      expect(resolvePremium({ signedIn: true, row: true, cached: false })).toBe(true)
      expect(resolvePremium({ signedIn: true, row: false, cached: true })).toBe(false)
    })

    it('keeps the last known state when the row could not be read (offline)', () => {
      expect(resolvePremium({ signedIn: true, row: null, cached: true })).toBe(true)
      expect(resolvePremium({ signedIn: true, row: null, cached: false })).toBe(false)
    })
  })
})

describe('trimToAllowance (never splits a passage set)', () => {
  const solo = (id: string) => ({ id, setId: null as string | null })
  const inSet = (id: string, setId: string) => ({ id, setId })
  const ids = (qs: { id: string }[]) => qs.map(q => q.id)

  it('keeps everything when it fits, and nothing when the allowance is 0', () => {
    const qs = [solo('a'), inSet('b1', 'B'), inSet('b2', 'B')]
    expect(ids(trimToAllowance(qs, 3))).toEqual(['a', 'b1', 'b2'])
    expect(ids(trimToAllowance(qs, Infinity))).toEqual(['a', 'b1', 'b2'])
    expect(trimToAllowance(qs, 0)).toEqual([])
  })

  it('stops before a passage set that would not fit whole', () => {
    const qs = [solo('a'), inSet('b1', 'B'), inSet('b2', 'B'), inSet('b3', 'B'), solo('c')]
    expect(ids(trimToAllowance(qs, 3))).toEqual(['a'])
    expect(ids(trimToAllowance(qs, 4))).toEqual(['a', 'b1', 'b2', 'b3'])
  })

  it('serves a first set whole even when it alone is over the allowance (over by less than one set)', () => {
    const qs = [inSet('b1', 'B'), inSet('b2', 'B'), inSet('b3', 'B'), solo('c')]
    expect(ids(trimToAllowance(qs, 1))).toEqual(['b1', 'b2', 'b3'])
  })

  it('trims standalone questions one by one, as before', () => {
    expect(ids(trimToAllowance([solo('a'), solo('b'), solo('c')], 2))).toEqual(['a', 'b'])
  })
})
