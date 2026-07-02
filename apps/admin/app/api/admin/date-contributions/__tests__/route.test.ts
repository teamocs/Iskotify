import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fake-anon-key')

// ── Auth client mock (mirrors feedback/__tests__/route.test.ts pattern) ──────
const mockGetUser = vi.fn()
vi.mock('@/lib/supabase', () => ({
  createAuthClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

// ── Chainable Supabase mock ──────────────────────────────────────────────────
const mockProfileSingle = vi.fn()
const mockRange = vi.fn()          // GET list result
const mockListingsIn = vi.fn()     // GET title lookup
const mockContribSingle = vi.fn()  // POST row load (.maybeSingle)
const mockContribUpdate = vi.fn()  // contribution status update
const mockListingsUpdate = vi.fn() // listings date update (.select('id') result)

// Captured args for assertions
let capturedEqArgs: Array<[string, unknown]> = []
let capturedOrderArgs: Array<[string, unknown]> = []
let lastContribUpdateArg: Record<string, unknown> | undefined
let lastContribUpdateEq: [string, unknown] | undefined
let lastListingsUpdateArg: Record<string, unknown> | undefined
let lastListingsUpdateEq: [string, unknown] | undefined

function makeChain(table: string): any {
  if (table === 'profiles') {
    return {
      select(_c: string) {
        return { eq(_col: string, _val: unknown) { return { single: mockProfileSingle } } }
      },
    }
  }

  if (table === 'listing_date_contributions') {
    const chain: any = {
      eq(col: string, val: unknown) { capturedEqArgs.push([col, val]); return chain },
      order(col: string, opts?: unknown) { capturedOrderArgs.push([col, opts]); return chain },
      range(from: number, to: number) { return Promise.resolve(mockRange(from, to)) },
      maybeSingle() { return Promise.resolve(mockContribSingle()) },
    }
    return {
      select(_cols: string, _opts?: unknown) { return chain },
      update(data: Record<string, unknown>) {
        lastContribUpdateArg = data
        return {
          eq(col: string, val: unknown) {
            lastContribUpdateEq = [col, val]
            return Promise.resolve(mockContribUpdate(data, col, val))
          },
        }
      },
    }
  }

  if (table === 'listings') {
    return {
      select(_cols: string) {
        return { in(col: string, vals: unknown) { return Promise.resolve(mockListingsIn(col, vals)) } }
      },
      update(data: Record<string, unknown>) {
        lastListingsUpdateArg = data
        return {
          eq(col: string, val: unknown) {
            lastListingsUpdateEq = [col, val]
            return { select(_c: string) { return Promise.resolve(mockListingsUpdate(data, col, val)) } }
          },
        }
      },
    }
  }

  throw new Error(`Unexpected table: ${table}`)
}

const mockFrom = vi.fn((table: string) => makeChain(table))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))

// ── Auth helpers ─────────────────────────────────────────────────────────────

function adminUser() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'admin-1' } } })
  mockProfileSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
}

function noUser() {
  mockGetUser.mockResolvedValueOnce({ data: { user: null } })
}

function nonAdmin() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u2' } } })
  mockProfileSingle.mockResolvedValueOnce({ data: { role: 'viewer' }, error: null })
}

function resetAll() {
  vi.resetModules()
  mockGetUser.mockReset()
  mockProfileSingle.mockReset()
  mockFrom.mockClear()
  mockRange.mockReset()
  mockListingsIn.mockReset()
  mockContribSingle.mockReset()
  mockContribUpdate.mockReset()
  mockListingsUpdate.mockReset()
  capturedEqArgs = []
  capturedOrderArgs = []
  lastContribUpdateArg = undefined
  lastContribUpdateEq = undefined
  lastListingsUpdateArg = undefined
  lastListingsUpdateEq = undefined
}

function makeListReq(qs = '') {
  return new NextRequest(`http://localhost/api/admin/date-contributions${qs}`)
}

