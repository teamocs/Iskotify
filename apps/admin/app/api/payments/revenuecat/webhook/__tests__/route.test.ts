import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fakeSupabase } from '@/lib/payments/__tests__/fakeSupabase'

const createServerClient = vi.fn()
vi.mock('@iskotify/utils', () => ({
  createServerClient: (...a: unknown[]) => createServerClient(...a),
}))

import { POST } from '../route'

const UID = '11111111-1111-4111-8111-111111111111'
const AUTH = 'Bearer rc-webhook-secret'
let db: ReturnType<typeof fakeSupabase>

function rcEvent(over: Record<string, unknown> = {}) {
  return {
    api_version: '1.0',
    event: {
      id: 'rc-evt-1',
      type: 'NON_RENEWING_PURCHASE',
      app_user_id: UID,
      original_app_user_id: UID,
      entitlement_ids: ['premium'],
      store: 'PLAY_STORE',
      environment: 'PRODUCTION',
      product_id: 'iskotify_full_access',
      price: 8.6,
      price_in_purchased_currency: 500,
      currency: 'PHP',
      transaction_id: 'GPA.1234',
      aliases: [UID, '$RCAnonymousID:a'],
      subscriber_attributes: { $email: { value: 'juan@example.com' }, $displayName: { value: 'Juan' } },
      ...over,
    },
  }
}

function req(body: unknown, auth: string | null = AUTH) {
  const headers = new Headers()
  if (auth !== null) headers.set('authorization', auth)
  const raw = typeof body === 'string' ? body : JSON.stringify(body)
  return {
    headers,
    text: async () => raw,
    json: async () => JSON.parse(raw),
  } as unknown as import('next/server').NextRequest
}

const playRow = (over: Record<string, unknown> = {}) => ({
  user_id: UID, premium: true, source: 'play', granted_at: '2026-01-01T00:00:00.000Z', revoked_at: null, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  db = fakeSupabase()
  db.users.add(UID)
  createServerClient.mockReturnValue(db.client)
  vi.stubEnv('REVENUECAT_WEBHOOK_AUTH', AUTH)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/payments/revenuecat/webhook: authorization', () => {
  it('401 without or with a wrong Authorization header, touching nothing', async () => {
    for (const auth of [null, '', 'Bearer wrong', `${AUTH}x`, AUTH.slice(0, -1)]) {
      const res = await POST(req(rcEvent(), auth))
      expect(res.status, String(auth)).toBe(401)
    }
    expect(createServerClient).not.toHaveBeenCalled()
  })

  it('500 when REVENUECAT_WEBHOOK_AUTH is not configured (never open)', async () => {
    vi.stubEnv('REVENUECAT_WEBHOOK_AUTH', '')
    expect((await POST(req(rcEvent(), ''))).status).toBe(500)
    expect(createServerClient).not.toHaveBeenCalled()
  })

  it('400 for a body that is not JSON or has no event id', async () => {
    expect((await POST(req('not json'))).status).toBe(400)
    expect((await POST(req({ event: { type: 'TEST' } }))).status).toBe(400)
  })
})

