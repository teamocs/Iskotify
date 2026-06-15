import { readinessTone } from '../readinessTone'

describe('readinessTone', () => {
  it('returns "none" for null (not practiced yet)', () => {
    expect(readinessTone(null)).toBe('none')
  })

  it('returns "strong" for high readiness', () => {
    expect(readinessTone(80)).toBe('strong')
  })

  it('returns "fair" for mid readiness', () => {
    expect(readinessTone(60)).toBe('fair')
  })

  it('returns "weak" for low readiness', () => {
    expect(readinessTone(30)).toBe('weak')
  })

  it('treats 75 as the lower bound of "strong"', () => {
    expect(readinessTone(75)).toBe('strong')
  })

  it('treats 50 as the lower bound of "fair"', () => {
    expect(readinessTone(50)).toBe('fair')
  })

  it('treats 49 as "weak" (just below the fair threshold)', () => {
    expect(readinessTone(49)).toBe('weak')
  })

  it('returns "none" for undefined', () => {
    expect(readinessTone(undefined)).toBe('none')
  })

  it('handles 0 as "weak" (not "none")', () => {
    expect(readinessTone(0)).toBe('weak')
  })

  it('returns "strong" for a perfect 100', () => {
    expect(readinessTone(100)).toBe('strong')
  })
})
