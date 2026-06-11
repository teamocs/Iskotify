import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fake-anon-key')

// ── Auth client mock (mirrors data/__tests__/route.test.ts pattern) ──────────
const mockGetUser = vi.fn()
vi.mock('@/lib/supabase', () => ({
  createAuthClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

// ── Chainable Supabase mock ──────────────────────────────────────────────────
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockEq = vi.fn()
const mockDelete = vi.fn()
const mockSingle = vi.fn()
const mockSelect = vi.fn()
const mockIn = vi.fn()
const mockOrder = vi.fn()

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select(_c: string) {
            return { eq(_col: string, _val: unknown) { return { single: mockSingle } } }
          },
        }
      }
      // listings table
      return {
        insert: mockInsert,
        update: (data: unknown) => {
          mockUpdate(data)
          return { eq: mockEq }
        },
        delete: () => ({ eq: mockEq }),
        select: (_cols: string) => ({
          in: mockIn,
        }),
      }
    },
  })),
}))

// Mock next/cache so unstable_cache and revalidateTag work outside Next.js request context
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: any[]) => any) => fn,
  revalidateTag: vi.fn(),
}))

// Mock next/headers for auth check
vi.mock('next/headers', () => ({
  cookies: () => ({ getAll: () => [] }),
}))

// ── Auth helpers ─────────────────────────────────────────────────────────────

function adminUser() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'admin-1' } } })
  mockSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
}

function noUser() {
  mockGetUser.mockResolvedValueOnce({ data: { user: null } })
}

function nonAdmin() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u2' } } })
  mockSingle.mockResolvedValueOnce({ data: { role: 'viewer' }, error: null })
}

// ── GET /api/admin/listings ──────────────────────────────────────────────────

describe('GET /api/admin/listings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIn.mockReturnValue({ order: mockOrder })
    mockOrder.mockResolvedValue({ data: [], error: null })
  })

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { GET } = await import('../route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 403 when non-admin', async () => {
    nonAdmin()
    const { GET } = await import('../route')
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('returns listings for admin', async () => {
    adminUser()
    mockOrder.mockResolvedValue({ data: [{ slug: 'test', title: 'Test', status: 'active' }], error: null })
    const { GET } = await import('../route')
    const res = await GET()
    expect(res.status).toBe(200)
  })
})

// ── POST /api/admin/listings ─────────────────────────────────────────────────

