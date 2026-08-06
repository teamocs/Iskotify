import { computeAttemptsToPrune, MAX_RETAINED_ATTEMPTS } from '../attemptRetention'

describe('MAX_RETAINED_ATTEMPTS', () => {
  it('is a generous floor (thousands of rows), not a small cap or short window', () => {
    // Task G needs weeks/months of trend data + "most common mistakes" —
    // guard against someone "optimizing" this down to something tiny.
    expect(MAX_RETAINED_ATTEMPTS).toBe(5000)
    expect(MAX_RETAINED_ATTEMPTS).toBeGreaterThanOrEqual(5000)
  })
})

describe('computeAttemptsToPrune', () => {
  it('returns 0 when under the cap', () => {
    expect(computeAttemptsToPrune(100, 5000)).toBe(0)
  })

  it('returns 0 when exactly at the cap', () => {
    expect(computeAttemptsToPrune(5000, 5000)).toBe(0)
  })

  it('returns the overage when over the cap', () => {
    expect(computeAttemptsToPrune(5010, 5000)).toBe(10)
  })

  it('returns 0 for an empty table', () => {
    expect(computeAttemptsToPrune(0, 5000)).toBe(0)
  })

  it('defaults the cap to MAX_RETAINED_ATTEMPTS when omitted', () => {
    expect(computeAttemptsToPrune(MAX_RETAINED_ATTEMPTS + 1)).toBe(1)
    expect(computeAttemptsToPrune(MAX_RETAINED_ATTEMPTS)).toBe(0)
  })

  it('supports a custom (smaller) cap, e.g. for tests', () => {
    expect(computeAttemptsToPrune(7, 5)).toBe(2)
    expect(computeAttemptsToPrune(5, 5)).toBe(0)
    expect(computeAttemptsToPrune(4, 5)).toBe(0)
  })
})