function makePostReq(body: unknown) {
  return new NextRequest('http://localhost/api/admin/date-contributions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── GET /api/admin/date-contributions ────────────────────────────────────────

describe('GET /api/admin/date-contributions', () => {
  beforeEach(() => {
    resetAll()
    mockRange.mockResolvedValue({ data: [], count: 0, error: null })
    mockListingsIn.mockResolvedValue({ data: [], error: null })
  })

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { GET } = await import('../route')
    const res = await GET(makeListReq())
    expect(res.status).toBe(401)
  })

  it('returns 403 when non-admin', async () => {
    nonAdmin()
    const { GET } = await import('../route')
    const res = await GET(makeListReq())
    expect(res.status).toBe(403)
  })

  it('returns the pending list by default, ordered by created_at desc + id tiebreaker', async () => {
    adminUser()
    mockRange.mockResolvedValueOnce({
      data: [{ id: 'c1', listing_slug: 'upcat', field: 'exam_date', suggested_date: '2027-08-01', status: 'pending' }],
      count: 1,
      error: null,
    })
    mockListingsIn.mockResolvedValueOnce({ data: [{ slug: 'upcat', title: 'UPCAT' }], error: null })
    const { GET } = await import('../route')
    const res = await GET(makeListReq())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.rows).toHaveLength(1)
    expect(json.rows[0].listing_title).toBe('UPCAT')
    expect(json.count).toBe(1)
    // default status filter is pending
    expect(capturedEqArgs).toContainEqual(['status', 'pending'])
    // deterministic order: created_at desc then id tiebreaker
    expect(capturedOrderArgs).toContainEqual(['created_at', { ascending: false }])
    expect(capturedOrderArgs.some(([col]) => col === 'id')).toBe(true)
  })

  it('filters by an explicit status', async () => {
    adminUser()
    const { GET } = await import('../route')
    const res = await GET(makeListReq('?status=approved'))
    expect(res.status).toBe(200)
    expect(capturedEqArgs).toContainEqual(['status', 'approved'])
  })

  it('returns 400 for an invalid status value', async () => {
    adminUser()
    const { GET } = await import('../route')
    const res = await GET(makeListReq('?status=evil'))
    expect(res.status).toBe(400)
  })

  it('paginates with default limit 50 (page=2 → range 100-149)', async () => {
    adminUser()
    const { GET } = await import('../route')
    const res = await GET(makeListReq('?page=2'))
    expect(res.status).toBe(200)
    expect(mockRange).toHaveBeenCalledWith(100, 149)
  })

  it('returns 500 when DB fails', async () => {
    adminUser()
    mockRange.mockResolvedValueOnce({ data: null, count: null, error: { message: 'DB fail' } })
    const { GET } = await import('../route')
    const res = await GET(makeListReq())
    expect(res.status).toBe(500)
  })
})

// ── POST /api/admin/date-contributions ───────────────────────────────────────

