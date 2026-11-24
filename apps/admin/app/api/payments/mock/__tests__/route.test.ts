import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fakeSupabase } from '@/lib/payments/__tests__/fakeSupabase'

vi.mock('@/lib/redis/rateLimiter', () => ({ checkAndIncrementRate: async () => ({ allowed: true, remaining: 5 }) }))
const createServerClient = vi.fn()
vi.mock('@iskotify/utils', () => ({ createServerClient: () => createServerClient() }))

import { POST } from '../route'

const UID = '11111111-1111-4111-8111-111111111111'
const REF = 'ISK-MOCK-abc123-0011223344ff'
let db: ReturnType<typeof fakeSupabase>

const call = (body: unknown, token = 'good-token') =>
  POST({ headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}), json: async () => body } as never)

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  db = fakeSupabase()
  db.tokens.set('good-token', UID)
  db.roles.set(UID, 'admin')
  createServerClient.mockReturnValue(db.client)
  vi.stubEnv('PAYMENTS_ENABLED', '')
})
afterEach(() => vi.unstubAllEnvs())

describe('POST /api/payments/mock', () => {
  it('404 for a student, and once real payments are on', async () => {
    db.roles.set(UID, 'student')
    expect((await call({ action: 'pay', reference: REF })).status).toBe(404)
    db.roles.set(UID, 'admin')
    vi.stubEnv('PAYMENTS_ENABLED', 'true')
    expect((await call({ action: 'pay', reference: REF })).status).toBe(404)
    expect(db.entitlements.size).toBe(0)
    expect(db.events.size).toBe(0)
  })

  it('401 without a valid token; 400 for anything malformed', async () => {
    expect((await call({ action: 'pay', reference: REF }, '')).status).toBe(401)
    expect((await call({ action: 'pay', reference: REF }, 'bad')).status).toBe(401)
    for (const body of [null, {}, { action: 'pay' }, { action: 'pay', reference: 'ISK-real' }, { action: 'grant' }]) {
      expect((await call(body)).status).toBe(400)
    }
  })

  it('pay grants the caller once, recorded as a mock event', async () => {
    expect(await (await call({ action: 'pay', reference: REF, user_id: 'evil' })).json()).toEqual({ granted: true })
    expect(db.entitlements.get(UID)).toMatchObject({ premium: true, source: 'web' })
    expect(db.events.get(`mock_${REF}`)).toMatchObject({ provider: 'mock', user_id: UID })
    expect(db.events.get(`mock_${REF}`)!.processed_at).toBeTruthy()
    expect(await (await call({ action: 'pay', reference: REF })).json()).toMatchObject({ granted: false })
  })

  it('a failed grant answers 500 and the same reference can be retried', async () => {
    db.fail.rpc = true
    expect((await call({ action: 'pay', reference: REF })).status).toBe(500)
    db.fail.rpc = false
    expect(await (await call({ action: 'pay', reference: REF })).json()).toEqual({ granted: true })
  })

  it('reset undoes a test grant, and a replayed reference does not bring it back', async () => {
    await call({ action: 'pay', reference: REF })
    expect((await call({ action: 'reset' })).status).toBe(200)
    expect(db.entitlements.get(UID)).toMatchObject({ premium: false })
    await call({ action: 'pay', reference: REF })
    expect(db.entitlements.get(UID)).toMatchObject({ premium: false })
  })

  it('reset never touches a real purchase or another kind of grant', async () => {
    db.entitlements.set(UID, { user_id: UID, premium: true, source: 'admin' })
    expect((await call({ action: 'pay', reference: REF })).status).toBe(409)
    await call({ action: 'reset' })
    expect(db.entitlements.get(UID)).toMatchObject({ premium: true, source: 'admin' })
    db.entitlements.set(UID, { user_id: UID, premium: true, source: 'web' })
    db.events.set('evt', { id: 'evt', provider: 'paymongo', user_id: UID })
    expect((await call({ action: 'reset' })).status).toBe(409)
    expect(db.entitlements.get(UID)).toMatchObject({ premium: true })
  })
})