describe('POST /api/payments/revenuecat/webhook: purchases', () => {
  for (const type of ['INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE']) {
    it(`${type} grants play premium and records the purchase`, async () => {
      const res = await POST(req(rcEvent({ type })))
      expect(res.status).toBe(200)
      expect(db.entitlements.get(UID)).toMatchObject({ user_id: UID, premium: true, source: 'play', revoked_at: null })
      expect(db.events.get('rc-evt-1')).toMatchObject({
        id: 'rc-evt-1', provider: 'revenuecat', user_id: UID, type, amount_centavos: 50000,
      })
      expect(db.client.rpc).toHaveBeenCalledWith('grant_entitlement', { p_uid: UID, p_source: 'play' })
    })
  }

  it('stores a minimal payload: no user id, alias or subscriber attribute', async () => {
    await POST(req(rcEvent()))
    const payload = db.events.get('rc-evt-1')!.payload as Record<string, unknown>
    expect(payload).toMatchObject({ event_id: 'rc-evt-1', type: 'NON_RENEWING_PURCHASE', transaction_id: 'GPA.1234', amount: 500, currency: 'PHP' })
    const text = JSON.stringify(payload)
    for (const leak of [UID, 'RCAnonymousID', 'juan', 'Juan', 'aliases', 'subscriber_attributes']) expect(text, leak).not.toContain(leak)
  })

  it('is idempotent: a replayed event is a 200 no-op', async () => {
    await POST(req(rcEvent()))
    const first = db.entitlements.get(UID)
    const res = await POST(req(rcEvent()))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ duplicate: true })
    expect(db.entitlements.get(UID)).toBe(first)
  })

  it('a Play purchase does not overwrite a web grant', async () => {
    const web = playRow({ source: 'web' })
    db.entitlements.set(UID, web)
    await POST(req(rcEvent()))
    expect(db.entitlements.get(UID)).toBe(web)
  })

  it('records no amount for a non-PHP purchase', async () => {
    await POST(req(rcEvent({ currency: 'USD', price_in_purchased_currency: 9 })))
    expect(db.events.get('rc-evt-1')).toMatchObject({ amount_centavos: null })
  })

  it('a failed grant forgets the event so RevenueCat\'s retry can grant', async () => {
    db.fail.rpc = true
    expect((await POST(req(rcEvent()))).status).toBe(500)
    expect(db.events.has('rc-evt-1')).toBe(false)
    db.fail.rpc = false
    expect((await POST(req(rcEvent()))).status).toBe(200)
    expect(db.entitlements.get(UID)).toMatchObject({ premium: true })
  })

  it('500 when the event cannot be recorded, granting nothing', async () => {
    db.fail.insertEvent = true
    expect((await POST(req(rcEvent()))).status).toBe(500)
    expect(db.client.rpc).not.toHaveBeenCalled()
  })
})