describe('POST /api/admin/date-contributions', () => {
  beforeEach(() => resetAll())

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { POST } = await import('../route')
    const res = await POST(makePostReq({ id: 'c1', action: 'approve' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when non-admin', async () => {
    nonAdmin()
    const { POST } = await import('../route')
    const res = await POST(makePostReq({ id: 'c1', action: 'approve' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 for an invalid action', async () => {
    adminUser()
    const { POST } = await import('../route')
    const res = await POST(makePostReq({ id: 'c1', action: 'nuke' }))
    expect(res.status).toBe(400)
    expect(mockContribSingle).not.toHaveBeenCalled()
  })

  it('returns 400 when id is missing', async () => {
    adminUser()
    const { POST } = await import('../route')
    const res = await POST(makePostReq({ action: 'approve' }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when the contribution id is unknown', async () => {
    adminUser()
    mockContribSingle.mockResolvedValueOnce({ data: null, error: null })
    const { POST } = await import('../route')
    const res = await POST(makePostReq({ id: 'missing', action: 'approve' }))
    expect(res.status).toBe(404)
  })

  it('approve writes the mapped listing column then marks approved', async () => {
    adminUser()
    mockContribSingle.mockResolvedValueOnce({
      data: { id: 'c1', listing_slug: 'upcat', field: 'exam_date', suggested_date: '2027-08-01', status: 'pending' },
      error: null,
    })
    mockListingsUpdate.mockResolvedValueOnce({ data: [{ id: 'listing-1' }], error: null })
    mockContribUpdate.mockResolvedValueOnce({ error: null })
    const { POST } = await import('../route')
    const res = await POST(makePostReq({ id: 'c1', action: 'approve' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    // listings.update targeted the exam_date column by slug
    expect(lastListingsUpdateArg).toEqual({ exam_date: '2027-08-01' })
    expect(lastListingsUpdateEq).toEqual(['slug', 'upcat'])
    // contribution marked approved with a reviewed_at timestamp
    expect(lastContribUpdateArg).toHaveProperty('status', 'approved')
    expect(typeof lastContribUpdateArg!.reviewed_at).toBe('string')
    expect(lastContribUpdateEq).toEqual(['id', 'c1'])
  })

  it('approve returns 404 when the slug matched no listing', async () => {
    adminUser()
    mockContribSingle.mockResolvedValueOnce({
      data: { id: 'c1', listing_slug: 'ghost', field: 'deadline', suggested_date: '2027-01-01', status: 'pending' },
      error: null,
    })
    mockListingsUpdate.mockResolvedValueOnce({ data: [], error: null })
    const { POST } = await import('../route')
    const res = await POST(makePostReq({ id: 'c1', action: 'approve' }))
    expect(res.status).toBe(404)
    // the contribution must NOT be marked approved when the listing write no-ops
    expect(mockContribUpdate).not.toHaveBeenCalled()
  })

  it('approve rejects a contribution whose field is not on the allow-list (no write)', async () => {
    adminUser()
    mockContribSingle.mockResolvedValueOnce({
      data: { id: 'c1', listing_slug: 'upcat', field: 'status', suggested_date: '2027-08-01', status: 'pending' },
      error: null,
    })
    const { POST } = await import('../route')
    const res = await POST(makePostReq({ id: 'c1', action: 'approve' }))
    expect(res.status).toBe(400)
    expect(mockListingsUpdate).not.toHaveBeenCalled()
    expect(mockContribUpdate).not.toHaveBeenCalled()
  })

  it('approve returns 500 when the listings update errors', async () => {
    adminUser()
    mockContribSingle.mockResolvedValueOnce({
      data: { id: 'c1', listing_slug: 'upcat', field: 'exam_date', suggested_date: '2027-08-01', status: 'pending' },
      error: null,
    })
    mockListingsUpdate.mockResolvedValueOnce({ data: null, error: { message: 'DB fail' } })
    const { POST } = await import('../route')
    const res = await POST(makePostReq({ id: 'c1', action: 'approve' }))
    expect(res.status).toBe(500)
    expect(mockContribUpdate).not.toHaveBeenCalled()
  })

  it('reject marks the contribution rejected without touching listings', async () => {
    adminUser()
    mockContribSingle.mockResolvedValueOnce({
      data: { id: 'c1', listing_slug: 'upcat', field: 'exam_date', suggested_date: '2027-08-01', status: 'pending' },
      error: null,
    })
    mockContribUpdate.mockResolvedValueOnce({ error: null })
    const { POST } = await import('../route')
    const res = await POST(makePostReq({ id: 'c1', action: 'reject' }))
    expect(res.status).toBe(200)
    expect(lastContribUpdateArg).toHaveProperty('status', 'rejected')
    expect(typeof lastContribUpdateArg!.reviewed_at).toBe('string')
    expect(lastContribUpdateEq).toEqual(['id', 'c1'])
    expect(mockListingsUpdate).not.toHaveBeenCalled()
  })

  it('returns 500 when marking rejected fails', async () => {
    adminUser()
    mockContribSingle.mockResolvedValueOnce({
      data: { id: 'c1', listing_slug: 'upcat', field: 'exam_date', suggested_date: '2027-08-01', status: 'pending' },
      error: null,
    })
    mockContribUpdate.mockResolvedValueOnce({ error: { message: 'DB fail' } })
    const { POST } = await import('../route')
    const res = await POST(makePostReq({ id: 'c1', action: 'reject' }))
    expect(res.status).toBe(500)
  })
})
