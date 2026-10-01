import { describe, it, expect } from 'vitest'
import { buildCheckoutSessionBody, parsePaymongoEvent, PRICE_CENTAVOS } from '../paymongo'

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

describe('parsePaymongoEvent', () => {
  const paid = {
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
            payments: [
              { id: 'pay_1', attributes: { status: 'paid', amount: 50000 } },
            ],
          },
        },
      },
    },
  }

  it('reads the event id, type, livemode, user id, session id and paid amount', () => {
    expect(parsePaymongoEvent(paid)).toEqual({
      eventId: 'evt_123',
      type: 'checkout_session.payment.paid',
      livemode: true,
      userId: UID,
      sessionId: 'cs_abc',
      amountCentavos: 50000,
    })
  })

  it('returns null for something that is not an event', () => {
    expect(parsePaymongoEvent(null)).toBeNull()
    expect(parsePaymongoEvent({})).toBeNull()
    expect(parsePaymongoEvent({ data: { attributes: { type: 'x' } } })).toBeNull()
  })

  it('treats livemode as true only when it is exactly true', () => {
    const e = structuredClone(paid)
    ;(e.data.attributes as { livemode: unknown }).livemode = 'true'
    expect(parsePaymongoEvent(e)?.livemode).toBe(false)
  })

  it('gives a null user id and amount when absent', () => {
    const e = structuredClone(paid)
    e.data.attributes.data.attributes = {} as never
    expect(parsePaymongoEvent(e)).toMatchObject({ userId: null, amountCentavos: null })
  })

  it('sums only paid payments', () => {
    const e = structuredClone(paid)
    e.data.attributes.data.attributes.payments.push({ id: 'pay_2', attributes: { status: 'failed', amount: 50000 } })
    expect(parsePaymongoEvent(e)?.amountCentavos).toBe(50000)
  })
})
