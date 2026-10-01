import { describe, it, expect } from 'vitest'
import { isUuid, classifyRevenueCatEvent, minimalRevenueCatPayload } from '../entitlementRules'

// The grant/revoke rules themselves live in SQL (migration 067's
// grant_entitlement / revoke_play_entitlement, guarded by migration067.test.ts).

const UID = '11111111-1111-4111-8111-111111111111'
const UID2 = '22222222-2222-4222-8222-222222222222'

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

describe('classifyRevenueCatEvent', () => {
  const ev = (over: Record<string, unknown>) => ({
    id: 'rc_evt_1', type: 'NON_RENEWING_PURCHASE', app_user_id: UID,
    entitlement_ids: ['premium'], store: 'PLAY_STORE', environment: 'PRODUCTION', ...over,
  })
  const classify = (e: unknown, allowSandbox = false) => classifyRevenueCatEvent(e, { allowSandbox })

  it('INITIAL_PURCHASE and NON_RENEWING_PURCHASE with premium grant', () => {
    expect(classify(ev({ type: 'INITIAL_PURCHASE' }))).toEqual({ kind: 'grant', userId: UID })
    expect(classify(ev({}))).toEqual({ kind: 'grant', userId: UID })
  })

  it('lower-cases the user id', () => {
    expect(classify(ev({ app_user_id: UID.toUpperCase() }))).toEqual({ kind: 'grant', userId: UID })
  })

  it('a purchase without the premium entitlement is ignored', () => {
    expect(classify(ev({ entitlement_ids: ['other'] }))).toMatchObject({ kind: 'ignore' })
    expect(classify(ev({ entitlement_ids: null }))).toMatchObject({ kind: 'ignore' })
  })

  it('our own promotional grant echoing back is ignored (store PROMOTIONAL)', () => {
    expect(classify(ev({ store: 'PROMOTIONAL' }))).toMatchObject({ kind: 'ignore' })
    expect(classify(ev({ type: 'EXPIRATION', store: 'PROMOTIONAL' }))).toMatchObject({ kind: 'ignore' })
  })

  it('a refund (CANCELLATION with CUSTOMER_SUPPORT) revokes', () => {
    expect(classify(ev({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' })))
      .toEqual({ kind: 'revoke', userId: UID })
  })

  it('other cancellations (e.g. UNSUBSCRIBE, BILLING_ERROR) do not revoke', () => {
    for (const reason of ['UNSUBSCRIBE', 'BILLING_ERROR', 'UNKNOWN', undefined]) {
      expect(classify(ev({ type: 'CANCELLATION', cancel_reason: reason })), String(reason))
        .toMatchObject({ kind: 'ignore' })
    }
  })

  it('EXPIRATION revokes', () => {
    expect(classify(ev({ type: 'EXPIRATION' }))).toEqual({ kind: 'revoke', userId: UID })
  })

  it('anonymous RevenueCat ids are ignored', () => {
    expect(classify(ev({ app_user_id: '$RCAnonymousID:abc123' })))
      .toMatchObject({ kind: 'ignore', reason: expect.stringMatching(/anonymous/i) })
  })

  it('a non-uuid id is ignored', () => {
    expect(classify(ev({ app_user_id: 'someone@example.com' }))).toMatchObject({ kind: 'ignore' })
  })

  it('TEST, RENEWAL and unknown types are log-only', () => {
    for (const type of ['TEST', 'RENEWAL', 'BILLING_ISSUE', 'SOMETHING_NEW']) {
      expect(classify(ev({ type })), type).toMatchObject({ kind: 'ignore' })
    }
  })

  it('a malformed event is ignored, never thrown on', () => {
    expect(classify(null)).toMatchObject({ kind: 'ignore' })
    expect(classify('x')).toMatchObject({ kind: 'ignore' })
    expect(classify({})).toMatchObject({ kind: 'ignore' })
  })

  describe('sandbox', () => {
    it('ignores non-PRODUCTION events by default', () => {
      for (const environment of ['SANDBOX', undefined, 'production']) {
        expect(classify(ev({ environment })), String(environment)).toMatchObject({ kind: 'ignore', reason: expect.stringMatching(/sandbox|environment/i) })
      }
    })
    it('honours SANDBOX events when allowed (internal testing)', () => {
      expect(classify(ev({ environment: 'SANDBOX' }), true)).toEqual({ kind: 'grant', userId: UID })
    })
  })

  describe('TRANSFER', () => {
    const transfer = (over: Record<string, unknown> = {}) =>
      ev({ type: 'TRANSFER', app_user_id: undefined, entitlement_ids: undefined, transferred_from: [UID], transferred_to: [UID2], ...over })

    it('moves premium: revoke the uuid senders, grant the uuid receivers', () => {
      expect(classify(transfer())).toEqual({ kind: 'transfer', revokeFrom: [UID], grantTo: [UID2] })
    })

    it('drops anonymous and non-uuid ids on either side, and lower-cases', () => {
      expect(classify(transfer({
        transferred_from: ['$RCAnonymousID:a', UID.toUpperCase(), 'x'],
        transferred_to: ['$RCAnonymousID:b', UID2],
      }))).toEqual({ kind: 'transfer', revokeFrom: [UID], grantTo: [UID2] })
    })

    it('a transfer with no usable ids is ignored', () => {
      expect(classify(transfer({ transferred_from: ['$RCAnonymousID:a'], transferred_to: ['$RCAnonymousID:b'] })))
        .toMatchObject({ kind: 'ignore' })
      expect(classify(transfer({ transferred_from: 'x', transferred_to: null }))).toMatchObject({ kind: 'ignore' })
    })

    it('a transfer that names entitlements without premium is ignored', () => {
      expect(classify(transfer({ entitlement_ids: ['other'] }))).toMatchObject({ kind: 'ignore' })
      expect(classify(transfer({ entitlement_ids: ['premium'] }))).toMatchObject({ kind: 'transfer' })
    })

    it('a sandbox transfer is ignored unless sandbox is allowed', () => {
      expect(classify(transfer({ environment: 'SANDBOX' }))).toMatchObject({ kind: 'ignore' })
      expect(classify(transfer({ environment: 'SANDBOX' }), true)).toMatchObject({ kind: 'transfer' })
    })
  })
})

describe('minimalRevenueCatPayload', () => {
  const full = {
    id: 'rc_evt_1', type: 'NON_RENEWING_PURCHASE', environment: 'PRODUCTION', store: 'PLAY_STORE',
    product_id: 'iskotify_full_access', transaction_id: 'GPA.1234', original_transaction_id: 'GPA.1234',
    price_in_purchased_currency: 500, currency: 'PHP', cancel_reason: 'CUSTOMER_SUPPORT',
    app_user_id: UID, original_app_user_id: UID, aliases: [UID, '$RCAnonymousID:a'],
    transferred_from: [UID], transferred_to: [UID2],
    subscriber_attributes: { $email: { value: 'juan@example.com' }, $displayName: { value: 'Juan' }, $phoneNumber: { value: '0917' } },
    country_code: 'PH',
  }
  const out = minimalRevenueCatPayload(full)

  it('keeps only purchase facts', () => {
    expect(out).toEqual({
      event_id: 'rc_evt_1', type: 'NON_RENEWING_PURCHASE', environment: 'PRODUCTION', store: 'PLAY_STORE',
      product_id: 'iskotify_full_access', transaction_id: 'GPA.1234', original_transaction_id: 'GPA.1234',
      amount: 500, currency: 'PHP', cancel_reason: 'CUSTOMER_SUPPORT', expiration_reason: null,
    })
  })

  it('never carries a user id, alias, transfer id or subscriber attribute', () => {
    const text = JSON.stringify(out)
    for (const leak of [UID, UID2, 'RCAnonymousID', 'juan', 'Juan', '0917', 'aliases', 'subscriber_attributes', 'app_user_id', 'transferred']) {
      expect(text, leak).not.toContain(leak)
    }
  })

  it('drops non-scalar values even under an allowed key', () => {
    expect(minimalRevenueCatPayload({ id: 'x', product_id: { email: 'a@b.c' } }).product_id).toBeNull()
  })
})