describe('POST /api/admin/listings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { POST } = await import('../route')
    const req = new NextRequest('http://localhost/api/admin/listings', {
      method: 'POST',
      body: JSON.stringify({
        type: 'scholarship', title: 'T', slug: 's', provider: 'P', status: 'active', region: 'NCR',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 403 when non-admin', async () => {
    nonAdmin()
    const { POST } = await import('../route')
    const req = new NextRequest('http://localhost/api/admin/listings', {
      method: 'POST',
      body: JSON.stringify({
        type: 'scholarship', title: 'T', slug: 's', provider: 'P', status: 'active', region: 'NCR',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('creates a listing and returns 201', async () => {
    adminUser()
    mockInsert.mockResolvedValue({ error: null })
    const { POST } = await import('../route')
    const req = new NextRequest('http://localhost/api/admin/listings', {
      method: 'POST',
      body: JSON.stringify({
        type: 'scholarship',
        title: 'Test Scholarship',
        slug: 'test-scholarship',
        provider: 'Test Org',
        status: 'active',
        region: 'Nationwide',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(mockInsert).toHaveBeenCalledOnce()
  })

  it('passes results_date and scholarship_meta to insert', async () => {
    adminUser()
    mockInsert.mockResolvedValue({ error: null })
    const { POST } = await import('../route')
    const req = new NextRequest('http://localhost/api/admin/listings', {
      method: 'POST',
      body: JSON.stringify({
        type: 'scholarship',
        title: 'Meta Scholarship',
        slug: 'meta-scholarship',
        provider: 'Meta Org',
        status: 'active',
        region: 'Nationwide',
        results_date: '2026-12-01',
        scholarship_meta: { huc_excluded: true, target_year_levels: ['Grade 12'], other_benefits: ['Free uniform'] },
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const insertArg = mockInsert.mock.calls[0]![0]
    expect(insertArg.results_date).toBe('2026-12-01')
    expect(insertArg.scholarship_meta).toEqual({
      huc_excluded: true,
      target_year_levels: ['Grade 12'],
      other_benefits: ['Free uniform'],
    })
  })

  it('returns 400 when required fields are missing', async () => {
    adminUser()
    const { POST } = await import('../route')
    const req = new NextRequest('http://localhost/api/admin/listings', {
      method: 'POST',
      body: JSON.stringify({ title: 'Missing type and slug' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 500 when Supabase insert fails', async () => {
    adminUser()
    mockInsert.mockResolvedValue({ error: { message: 'DB error' } })
    const { POST } = await import('../route')
    const req = new NextRequest('http://localhost/api/admin/listings', {
      method: 'POST',
      body: JSON.stringify({
        type: 'scholarship',
        title: 'Test',
        slug: 'test',
        provider: 'Org',
        status: 'active',
        region: 'NCR',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})

// ── PATCH /api/admin/listings/[id] ──────────────────────────────────────────

describe('PATCH /api/admin/listings/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { PATCH } = await import('../[id]/route')
    const req = new NextRequest('http://localhost/api/admin/listings/abc', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'x' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(401)
  })

  it('returns 403 when non-admin', async () => {
    nonAdmin()
    const { PATCH } = await import('../[id]/route')
    const req = new NextRequest('http://localhost/api/admin/listings/abc', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'x' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(403)
  })

  it('updates a listing and returns 200', async () => {
    adminUser()
    mockEq.mockResolvedValue({ error: null })
    const { PATCH } = await import('../[id]/route')
    const req = new NextRequest('http://localhost/api/admin/listings/abc', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated Title' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(200)
    expect(mockEq).toHaveBeenCalledWith('id', 'abc')
  })

  it('passes results_date and scholarship_meta through PATCH', async () => {
    adminUser()
    mockEq.mockResolvedValue({ error: null })
    const { PATCH } = await import('../[id]/route')
    const req = new NextRequest('http://localhost/api/admin/listings/abc', {
      method: 'PATCH',
      body: JSON.stringify({
        results_date: '2026-12-15',
        scholarship_meta: { huc_excluded: false, target_year_levels: ['Grade 12'], other_benefits: [] },
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledOnce()
    const updateArg = mockUpdate.mock.calls[0]![0]
    expect(updateArg.results_date).toBe('2026-12-15')
    expect(updateArg.scholarship_meta).toEqual({
      huc_excluded: false,
      target_year_levels: ['Grade 12'],
      other_benefits: [],
    })
  })

  it('strips unknown keys from PATCH body (mass-assignment protection)', async () => {
    adminUser()
    mockEq.mockResolvedValue({ error: null })
    const { PATCH } = await import('../[id]/route')
    const req = new NextRequest('http://localhost/api/admin/listings/abc', {
      method: 'PATCH',
      body: JSON.stringify({
        title: 'Good Title',
        injected_col: 'DROP TABLE listings--',
        role: 'admin',
        admin_override: true,
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(200)
    const updateArg = mockUpdate.mock.calls[0]![0]
    expect(updateArg).toHaveProperty('title', 'Good Title')
    expect(updateArg).not.toHaveProperty('injected_col')
    expect(updateArg).not.toHaveProperty('role')
    expect(updateArg).not.toHaveProperty('admin_override')
  })

  it('returns 500 when update fails', async () => {
    adminUser()
    mockEq.mockResolvedValue({ error: { message: 'DB error' } })
    const { PATCH } = await import('../[id]/route')
    const req = new NextRequest('http://localhost/api/admin/listings/abc', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'x' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(500)
  })
})

// ── DELETE /api/admin/listings/[id] ─────────────────────────────────────────

describe('DELETE /api/admin/listings/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { DELETE } = await import('../[id]/route')
    const req = new NextRequest('http://localhost/api/admin/listings/abc', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(401)
  })

  it('returns 403 when non-admin', async () => {
    nonAdmin()
    const { DELETE } = await import('../[id]/route')
    const req = new NextRequest('http://localhost/api/admin/listings/abc', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(403)
  })

  it('deletes a listing and returns 200', async () => {
    adminUser()
    mockEq.mockResolvedValue({ error: null })
    const { DELETE } = await import('../[id]/route')
    const req = new NextRequest('http://localhost/api/admin/listings/abc', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(200)
    expect(mockEq).toHaveBeenCalledWith('id', 'abc')
  })

  it('returns 500 when delete fails', async () => {
    adminUser()
    mockEq.mockResolvedValue({ error: { message: 'DB error' } })
    const { DELETE } = await import('../[id]/route')
    const req = new NextRequest('http://localhost/api/admin/listings/abc', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(500)
  })
})
