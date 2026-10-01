import { describe, it, expect, vi, beforeEach } from 'vitest'

const order: string[] = []

const mockCheckRate = vi.fn()
vi.mock('@/lib/redis/rateLimiter', () => ({
  checkAndIncrementRate: (...a: unknown[]) => mockCheckRate(...a),
}))

const mockGetUser = vi.fn()
const mockDeleteUser = vi.fn()
const mockRpc = vi.fn()
const mockRemove = vi.fn()
const mockStorageFrom = vi.fn()
const mockEq = vi.fn()
const mockSelect = vi.fn()
const mockFrom = vi.fn()
const createServerClient = vi.fn()

vi.mock('@iskotify/utils', () => ({
  createServerClient: (...a: unknown[]) => createServerClient(...a),
}))

import { POST, OPTIONS } from '../route'

const UID = '11111111-1111-4111-8111-111111111111'

function req(headers: Record<string, string> = { authorization: 'Bearer good-token' }) {
  return { headers: new Headers(headers) } as unknown as import('next/server').NextRequest
}

beforeEach(() => {
  order.length = 0
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockCheckRate.mockResolvedValue({ allowed: true, remaining: 5 })
  mockGetUser.mockImplementation(async () => { order.push('getUser'); return { data: { user: { id: UID } }, error: null } })
  mockEq.mockImplementation(async () => {
    order.push('list')
    return {
      data: [
        { image_url: 'abc123.jpg' },
        { image_url: 'https://x.supabase.co/storage/v1/object/public/app-bug-reports/old/shot.png' },
        { image_url: null },
        { image_url: 'abc123.jpg' },
        { image_url: '../escape' },
      ],
      error: null,
    }
  })
  mockSelect.mockReturnValue({ eq: mockEq })
  mockFrom.mockReturnValue({ select: mockSelect })
  mockRemove.mockImplementation(async () => { order.push('remove'); return { data: [], error: null } })
  mockStorageFrom.mockReturnValue({ remove: mockRemove })
  mockRpc.mockImplementation(async () => { order.push('rpc'); return { error: null } })
  mockDeleteUser.mockImplementation(async () => { order.push('deleteUser'); return { error: null } })
  createServerClient.mockReturnValue({
    auth: { getUser: mockGetUser, admin: { deleteUser: mockDeleteUser } },
    from: mockFrom,
    storage: { from: mockStorageFrom },
    rpc: mockRpc,
  })
})

describe('POST /api/account/delete: authentication', () => {
  it('401 with no Authorization header, touching nothing', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(401)
    expect(mockGetUser).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })

  it('401 for a non-Bearer header', async () => {
    const res = await POST(req({ authorization: 'Basic abc' }))
    expect(res.status).toBe(401)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('401 when the token does not verify, touching nothing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid JWT' } })
    const res = await POST(req())
    expect(res.status).toBe(401)
    expect(mockRemove).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })

  it('verifies the token itself, and acts on the id it returns (never one from the body)', async () => {
    await POST(req())
    expect(mockGetUser).toHaveBeenCalledWith('good-token')
    expect(mockRpc).toHaveBeenCalledWith('delete_user_data', { p_uid: UID })
    expect(mockDeleteUser).toHaveBeenCalledWith(UID)
  })

  it('429 when rate limited, before verifying anything', async () => {
    mockCheckRate.mockResolvedValue({ allowed: false, remaining: 0, retryAfterMs: 30000 })
    const res = await POST(req())
    expect(res.status).toBe(429)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('500 when the server is not configured', async () => {
    createServerClient.mockImplementation(() => { throw new Error('missing env') })
    const res = await POST(req())
    expect(res.status).toBe(500)
  })
})

describe('POST /api/account/delete: happy path', () => {
  it('verifies, removes screenshot files, deletes the rows, then the auth user, in that order', async () => {
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(order).toEqual(['getUser', 'list', 'remove', 'rpc', 'deleteUser'])
  })

  it("removes exactly the user's own screenshot paths from the private bucket (deduplicated, bad values dropped)", async () => {
    await POST(req())
    expect(mockFrom).toHaveBeenCalledWith('app_bug_reports')
    expect(mockEq).toHaveBeenCalledWith('user_id', UID)
    expect(mockStorageFrom).toHaveBeenCalledWith('app-bug-reports')
    expect(mockRemove).toHaveBeenCalledWith(['abc123.jpg', 'old/shot.png'])
  })

  it('skips the storage call when the user has no screenshots', async () => {
    mockEq.mockResolvedValue({ data: [{ image_url: null }], error: null })
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(mockRemove).not.toHaveBeenCalled()
    expect(mockRpc).toHaveBeenCalled()
  })

  it('is never cached', async () => {
    const res = await POST(req())
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('POST /api/account/delete: failures keep what must be kept', () => {
  it('a failed report lookup stops before anything is removed (500)', async () => {
    mockEq.mockResolvedValue({ data: null, error: { message: 'db down' } })
    const res = await POST(req())
    expect(res.status).toBe(500)
    expect(mockRemove).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })

  it('a storage failure fails BEFORE touching any data, so a retry can clean everything', async () => {
    mockRemove.mockResolvedValue({ data: null, error: { message: 'storage down' } })
    const res = await POST(req())
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/nothing was deleted/i)
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })

  it('an rpc failure keeps the auth user (500)', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'boom' } })
    const res = await POST(req())
    expect(res.status).toBe(500)
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })

  it('a deleteUser failure after the rows are gone is 500 with a retry-is-safe message', async () => {
    mockDeleteUser.mockResolvedValue({ error: { message: 'auth down' } })
    const res = await POST(req())
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/try again/i)
    expect(order).toContain('rpc')
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

  it('does not allow other origins', async () => {
    const res = await OPTIONS({ headers: new Headers({ origin: 'https://evil.example' }) } as never)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('adds the allow-origin header to real responses for the web app', async () => {
    const res = await POST({ headers: new Headers({ authorization: 'Bearer good-token', origin: 'https://app.iskotify.ph' }) } as never)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.iskotify.ph')
  })
})
