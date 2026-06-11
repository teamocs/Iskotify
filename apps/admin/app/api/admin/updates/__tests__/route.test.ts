import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fake-anon-key')

// ---- Auth client mock ----
const mockGetUser = vi.fn()
vi.mock('@/lib/supabase', () => ({
  createAuthClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

// ---- Chainable Supabase mock ----
const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockEq = vi.fn()
const mockOrder = vi.fn()
const mockLimit = vi.fn()
const mockSingle = vi.fn()

function makeChain(table: string): any {
  if (table === 'profiles') {
    return {
      select(_c: string) {
        return { eq(_col: string, _val: any) { return { single: mockSingle } } }
      },
    }
  }
  // admissions_updates table
  return {
    select(_c: string) {
      return {
        order(_col: string, _opts?: any) {
          return { limit(_n: number) { return Promise.resolve(mockLimit()) } }
        },
      }
    },
    insert(row: any) {
      return Promise.resolve(mockInsert(row))
    },
    update(data: any) {
      return { eq(col: string, val: any) { return Promise.resolve(mockUpdate(data, col, val)) } }
    },
    delete() {
      return { eq(col: string, val: any) { return Promise.resolve(mockDelete(col, val)) } }
    },
  }
}

const mockFrom = vi.fn((table: string) => makeChain(table))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))

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

describe('GET /api/admin/updates', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetUser.mockReset()
    mockSingle.mockReset()
    mockFrom.mockClear()
    mockLimit.mockReset()
    mockInsert.mockReset()
    mockUpdate.mockReset()
    mockDelete.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { GET } = await import('../route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 403 when non-admin user', async () => {
    nonAdmin()
    const { GET } = await import('../route')
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('returns list of updates for admin user', async () => {
    adminUser()
    mockLimit.mockResolvedValueOnce({ data: [{ id: 'u1', title: 'Test', severity: 'urgent' }], error: null })
    const { GET } = await import('../route')
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json)).toBe(true)
    expect(json[0].id).toBe('u1')
  })

  it('returns 500 when DB fails', async () => {
    adminUser()
    mockLimit.mockResolvedValueOnce({ data: null, error: { message: 'DB fail' } })
    const { GET } = await import('../route')
    const res = await GET()
    expect(res.status).toBe(500)
  })
})

describe('POST /api/admin/updates', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetUser.mockReset()
    mockSingle.mockReset()
    mockFrom.mockClear()
    mockLimit.mockReset()
    mockInsert.mockReset()
    mockUpdate.mockReset()
    mockDelete.mockReset()
  })

  const validBody = {
    title: 'ACET Application Open',
    body: 'Application window is now open for 2027.',
    report_date: '2026-06-01',
    severity: 'important',
    school_name: 'Ateneo de Manila',
    verified: true,
  }

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { POST } = await import('../route')
    const req = new NextRequest('http://localhost/api/admin/updates', {
      method: 'POST',
      body: JSON.stringify(validBody),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 403 when non-admin', async () => {
    nonAdmin()
    const { POST } = await import('../route')
    const req = new NextRequest('http://localhost/api/admin/updates', {
      method: 'POST',
      body: JSON.stringify(validBody),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('returns 400 when required fields missing', async () => {
    adminUser()
    const { POST } = await import('../route')
    const req = new NextRequest('http://localhost/api/admin/updates', {
      method: 'POST',
      body: JSON.stringify({ title: 'Missing severity and body' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('creates update and returns 201 with id', async () => {
    adminUser()
    mockInsert.mockResolvedValueOnce({ error: null })
    const { POST } = await import('../route')
    const req = new NextRequest('http://localhost/api/admin/updates', {
      method: 'POST',
      body: JSON.stringify(validBody),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(typeof json.id).toBe('string')
    expect(mockInsert).toHaveBeenCalledOnce()
  })

  it('returns 500 when DB insert fails', async () => {
    adminUser()
    mockInsert.mockResolvedValueOnce({ error: { message: 'DB fail' } })
    const { POST } = await import('../route')
    const req = new NextRequest('http://localhost/api/admin/updates', {
      method: 'POST',
      body: JSON.stringify(validBody),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})

describe('PATCH /api/admin/updates', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetUser.mockReset()
    mockSingle.mockReset()
    mockFrom.mockClear()
    mockLimit.mockReset()
    mockInsert.mockReset()
    mockUpdate.mockReset()
    mockDelete.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { PATCH } = await import('../route')
    const req = new NextRequest('http://localhost/api/admin/updates', {
      method: 'PATCH',
      body: JSON.stringify({ id: 'u1', title: 'Updated' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when id is missing', async () => {
    adminUser()
    const { PATCH } = await import('../route')
    const req = new NextRequest('http://localhost/api/admin/updates', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'No id' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })

  it('updates and returns 200', async () => {
    adminUser()
    mockUpdate.mockResolvedValueOnce({ error: null })
    const { PATCH } = await import('../route')
    const req = new NextRequest('http://localhost/api/admin/updates', {
      method: 'PATCH',
      body: JSON.stringify({ id: 'u1', title: 'Updated title', verified: true }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledOnce()
    const call = mockUpdate.mock.calls[0]!
    const updateData = call[0]
    const col = call[1]
    const val = call[2]
    expect(col).toBe('id')
    expect(val).toBe('u1')
    expect(updateData.title).toBe('Updated title')
    expect(updateData.verified).toBe(true)
  })

  it('returns 500 when DB update fails', async () => {
    adminUser()
    mockUpdate.mockResolvedValueOnce({ error: { message: 'DB fail' } })
    const { PATCH } = await import('../route')
    const req = new NextRequest('http://localhost/api/admin/updates', {
      method: 'PATCH',
      body: JSON.stringify({ id: 'u1', severity: 'urgent' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req)
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/admin/updates', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetUser.mockReset()
    mockSingle.mockReset()
    mockFrom.mockClear()
    mockLimit.mockReset()
    mockInsert.mockReset()
    mockUpdate.mockReset()
    mockDelete.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { DELETE } = await import('../route')
    const req = new NextRequest('http://localhost/api/admin/updates?id=u1', { method: 'DELETE' })
    const res = await DELETE(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when id param is missing', async () => {
    adminUser()
    const { DELETE } = await import('../route')
    const req = new NextRequest('http://localhost/api/admin/updates', { method: 'DELETE' })
    const res = await DELETE(req)
    expect(res.status).toBe(400)
  })

  it('deletes and returns 200', async () => {
    adminUser()
    mockDelete.mockResolvedValueOnce({ error: null })
    const { DELETE } = await import('../route')
    const req = new NextRequest('http://localhost/api/admin/updates?id=u1', { method: 'DELETE' })
    const res = await DELETE(req)
    expect(res.status).toBe(200)
    expect(mockDelete).toHaveBeenCalledWith('id', 'u1')
  })

  it('returns 500 when DB delete fails', async () => {
    adminUser()
    mockDelete.mockResolvedValueOnce({ error: { message: 'DB fail' } })
    const { DELETE } = await import('../route')
    const req = new NextRequest('http://localhost/api/admin/updates?id=u1', { method: 'DELETE' })
    const res = await DELETE(req)
    expect(res.status).toBe(500)
  })
})
