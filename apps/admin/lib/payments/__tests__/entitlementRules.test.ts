import { describe, it, expect } from 'vitest'
import { isUuid, planGrant, planRevoke, classifyRevenueCatEvent, type EntitlementRow } from '../entitlementRules'

const UID = '11111111-1111-4111-8111-111111111111'
const NOW = '2026-10-01T00:00:00.000Z'
const EARLIER = '2026-09-01T00:00:00.000Z'

const row = (over: Partial<EntitlementRow>): EntitlementRow => ({
  premium: true, source: 'play', granted_at: EARLIER, revoked_at: null, ...over,
})

describe('isUuid', () => {
  it('accepts a uuid in any case', () => {
    expect(isUuid(UID)).toBe(true)
    expect(isUuid(UID.toUpperCase())).toBe(true)
  })
  it('rejects anything else', () => {
    for (const v of ['', 'abc', `${UID}x`, `$RCAnonymousID:abc`, null, undefined, 42, {}]) {
      expect(isUuid(v), String(v)).toBe(false)
    }
  })
})

describe('planGrant', () => {
  it('grants a user with no row', () => {
    expect(planGrant(null, 'web', NOW)).toEqual({ premium: true, source: 'web', granted_at: NOW, revoked_at: null })
  })

  it('re-grants a revoked user, clearing revoked_at', () => {
    expect(planGrant(row({ premium: false, revoked_at: EARLIER }), 'play', NOW))
      .toEqual({ premium: true, source: 'play', granted_at: NOW, revoked_at: null })
  })

  it('is idempotent: a replayed grant keeps the original granted_at', () => {
    expect(planGrant(row({ source: 'web' }), 'web', NOW))
      .toEqual({ premium: true, source: 'web', granted_at: EARLIER, revoked_at: null })
  })

  it('a Play purchase never overwrites a web, grandfather or admin grant', () => {
    for (const source of ['web', 'grandfather', 'admin'] as const) {
      expect(planGrant(row({ source }), 'play', NOW), source).toBeNull()
    }
  })

  it('a web purchase over a Play grant becomes the web source (a Play refund can no longer revoke it)', () => {
    expect(planGrant(row({ source: 'play' }), 'web', NOW))
      .toEqual({ premium: true, source: 'web', granted_at: EARLIER, revoked_at: null })
  })
})

describe('planRevoke', () => {
  it('revokes a Play grant', () => {
    expect(planRevoke(row({ source: 'play' }), NOW))
      .toEqual({ premium: false, source: 'play', granted_at: EARLIER, revoked_at: NOW })
  })

  it('never revokes a web, grandfather or admin grant', () => {
    for (const source of ['web', 'grandfather', 'admin'] as const) {
      expect(planRevoke(row({ source }), NOW), source).toBeNull()
    }
  })

  it('does nothing when there is no row or it is already revoked (idempotent)', () => {
    expect(planRevoke(null, NOW)).toBeNull()
    expect(planRevoke(row({ premium: false, revoked_at: EARLIER }), NOW)).toBeNull()
  })
})

describe('classifyRevenueCatEvent', () => {
  const ev = (over: Record<string, unknown>) => ({
    id: 'rc_evt_1', type: 'NON_RENEWING_PURCHASE', app_user_id: UID,
    entitlement_ids: ['premium'], store: 'PLAY_STORE', ...over,
  })

  it('INITIAL_PURCHASE and NON_RENEWING_PURCHASE with premium grant', () => {
    expect(classifyRevenueCatEvent(ev({ type: 'INITIAL_PURCHASE' }))).toEqual({ kind: 'grant', userId: UID })
    expect(classifyRevenueCatEvent(ev({}))).toEqual({ kind: 'grant', userId: UID })
  })

  it('lower-cases the user id', () => {
    expect(classifyRevenueCatEvent(ev({ app_user_id: UID.toUpperCase() }))).toEqual({ kind: 'grant', userId: UID })
  })

  it('a purchase without the premium entitlement is ignored', () => {
    expect(classifyRevenueCatEvent(ev({ entitlement_ids: ['other'] }))).toMatchObject({ kind: 'ignore' })
    expect(classifyRevenueCatEvent(ev({ entitlement_ids: null }))).toMatchObject({ kind: 'ignore' })
  })

  it('our own promotional grant echoing back is ignored (store PROMOTIONAL)', () => {
    expect(classifyRevenueCatEvent(ev({ store: 'PROMOTIONAL' }))).toMatchObject({ kind: 'ignore' })
    expect(classifyRevenueCatEvent(ev({ type: 'EXPIRATION', store: 'PROMOTIONAL' }))).toMatchObject({ kind: 'ignore' })
  })

  it('a refund (CANCELLATION with CUSTOMER_SUPPORT) revokes', () => {
    expect(classifyRevenueCatEvent(ev({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' })))
      .toEqual({ kind: 'revoke', userId: UID })
  })

  it('other cancellations (e.g. UNSUBSCRIBE, BILLING_ERROR) do not revoke', () => {
    for (const reason of ['UNSUBSCRIBE', 'BILLING_ERROR', 'UNKNOWN', undefined]) {
      expect(classifyRevenueCatEvent(ev({ type: 'CANCELLATION', cancel_reason: reason })), String(reason))
        .toMatchObject({ kind: 'ignore' })
    }
  })

  it('EXPIRATION revokes', () => {
    expect(classifyRevenueCatEvent(ev({ type: 'EXPIRATION' }))).toEqual({ kind: 'revoke', userId: UID })
  })

  it('anonymous RevenueCat ids are ignored', () => {
    expect(classifyRevenueCatEvent(ev({ app_user_id: '$RCAnonymousID:abc123' })))
      .toMatchObject({ kind: 'ignore', reason: expect.stringMatching(/anonymous/i) })
  })

  it('a non-uuid id is ignored', () => {
    expect(classifyRevenueCatEvent(ev({ app_user_id: 'someone@example.com' }))).toMatchObject({ kind: 'ignore' })
  })

  it('TRANSFER, TEST and unknown types are log-only', () => {
    for (const type of ['TRANSFER', 'TEST', 'RENEWAL', 'BILLING_ISSUE', 'SOMETHING_NEW']) {
      expect(classifyRevenueCatEvent(ev({ type })), type).toMatchObject({ kind: 'ignore' })
    }
  })

  it('a malformed event is ignored, never thrown on', () => {
    expect(classifyRevenueCatEvent(null)).toMatchObject({ kind: 'ignore' })
    expect(classifyRevenueCatEvent('x')).toMatchObject({ kind: 'ignore' })
    expect(classifyRevenueCatEvent({})).toMatchObject({ kind: 'ignore' })
  })
})
