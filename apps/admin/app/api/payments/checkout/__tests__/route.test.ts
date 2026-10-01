import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fakeSupabase } from '@/lib/payments/__tests__/fakeSupabase'

const mockCheckRate = vi.fn()
vi.mock('@/lib/redis/rateLimiter', () => ({
  checkAndIncrementRate: (...a: unknown[]) => mockCheckRate(...a),
}))

const createServerClient = vi.fn()
vi.mock('@iskotify/utils', () => ({
  createServerClient: (...a: unknown[]) => createServerClient(...a),
}))

import { POST, OPTIONS } from '../route'

const UID = '11111111-1111-4111-8111-111111111111'
let db: ReturnType<typeof fakeSupabase>
const fetchMock = vi.fn()

function req(headers: Record<string, string> = { authorization: 'Bearer good-token' }) {
  return { headers: new Headers(headers) } as unknown as import('next/server').NextRequest
}

const paymongoOk = () =>
  new Response(JSON.stringify({ data: { id: 'cs_1', attributes: { checkout_url: 'https://checkout.paymongo.com/cs_1' } } }), { status: 200 })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  db = fakeSupabase()
  db.tokens.set('good-token', UID)
  db.users.add(UID)
  createServerClient.mockReturnValue(db.client)
  mockCheckRate.mockResolvedValue({ allowed: true, remaining: 5 })
  fetchMock.mockImplementation(async () => paymongoOk())
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('PAYMENTS_ENABLED', 'true')
  vi.stubEnv('PAYMONGO_SECRET_KEY', 'sk_test_abc')
  vi.stubEnv('WEB_APP_URL', '')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('POST /api/payments/checkout: the server flag', () => {
  it('503 payments_disabled unless PAYMENTS_ENABLED is exactly "true", before anything else', async () => {
    for (const v of ['', 'false', 'TRUE', '1']) {
      vi.stubEnv('PAYMENTS_ENABLED', v)
      const res = await POST(req())
      expect(res.status, v).toBe(503)
      expect(await res.json()).toEqual({ error: 'payments_disabled' })
    }
    expect(mockCheckRate).not.toHaveBeenCalled()
    expect(db.client.auth.getUser).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/payments/checkout: authentication', () => {
  it('401 with no or a non-Bearer Authorization header', async () => {
    expect((await POST(req({}))).status).toBe(401)
    expect((await POST(req({ authorization: 'Basic abc' }))).status).toBe(401)
    expect(db.client.auth.getUser).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('401 when the token does not verify', async () => {
    const res = await POST(req({ authorization: 'Bearer bad' }))
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('429 when rate limited, before verifying the token', async () => {
    mockCheckRate.mockResolvedValue({ allowed: false, remaining: 0, retryAfterMs: 30000 })
    const res = await POST(req())
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
    expect(db.client.auth.getUser).not.toHaveBeenCalled()
  })

  it('500 when Supabase or the PayMongo key is not configured', async () => {
    createServerClient.mockImplementationOnce(() => { throw new Error('missing env') })
    expect((await POST(req())).status).toBe(500)
    vi.stubEnv('PAYMONGO_SECRET_KEY', '')
    expect((await POST(req())).status).toBe(500)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/payments/checkout: already premium', () => {
  it('409 already_premium when the user has an active entitlement, without calling PayMongo', async () => {
    db.entitlements.set(UID, { user_id: UID, premium: true, source: 'play', granted_at: 'x', revoked_at: null })
    const res = await POST(req())
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'already_premium' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a revoked entitlement may buy again', async () => {
    db.entitlements.set(UID, { user_id: UID, premium: false, source: 'play', granted_at: 'x', revoked_at: 'y' })
    expect((await POST(req())).status).toBe(200)
  })

  it('500 when the entitlement lookup fails (never sell twice by accident)', async () => {
    db.fail.select = true
    expect((await POST(req())).status).toBe(500)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/payments/checkout: creating the session', () => {
  it('creates a PayMongo checkout session for the verified user and returns its URL', async () => {
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ checkoutUrl: 'https://checkout.paymongo.com/cs_1' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.paymongo.com/v1/checkout_sessions')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('sk_test_abc:').toString('base64')}`)
    expect(init.headers['Content-Type']).toBe('application/json')

    const attrs = JSON.parse(init.body).data.attributes
    expect(attrs.line_items).toEqual([{ name: 'Iskotify Full Access', amount: 50000, currency: 'PHP', quantity: 1 }])
    expect(attrs.payment_method_types).toEqual(['gcash', 'paymaya', 'card', 'qrph'])
    expect(attrs.metadata).toEqual({ user_id: UID })
    expect(attrs.success_url).toBe('https://app.iskotify.ph/upgrade?status=success')
    expect(attrs.cancel_url).toBe('https://app.iskotify.ph/upgrade?status=cancelled')
    expect(typeof attrs.reference_number).toBe('string')
  })

  it('uses a unique reference number per session', async () => {
    await POST(req())
    await POST(req())
    const refs = fetchMock.mock.calls.map(c => JSON.parse(c[1].body).data.attributes.reference_number)
    expect(refs[0]).not.toBe(refs[1])
  })

  it('honours WEB_APP_URL', async () => {
    vi.stubEnv('WEB_APP_URL', 'https://staging.iskotify.ph')
    await POST(req())
    const attrs = JSON.parse(fetchMock.mock.calls[0]![1].body).data.attributes
    expect(attrs.success_url).toBe('https://staging.iskotify.ph/upgrade?status=success')
  })

  it('never reads the user id from the request body', async () => {
    await POST({ headers: new Headers({ authorization: 'Bearer good-token' }), json: async () => ({ user_id: 'evil' }) } as never)
    const attrs = JSON.parse(fetchMock.mock.calls[0]![1].body).data.attributes
    expect(attrs.metadata.user_id).toBe(UID)
  })

  it('502 checkout_failed when PayMongo errors, without leaking its response', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ errors: [{ detail: 'secret stuff' }] }), { status: 400 }))
    const res = await POST(req())
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'checkout_failed' })
  })

  it('502 when PayMongo is unreachable or returns no https checkout_url', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'))
    expect((await POST(req())).status).toBe(502)
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { attributes: {} } }), { status: 200 }))
    expect((await POST(req())).status).toBe(502)
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { attributes: { checkout_url: 'javascript:alert(1)' } } }), { status: 200 }))
    expect((await POST(req())).status).toBe(502)
  })
})

