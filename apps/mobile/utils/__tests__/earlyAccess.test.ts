import { EARLY_ACCESS_EXPIRY_MS, isEarlyAccessExpired } from '../earlyAccess'

describe('EARLY_ACCESS_EXPIRY_MS', () => {
  it('is 2026-08-02 00:00 UTC', () => {
    expect(EARLY_ACCESS_EXPIRY_MS).toBe(Date.UTC(2026, 7, 2))
    expect(new Date(EARLY_ACCESS_EXPIRY_MS).toISOString()).toBe('2026-08-02T00:00:00.000Z')
  })
})

describe('isEarlyAccessExpired', () => {
  it('is false before the expiry date', () => {
    expect(isEarlyAccessExpired(Date.UTC(2026, 7, 1))).toBe(false)        // day before
    expect(isEarlyAccessExpired(Date.UTC(2026, 5, 16))).toBe(false)       // mid-June 2026
    expect(isEarlyAccessExpired(EARLY_ACCESS_EXPIRY_MS - 1)).toBe(false)  // one ms before
  })

  it('is true at and after the expiry date', () => {
    expect(isEarlyAccessExpired(EARLY_ACCESS_EXPIRY_MS)).toBe(true)       // exact boundary
    expect(isEarlyAccessExpired(Date.UTC(2026, 7, 3))).toBe(true)         // day after
    expect(isEarlyAccessExpired(Date.UTC(2027, 0, 1))).toBe(true)         // next year
  })
})
