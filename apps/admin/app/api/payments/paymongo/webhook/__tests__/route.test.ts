import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'crypto'
import { fakeSupabase } from '@/lib/payments/__tests__/fakeSupabase'

const createServerClient = vi.fn()
vi.mock('@iskotify/utils', () => ({
  createServerClient: (...a: unknown[]) => createServerClient(...a),
}))

import { POST } from '../route'

const UID = '11111111-1111-4111-8111-111111111111'
const SECRET = 'whsk_test'
let db: ReturnType<typeof fakeSupabase>
const fetchMock = vi.fn()

function event(over: { id?: string; type?: string; livemode?: boolean; userId?: unknown } = {}) {
  return {
    data: {
      id: over.id ?? 'evt_1',
      type: 'event',
      attributes: {
        type: over.type ?? 'checkout_session.payment.paid',
        livemode: over.livemode ?? false,
        data: {
          id: 'cs_1',
          type: 'checkout_session',
          attributes: {
            metadata: 'userId' in over ? { user_id: over.userId } : { user_id: UID },
            payments: [{ id: 'pay_1', attributes: { status: 'paid', amount: 50000 } }],
          },
        },
      },
    },
  }
}

function signed(body: unknown, opts: { livemode?: boolean; secret?: string; t?: number; raw?: string } = {}) {
  const raw = opts.raw ?? JSON.stringify(body)
  const t = opts.t ?? Math.floor(Date.now() / 1000)
  const sig = createHmac('sha256', opts.secret ?? SECRET).update(`${t}.${raw}`).digest('hex')
  const header = opts.livemode ? `t=${t},te=,li=${sig}` : `t=${t},te=${sig},li=`
  return req(raw, { 'paymongo-signature': header })
}