describe('CORS for the web app', () => {
  it('answers the preflight for app.iskotify.ph with the Authorization header allowed', async () => {
    const res = await OPTIONS({ headers: new Headers({ origin: 'https://app.iskotify.ph' }) } as never)
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.iskotify.ph')
    expect(res.headers.get('Access-Control-Allow-Headers')).toMatch(/authorization/i)
    expect(res.headers.get('Access-Control-Allow-Methods')).toMatch(/POST/)
  })

  it('allows the Expo web dev server outside production, and nothing else', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const dev = await OPTIONS({ headers: new Headers({ origin: 'http://localhost:8081' }) } as never)
    expect(dev.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8081')
    const evil = await OPTIONS({ headers: new Headers({ origin: 'https://evil.example' }) } as never)
    expect(evil.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('does not allow localhost in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const dev = await OPTIONS({ headers: new Headers({ origin: 'http://localhost:8081' }) } as never)
    expect(dev.headers.get('Access-Control-Allow-Origin')).toBeNull()
    const prod = await OPTIONS({ headers: new Headers({ origin: 'https://app.iskotify.ph' }) } as never)
    expect(prod.headers.get('Access-Control-Allow-Origin')).toBe('https://app.iskotify.ph')
  })

  it('adds the allow-origin header to real responses, including errors', async () => {
    vi.stubEnv('PAYMENTS_ENABLED', 'false')
    const res = await POST({ headers: new Headers({ authorization: 'Bearer good-token', origin: 'https://app.iskotify.ph' }) } as never)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.iskotify.ph')
  })
})