describe('POST /api/payments/revenuecat/webhook: refunds and expiry', () => {
  it('a refund (CANCELLATION, CUSTOMER_SUPPORT) revokes a play grant', async () => {
    db.entitlements.set(UID, playRow())
    const res = await POST(req(rcEvent({ id: 'rc-evt-2', type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' })))
    expect(res.status).toBe(200)
    const row = db.entitlements.get(UID)!
    expect(row).toMatchObject({ premium: false, source: 'play', granted_at: '2026-01-01T00:00:00.000Z' })
    expect(typeof row.revoked_at).toBe('string')
    expect(db.client.rpc).toHaveBeenCalledWith('revoke_play_entitlement', { p_uid: UID })
  })

  it('EXPIRATION revokes a play grant', async () => {
    db.entitlements.set(UID, playRow())
    await POST(req(rcEvent({ id: 'rc-evt-2', type: 'EXPIRATION' })))
    expect(db.entitlements.get(UID)).toMatchObject({ premium: false })
  })

  it('never revokes a web, grandfather or admin grant', async () => {
    for (const source of ['web', 'grandfather', 'admin']) {
      const kept = playRow({ source })
      db.entitlements.set(UID, kept)
      await POST(req(rcEvent({ id: `rc-${source}`, type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' })))
      expect(db.entitlements.get(UID), source).toBe(kept)
    }
  })

  it('an ordinary cancellation does not revoke', async () => {
    const kept = playRow()
    db.entitlements.set(UID, kept)
    await POST(req(rcEvent({ id: 'rc-evt-2', type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE' })))
    expect(db.entitlements.get(UID)).toBe(kept)
  })

  it('a revoke for a user with no row writes nothing', async () => {
    const res = await POST(req(rcEvent({ type: 'EXPIRATION' })))
    expect(res.status).toBe(200)
    expect(db.entitlements.size).toBe(0)
  })
})

describe('POST /api/payments/revenuecat/webhook: ignored events', () => {
  it('anonymous RevenueCat ids are acknowledged, logged and ignored', async () => {
    const res = await POST(req(rcEvent({ app_user_id: '$RCAnonymousID:abc' })))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ignored: true })
    expect(db.entitlements.size).toBe(0)
    expect(db.events.get('rc-evt-1')).toMatchObject({ user_id: null })
    expect(console.warn).toHaveBeenCalled()
  })

  it('a uuid that is not a real user is ignored', async () => {
    const res = await POST(req(rcEvent({ app_user_id: '22222222-2222-4222-8222-222222222222' })))
    expect(res.status).toBe(200)
    expect(db.entitlements.size).toBe(0)
  })

  it('500 (RevenueCat retries) when the user lookup itself fails', async () => {
    db.fail.getUserById = true
    expect((await POST(req(rcEvent()))).status).toBe(500)
    expect(db.events.size).toBe(0)
  })

  it('sandbox events are ignored by default', async () => {
    const res = await POST(req(rcEvent({ environment: 'SANDBOX' })))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ignored: true })
    expect(db.entitlements.size).toBe(0)
  })

  it('sandbox events count when REVENUECAT_ALLOW_SANDBOX is "true" (internal testing)', async () => {
    vi.stubEnv('REVENUECAT_ALLOW_SANDBOX', 'true')
    await POST(req(rcEvent({ environment: 'SANDBOX' })))
    expect(db.entitlements.get(UID)).toMatchObject({ premium: true, source: 'play' })
  })

  it('our own promotional grant echoing back does not change the web grant', async () => {
    const web = playRow({ source: 'web' })
    db.entitlements.set(UID, web)
    await POST(req(rcEvent({ store: 'PROMOTIONAL', type: 'NON_RENEWING_PURCHASE' })))
    expect(db.entitlements.get(UID)).toBe(web)
  })

  it('is never cached', async () => {
    const res = await POST(req(rcEvent()))
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('POST /api/payments/revenuecat/webhook: TRANSFER moves premium', () => {
  const UID2 = '22222222-2222-4222-8222-222222222222'
  const transfer = (over: Record<string, unknown> = {}) =>
    rcEvent({ id: 'rc-tr-1', type: 'TRANSFER', app_user_id: undefined, entitlement_ids: undefined, transferred_from: [UID], transferred_to: [UID2], ...over })

  beforeEach(() => { db.users.add(UID2) })

  it("revokes the sender's play grant and grants the receiver play", async () => {
    db.entitlements.set(UID, playRow())
    const res = await POST(req(transfer()))
    expect(res.status).toBe(200)
    expect(db.entitlements.get(UID)).toMatchObject({ premium: false, source: 'play' })
    expect(db.entitlements.get(UID2)).toMatchObject({ premium: true, source: 'play' })
    expect(db.events.get('rc-tr-1')).toMatchObject({ type: 'TRANSFER', user_id: UID2 })
  })

  it('closes the loophole: after a transfer and a refund, neither account keeps premium', async () => {
    db.entitlements.set(UID, playRow())
    await POST(req(transfer()))
    await POST(req(rcEvent({ id: 'rc-refund', app_user_id: UID2, type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' })))
    expect(db.entitlements.get(UID)).toMatchObject({ premium: false })
    expect(db.entitlements.get(UID2)).toMatchObject({ premium: false })
  })

  it("never revokes a sender's web, grandfather or admin grant", async () => {
    const web = playRow({ source: 'web' })
    db.entitlements.set(UID, web)
    await POST(req(transfer()))
    expect(db.entitlements.get(UID)).toBe(web)
    expect(db.entitlements.get(UID2)).toMatchObject({ premium: true })
  })

  it('does not grant a receiver that is not a real user, but still revokes the sender', async () => {
    db.users.delete(UID2)
    db.entitlements.set(UID, playRow())
    await POST(req(transfer()))
    expect(db.entitlements.has(UID2)).toBe(false)
    expect(db.entitlements.get(UID)).toMatchObject({ premium: false })
    expect(db.events.get('rc-tr-1')).toMatchObject({ user_id: null })
  })

  it('a transfer to an anonymous id still revokes the sender', async () => {
    db.entitlements.set(UID, playRow())
    await POST(req(transfer({ transferred_to: ['$RCAnonymousID:x'] })))
    expect(db.entitlements.get(UID)).toMatchObject({ premium: false })
  })

  it('a failed write forgets the event so the retry can finish the transfer', async () => {
    db.entitlements.set(UID, playRow())
    db.fail.rpc = true
    expect((await POST(req(transfer()))).status).toBe(500)
    expect(db.events.has('rc-tr-1')).toBe(false)
    db.fail.rpc = false
    expect((await POST(req(transfer()))).status).toBe(200)
    expect(db.entitlements.get(UID2)).toMatchObject({ premium: true })
  })

  it('stores no transfer ids in the payload', async () => {
    await POST(req(transfer()))
    const text = JSON.stringify(db.events.get('rc-tr-1')!.payload)
    expect(text).not.toContain(UID)
    expect(text).not.toContain(UID2)
  })
})
