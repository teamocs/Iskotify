import { describe, it, expect } from 'vitest'
import {
  buildCheckoutSessionBody, parsePaymongoEvent, checkPaidCheckout, minimalPaymongoPayload, expectedLivemode,
  PRICE_CENTAVOS, type PaymongoEvent,
} from '../paymongo'

const UID = '11111111-1111-4111-8111-111111111111'

describe('buildCheckoutSessionBody', () => {
  const body = buildCheckoutSessionBody({ userId: UID, webAppUrl: 'https://app.iskotify.ph', referenceNumber: 'ISK-abc' })

  it('sells one "Iskotify Full Access" for PHP 500 (50000 centavos)', () => {
    expect(PRICE_CENTAVOS).toBe(50000)
    expect(body.data.attributes.line_items).toEqual([
      { name: 'Iskotify Full Access', amount: 50000, currency: 'PHP', quantity: 1 },
    ])
  })

  it('offers GCash, Maya, cards and QR Ph', () => {
    expect(body.data.attributes.payment_method_types).toEqual(['gcash', 'paymaya', 'card', 'qrph'])
  })

  it('returns to the web app upgrade page', () => {
    expect(body.data.attributes.success_url).toBe('https://app.iskotify.ph/upgrade?status=success')
    expect(body.data.attributes.cancel_url).toBe('https://app.iskotify.ph/upgrade?status=cancelled')
  })

  it('drops a trailing slash on the web app URL', () => {
    const b = buildCheckoutSessionBody({ userId: UID, webAppUrl: 'https://x.example/', referenceNumber: 'r' })
    expect(b.data.attributes.success_url).toBe('https://x.example/upgrade?status=success')
  })

  it('carries the user id in metadata and the reference number', () => {
    expect(body.data.attributes.metadata).toEqual({ user_id: UID })
    expect(body.data.attributes.reference_number).toBe('ISK-abc')
  })
})

const paid = () => ({
  data: {
    id: 'evt_123',
    type: 'event',
    attributes: {
      type: 'checkout_session.payment.paid',
      livemode: true,
      data: {
        id: 'cs_abc',
        type: 'checkout_session',
        attributes: {
          metadata: { user_id: UID },
          reference_number: 'ISK-abc',
          billing: { name: 'Juan Dela Cruz', email: 'juan@example.com', phone: '09170000000' },
          customer_email: 'juan@example.com',
          line_items: [{ name: 'Iskotify Full Access', amount: 50000, currency: 'PHP', quantity: 1 }],
          payments: [
            { id: 'pay_1', attributes: { status: 'paid', amount: 50000, currency: 'PHP', billing: { email: 'juan@example.com' } } },
          ],
        },
      },
    },
  },
})

describe('parsePaymongoEvent', () => {
  it('reads the event id, type, livemode, user id, session, reference, payments, amount and currency', () => {
    expect(parsePaymongoEvent(paid())).toEqual({
      eventId: 'evt_123',
      type: 'checkout_session.payment.paid',
      livemode: true,
      userId: UID,
      sessionId: 'cs_abc',
      referenceNumber: 'ISK-abc',
      paymentIds: ['pay_1'],
      amountCentavos: 50000,
      currency: 'PHP',
    })
  })

  it('returns null for something that is not an event', () => {
    expect(parsePaymongoEvent(null)).toBeNull()
    expect(parsePaymongoEvent({})).toBeNull()
    expect(parsePaymongoEvent({ data: { attributes: { type: 'x' } } })).toBeNull()
  })

  it('treats livemode as true only when it is exactly true', () => {
    const e = paid()
    ;(e.data.attributes as { livemode: unknown }).livemode = 'true'
    expect(parsePaymongoEvent(e)?.livemode).toBe(false)
  })

  it('gives nulls when the session attributes are absent', () => {
    const e = paid()
    e.data.attributes.data.attributes = {} as never
    expect(parsePaymongoEvent(e)).toMatchObject({ userId: null, amountCentavos: null, currency: null, referenceNumber: null, paymentIds: [] })
  })

  it('sums only paid payments', () => {
    const e = paid()
    e.data.attributes.data.attributes.payments.push({ id: 'pay_2', attributes: { status: 'failed', amount: 50000, currency: 'PHP', billing: { email: '' } } })
    expect(parsePaymongoEvent(e)).toMatchObject({ amountCentavos: 50000, paymentIds: ['pay_1'] })
  })

  it('a mix of currencies yields no single currency', () => {
    const e = paid()
    e.data.attributes.data.attributes.payments.push({ id: 'pay_2', attributes: { status: 'paid', amount: 1, currency: 'USD', billing: { email: '' } } })
    expect(parsePaymongoEvent(e)?.currency).toBeNull()
  })
})

describe('expectedLivemode', () => {
  it('reads the mode from the secret key prefix', () => {
    expect(expectedLivemode('sk_live_abc')).toBe(true)
    expect(expectedLivemode('sk_test_abc')).toBe(false)
    expect(expectedLivemode('')).toBeNull()
    expect(expectedLivemode(undefined)).toBeNull()
    expect(expectedLivemode('pk_live_abc')).toBeNull()
  })
})

describe('checkPaidCheckout', () => {
  const ev = (over: Partial<PaymongoEvent> = {}): PaymongoEvent => ({ ...parsePaymongoEvent(paid())!, ...over })

  it('passes a PHP 500 live payment of ours under a live key', () => {
    expect(checkPaidCheckout(ev(), true)).toEqual({ ok: true })
  })

  it('passes a test payment under a test key', () => {
    expect(checkPaidCheckout(ev({ livemode: false }), false)).toEqual({ ok: true })
  })

  it('rejects a mode that does not match the key', () => {
    expect(checkPaidCheckout(ev({ livemode: false }), true)).toMatchObject({ ok: false, reason: expect.stringMatching(/livemode/) })
    expect(checkPaidCheckout(ev({ livemode: true }), false)).toMatchObject({ ok: false })
  })

  it('rejects any amount but exactly 50000 centavos', () => {
    for (const amountCentavos of [null, 0, 100, 49999, 50001, 100000]) {
      expect(checkPaidCheckout(ev({ amountCentavos }), true), String(amountCentavos)).toMatchObject({ ok: false, reason: expect.stringMatching(/amount/) })
    }
  })

  it('rejects a currency other than PHP', () => {
    for (const currency of [null, 'USD', 'php']) {
      expect(checkPaidCheckout(ev({ currency }), true), String(currency)).toMatchObject({ ok: false, reason: expect.stringMatching(/currency/) })
    }
  })

  it('rejects a session not created by our checkout (reference number)', () => {
    for (const referenceNumber of [null, '', 'abc', 'isk-abc', 'XISK-abc']) {
      expect(checkPaidCheckout(ev({ referenceNumber }), true), String(referenceNumber)).toMatchObject({ ok: false, reason: expect.stringMatching(/reference/) })
    }
  })
})

describe('minimalPaymongoPayload', () => {
  const out = minimalPaymongoPayload(parsePaymongoEvent(paid())!)

  it('keeps only purchase facts', () => {
    expect(out).toEqual({
      event_id: 'evt_123', type: 'checkout_session.payment.paid', livemode: true,
      session_id: 'cs_abc', reference_number: 'ISK-abc', payment_ids: ['pay_1'],
      amount_centavos: 50000, currency: 'PHP',
    })
  })

  it('never carries the user id, metadata or billing details', () => {
    const text = JSON.stringify(out)
    for (const leak of [UID, 'metadata', 'billing', 'juan', 'Juan', '0917', 'user_id']) {
      expect(text, leak).not.toContain(leak)
    }
  })
})