function req(raw: string, headers: Record<string, string> = {}) {
  return { headers: new Headers(headers), text: async () => raw } as unknown as import('next/server').NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  db = fakeSupabase()
  db.users.add(UID)
  createServerClient.mockReturnValue(db.client)
  fetchMock.mockResolvedValue(new Response('{}', { status: 201 }))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('PAYMONGO_WEBHOOK_SECRET', SECRET)
  vi.stubEnv('REVENUECAT_SECRET_API_KEY', 'sk_rc_abc')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('POST /api/payments/paymongo/webhook: signature', () => {
  it('401 without a signature header, touching nothing', async () => {
    const res = await POST(req(JSON.stringify(event())))
    expect(res.status).toBe(401)
    expect(createServerClient).not.toHaveBeenCalled()
    expect(db.entitlements.size).toBe(0)
  })

  it('401 for a signature made with another secret', async () => {
    const res = await POST(signed(event(), { secret: 'nope' }))
    expect(res.status).toBe(401)
    expect(db.entitlements.size).toBe(0)
  })

  it('401 when a live event carries only a test signature', async () => {
    const body = event({ livemode: true })
    const res = await POST(signed(body, { livemode: false }))
    expect(res.status).toBe(401)
  })

  it('accepts a live event signed in li', async () => {
    const res = await POST(signed(event({ livemode: true }), { livemode: true }))
    expect(res.status).toBe(200)
    expect(db.entitlements.get(UID)).toMatchObject({ premium: true, source: 'web' })
  })

  it('401 for a replay older than 5 minutes', async () => {
    const res = await POST(signed(event(), { t: Math.floor(Date.now() / 1000) - 600 }))
    expect(res.status).toBe(401)
  })

  it('verifies against the RAW body, byte for byte', async () => {
    const raw = JSON.stringify(event(), null, 2) // whitespace a parser would discard
    const res = await POST(signed(null, { raw }))
    expect(res.status).toBe(200)
  })

  it('400 for a body that is not JSON or not an event', async () => {
    expect((await POST(signed(null, { raw: 'not json' }))).status).toBe(400)
    expect((await POST(signed({ hello: 'world' }))).status).toBe(400)
  })

  it('500 when the webhook secret is not configured (PayMongo retries)', async () => {
    vi.stubEnv('PAYMONGO_WEBHOOK_SECRET', '')
    expect((await POST(signed(event()))).status).toBe(500)
  })
})

describe('POST /api/payments/paymongo/webhook: checkout_session.payment.paid', () => {
  it('records the event, grants web premium, and mirrors it to RevenueCat', async () => {
    const res = await POST(signed(event()))
    expect(res.status).toBe(200)

    expect(db.events.get('evt_1')).toMatchObject({
      id: 'evt_1', provider: 'paymongo', user_id: UID, type: 'checkout_session.payment.paid', amount_centavos: 50000,
    })
    expect(db.events.get('evt_1')!.payload).toEqual(event())

    const row = db.entitlements.get(UID)!
    expect(row).toMatchObject({ user_id: UID, premium: true, source: 'web', revoked_at: null })
    expect(typeof row.granted_at).toBe('string')
    expect(typeof row.updated_at).toBe('string')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`https://api.revenuecat.com/v1/subscribers/${UID}/entitlements/premium/promotional`)
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer sk_rc_abc')
    expect(JSON.parse(init.body)).toEqual({ duration: 'lifetime' })
  })

  it('is idempotent: a replayed event is a 200 no-op', async () => {
    await POST(signed(event()))
    const first = db.entitlements.get(UID)
    fetchMock.mockClear()
    db.client.from.mockClear()

    const res = await POST(signed(event()))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ duplicate: true })
    expect(db.entitlements.get(UID)).toBe(first)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still 200 when RevenueCat fails (the entitlements table is the source of truth)', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }))
    const res = await POST(signed(event()))
    expect(res.status).toBe(200)
    expect(db.entitlements.get(UID)).toMatchObject({ premium: true })
    expect(console.error).toHaveBeenCalled()

    fetchMock.mockRejectedValue(new Error('network'))
    const res2 = await POST(signed(event({ id: 'evt_2' })))
    expect(res2.status).toBe(200)
  })

  it('skips the RevenueCat mirror when its key is not configured', async () => {
    vi.stubEnv('REVENUECAT_SECRET_API_KEY', '')
    const res = await POST(signed(event()))
    expect(res.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a non-uuid user id is recorded without a user and grants nothing', async () => {
    const res = await POST(signed(event({ userId: "x'; drop table" })))
    expect(res.status).toBe(200)
    expect(db.events.get('evt_1')).toMatchObject({ user_id: null })
    expect(db.entitlements.size).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a uuid of a user that does not exist grants nothing', async () => {
    const ghost = '22222222-2222-4222-8222-222222222222'
    const res = await POST(signed(event({ userId: ghost })))
    expect(res.status).toBe(200)
    expect(db.entitlements.size).toBe(0)
    expect(db.events.get('evt_1')).toMatchObject({ user_id: null })
  })

  it('a missing user id grants nothing', async () => {
    const res = await POST(signed(event({ userId: undefined })))
    expect(res.status).toBe(200)
    expect(db.entitlements.size).toBe(0)
  })

  it('500 (so PayMongo retries) when the user lookup fails, recording nothing', async () => {
    db.fail.getUserById = true
    expect((await POST(signed(event()))).status).toBe(500)
    expect(db.events.size).toBe(0)
  })

  it('500 when the event cannot be recorded', async () => {
    db.fail.insertEvent = true
    expect((await POST(signed(event()))).status).toBe(500)
    expect(db.entitlements.size).toBe(0)
  })

  it('a failed grant forgets the event so the retry can grant', async () => {
    db.fail.upsert = true
    expect((await POST(signed(event()))).status).toBe(500)
    expect(db.events.has('evt_1')).toBe(false)

    db.fail.upsert = false
    expect((await POST(signed(event()))).status).toBe(200)
    expect(db.entitlements.get(UID)).toMatchObject({ premium: true, source: 'web' })
  })

  it('a web purchase is never downgraded and replaces a Play grant as source', async () => {
    db.entitlements.set(UID, { user_id: UID, premium: true, source: 'play', granted_at: '2026-01-01T00:00:00.000Z', revoked_at: null })
    await POST(signed(event()))
    expect(db.entitlements.get(UID)).toMatchObject({ premium: true, source: 'web', granted_at: '2026-01-01T00:00:00.000Z' })
  })

  it('500 when Supabase is not configured', async () => {
    createServerClient.mockImplementation(() => { throw new Error('missing env') })
    expect((await POST(signed(event()))).status).toBe(500)
  })
})

describe('POST /api/payments/paymongo/webhook: other events', () => {
  it('unknown event types are acknowledged (200) and ignored', async () => {
    const res = await POST(signed(event({ type: 'payment.paid' })))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ignored: true })
    expect(db.entitlements.size).toBe(0)
    expect(db.events.size).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is never cached', async () => {
    const res = await POST(signed(event()))
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})
