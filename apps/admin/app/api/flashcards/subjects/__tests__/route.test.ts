import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fake-anon-key')

// ── Auth client mock ──────────────────────────────────────────────────────────
const mockGetUser = vi.fn()
vi.mock('@/lib/supabase', () => ({
  createAuthClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

// ── Chainable Supabase mock ───────────────────────────────────────────────────
const mockProfileSingle = vi.fn()
const mockSingle = vi.fn()
const mockSelectSingle = vi.fn(() => ({ single: mockSingle }))
const mockInsert = vi.fn(() => ({ select: mockSelectSingle }))

function makeChain(table: string): any {
  if (table === 'profiles') {
    return {
      select(_c: string) {
        return {
          eq(_col: string, _val: unknown) {
            return { single: mockProfileSingle }
          },
        }
      },
    }
  }
  // flashcard_subjects
  return { insert: mockInsert }
}

const mockFrom = vi.fn((table: string) => makeChain(table))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))

// ── Auth helpers ──────────────────────────────────────────────────────────────
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
  mockSingle.mockClear()
  mockInsert.mockClear()
  mockSelectSingle.mockClear()
  mockFrom.mockClear()
}

function makeReq(body: object) {
  return new NextRequest('http://localhost/api/flashcards/subjects', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/flashcards/subjects', () => {
  beforeEach(() => resetAll())

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { POST } = await import('../route')
    const res = await POST(makeReq({ name: 'Biology' }))
    expect(res.status).toBe(401)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('returns 403 when signed-in non-admin', async () => {
    nonAdmin()
    const { POST } = await import('../route')
    const res = await POST(makeReq({ name: 'Biology' }))
    expect(res.status).toBe(403)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('returns 400 when name is missing', async () => {
    adminUser()
    const { POST } = await import('../route')
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/name/i)
  })

  it('returns 400 when name is blank whitespace', async () => {
    adminUser()
    const { POST } = await import('../route')
    const res = await POST(makeReq({ name: '   ' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when listing_slugs is not an array', async () => {
    adminUser()
    const { POST } = await import('../route')
    const res = await POST(makeReq({ name: 'Biology', listing_slugs: 'nope' }))
    expect(res.status).toBe(400)
  })

  it('creates the subject and returns 201 with the row', async () => {
    adminUser()
    mockSingle.mockResolvedValueOnce({
      data: { id: 'sub-new', name: 'Biology', listing_slugs: ['upcat'] },
      error: null,
    })
    const { POST } = await import('../route')
    const res = await POST(makeReq({ name: 'Biology', listing_slugs: ['upcat'] }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toEqual({ id: 'sub-new', name: 'Biology', listing_slugs: ['upcat'] })
    expect(mockInsert).toHaveBeenCalledWith({ name: 'Biology', listing_slugs: ['upcat'] })
  })

  it('defaults listing_slugs to [] when omitted', async () => {
    adminUser()
    mockSingle.mockResolvedValueOnce({
      data: { id: 'sub-new', name: 'Biology', listing_slugs: [] },
      error: null,
    })
    const { POST } = await import('../route')
    await POST(makeReq({ name: 'Biology' }))
    expect(mockInsert).toHaveBeenCalledWith({ name: 'Biology', listing_slugs: [] })
  })

  it('returns 409 with a friendly message on duplicate name (23505)', async () => {
    adminUser()
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "flashcard_subjects_name_key"' },
    })
    const { POST } = await import('../route')
    const res = await POST(makeReq({ name: 'Math' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already exists/i)
  })

  it('returns 500 when Supabase insert fails for another reason', async () => {
    adminUser()
    mockSingle.mockResolvedValueOnce({ data: null, error: { code: '42P01', message: 'DB error' } })
    const { POST } = await import('../route')
    const res = await POST(makeReq({ name: 'Math' }))
    expect(res.status).toBe(500)
  })
})
