import {
  EARLY_ACCESS_EXPIRY_MS,
  isEarlyAccessExpired,
  EARLY_ACCESS_GATE_ENABLED,
  shouldBlockForEarlyAccess,
} from '../earlyAccess'

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

describe('EARLY_ACCESS_GATE_ENABLED', () => {
  it('is dormant (false) until the approval + APK-email pipeline is live', () => {
    // While dormant, signed-in users are never bounced to /early-access-required —
    // fixes signed-in users being kicked to the early-access page on web refresh.
    expect(EARLY_ACCESS_GATE_ENABLED).toBe(false)
  })
})

describe('shouldBlockForEarlyAccess', () => {
  it('never blocks while the gate is disabled, regardless of status', () => {
    expect(shouldBlockForEarlyAccess('pending', false)).toBe(false)
    expect(shouldBlockForEarlyAccess(null, false)).toBe(false)
    expect(shouldBlockForEarlyAccess(undefined, false)).toBe(false)
    expect(shouldBlockForEarlyAccess('approved', false)).toBe(false)
  })

  it('lets approved + sent users through when the gate is enabled', () => {
    expect(shouldBlockForEarlyAccess('approved', true)).toBe(false)
    expect(shouldBlockForEarlyAccess('sent', true)).toBe(false)
  })

  it('blocks non-approved statuses only when the gate is enabled', () => {
    expect(shouldBlockForEarlyAccess('pending', true)).toBe(true)
    expect(shouldBlockForEarlyAccess(null, true)).toBe(true)
    expect(shouldBlockForEarlyAccess(undefined, true)).toBe(true)
    expect(shouldBlockForEarlyAccess('rejected', true)).toBe(true)
  })

  it('defaults to the dormant flag (no block) when enabled arg omitted', () => {
    expect(shouldBlockForEarlyAccess('pending')).toBe(false)
  })
})
