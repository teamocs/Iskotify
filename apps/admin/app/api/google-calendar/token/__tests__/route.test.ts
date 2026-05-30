import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockServerClient = vi.fn()
vi.mock('@iskotify/utils', () => ({ createServerClient: () => mockServerClient() }))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { POST } from '../route'

function makeReq(authHeader?: string): any {
  return {
    headers: new Headers(authHeader ? { authorization: authHeader } : {}),
  }
}

function makeClient(opts: { user?: { id: string } | null; refreshToken?: string | null; dbError?: boolean }) {
  return {
    auth: { getUser: async (_jwt: string) => ({ data: { user: opts.user ?? null }, error: opts.user ? null : { message: 'bad jwt' } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => opts.dbError
            ? { data: null, error: { message: 'no row' } }
            : { data: opts.refreshToken ? { refresh_token: opts.refreshToken } : null, error: opts.refreshToken ? null : { message: 'not found' } },
        }),
      }),
    }),
  }
}

beforeEach(() => {
  mockServerClient.mockReset(); mockFetch.mockReset()
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid'
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'secret'
})

describe('POST /api/google-calendar/token', () => {
  it('401 when Authorization header missing', async () => {
    mockServerClient.mockReturnValue(makeClient({ user: null }))
    const res = await POST(makeReq())
    expect(res.status).toBe(401)
  })

  it('401 when JWT is invalid', async () => {
    mockServerClient.mockReturnValue(makeClient({ user: null }))
    const res = await POST(makeReq('Bearer badjwt'))
    expect(res.status).toBe(401)
  })

  it('404 when the user has no stored connection', async () => {
    mockServerClient.mockReturnValue(makeClient({ user: { id: 'u1' }, refreshToken: null }))
    const res = await POST(makeReq('Bearer good'))
    expect(res.status).toBe(404)
  })

  it('200 with access_token on a successful Google exchange', async () => {
    mockServerClient.mockReturnValue(makeClient({ user: { id: 'u1' }, refreshToken: 'rt_1' }))
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'at_1', expires_in: 3600 }) })
    const res = await POST(makeReq('Bearer good'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.access_token).toBe('at_1')
    expect(body.expires_in).toBe(3600)
  })

  it('409 when Google reports invalid_grant (revoked)', async () => {
    mockServerClient.mockReturnValue(makeClient({ user: { id: 'u1' }, refreshToken: 'rt_1' }))
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) })
    const res = await POST(makeReq('Bearer good'))
    expect(res.status).toBe(409)
  })
})
