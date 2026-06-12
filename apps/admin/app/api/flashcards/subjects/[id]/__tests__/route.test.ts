import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))

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
const mockPatchSingle = vi.fn()
const mockDeleteSingle = vi.fn()
const mockSubjectGetSingle = vi.fn()

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
  // flashcard_subjects table
  return {
    select(_cols: string) {
      return {
        eq(_col: string, _val: unknown) {
          return { single: mockSubjectGetSingle }
        },
      }
    },
    update(_data: object) {
      return {
        eq(_col: string, _val: string) {
          return {
            select(_cols: string) {
              return { single: mockPatchSingle }
            },
          }
        },
      }
    },
    delete() {
      return {
        eq(_col: string, _val: string) {
          return {
            select(_cols: string) {
              return { single: mockDeleteSingle }
            },
          }
        },
      }
    },
  }
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
  mockPatchSingle.mockClear()
  mockDeleteSingle.mockClear()
  mockSubjectGetSingle.mockClear()
  mockFrom.mockClear()
}

function patchReq(id: string, body: object) {
  return new NextRequest(`http://localhost/api/flashcards/subjects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function deleteReq(id: string) {
  return new NextRequest(`http://localhost/api/flashcards/subjects/${id}`, {
    method: 'DELETE',
  })
}

function getReq(id: string) {
  return new NextRequest(`http://localhost/api/flashcards/subjects/${id}`, {
    method: 'GET',
  })
}

// ── GET /api/flashcards/subjects/[id] ─────────────────────────────────────────

describe('GET /api/flashcards/subjects/[id]', () => {
  beforeEach(() => resetAll())

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { GET } = await import('../route')
    const res = await GET(getReq('sub-1'), { params: Promise.resolve({ id: 'sub-1' }) })
    expect(res.status).toBe(401)
    expect(mockSubjectGetSingle).not.toHaveBeenCalled()
  })

  it('returns 403 when signed-in non-admin', async () => {
    nonAdmin()
    const { GET } = await import('../route')
    const res = await GET(getReq('sub-1'), { params: Promise.resolve({ id: 'sub-1' }) })
    expect(res.status).toBe(403)
    expect(mockSubjectGetSingle).not.toHaveBeenCalled()
  })

  it('allows admin to fetch subject and returns 200', async () => {
    adminUser()
    mockSubjectGetSingle.mockResolvedValueOnce({
      data: { id: 'sub-1', name: 'Math', listing_slugs: ['upcat'] },
      error: null,
    })
    const { GET } = await import('../route')
    const res = await GET(getReq('sub-1'), { params: Promise.resolve({ id: 'sub-1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('Math')
  })

  it('returns 404 when subject not found', async () => {
    adminUser()
    mockSubjectGetSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } })
    const { GET } = await import('../route')
    const res = await GET(getReq('missing'), { params: Promise.resolve({ id: 'missing' }) })
    expect(res.status).toBe(404)
  })
})

// ── PATCH /api/flashcards/subjects/[id] ───────────────────────────────────────

describe('PATCH /api/flashcards/subjects/[id]', () => {
  beforeEach(() => resetAll())

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('sub-1', { name: 'Math', listing_slugs: [] }), {
      params: Promise.resolve({ id: 'sub-1' }),
    })
    expect(res.status).toBe(401)
    expect(mockPatchSingle).not.toHaveBeenCalled()
  })

  it('returns 403 when signed-in non-admin', async () => {
    nonAdmin()
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('sub-1', { name: 'Math', listing_slugs: [] }), {
      params: Promise.resolve({ id: 'sub-1' }),
    })
    expect(res.status).toBe(403)
    expect(mockPatchSingle).not.toHaveBeenCalled()
  })

  it('returns 400 when name is missing', async () => {
    adminUser()
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('sub-1', { listing_slugs: [] }), {
      params: Promise.resolve({ id: 'sub-1' }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/name/i)
  })

  it('returns 400 when name is blank whitespace', async () => {
    adminUser()
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('sub-1', { name: '   ', listing_slugs: [] }), {
      params: Promise.resolve({ id: 'sub-1' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when listing_slugs is not an array', async () => {
    adminUser()
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('sub-1', { name: 'Math', listing_slugs: 'not-array' }), {
      params: Promise.resolve({ id: 'sub-1' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when listing_slugs contains non-string elements', async () => {
    adminUser()
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('sub-1', { name: 'Math', listing_slugs: [1, 2] }), {
      params: Promise.resolve({ id: 'sub-1' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 when subject does not exist', async () => {
    adminUser()
    mockPatchSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'Not found' } })
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('nonexistent', { name: 'Math', listing_slugs: [] }), {
      params: Promise.resolve({ id: 'nonexistent' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 200 with updated subject on success', async () => {
    adminUser()
    mockPatchSingle.mockResolvedValue({
      data: { id: 'sub-1', name: 'Mathematics', listing_slugs: ['dost-sei'] },
      error: null,
    })
    const { PATCH } = await import('../route')
    const res = await PATCH(
      patchReq('sub-1', { name: 'Mathematics', listing_slugs: ['dost-sei'] }),
      { params: Promise.resolve({ id: 'sub-1' }) }
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('Mathematics')
    expect(body.listing_slugs).toEqual(['dost-sei'])
  })
})

// ── DELETE /api/flashcards/subjects/[id] ──────────────────────────────────────

describe('DELETE /api/flashcards/subjects/[id]', () => {
  beforeEach(() => resetAll())

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { DELETE } = await import('../route')
    const res = await DELETE(deleteReq('sub-1'), {
      params: Promise.resolve({ id: 'sub-1' }),
    })
    expect(res.status).toBe(401)
    expect(mockDeleteSingle).not.toHaveBeenCalled()
  })

  it('returns 403 when signed-in non-admin', async () => {
    nonAdmin()
    const { DELETE } = await import('../route')
    const res = await DELETE(deleteReq('sub-1'), {
      params: Promise.resolve({ id: 'sub-1' }),
    })
    expect(res.status).toBe(403)
    expect(mockDeleteSingle).not.toHaveBeenCalled()
  })

  it('returns 404 when subject does not exist', async () => {
    adminUser()
    mockDeleteSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'Not found' } })
    const { DELETE } = await import('../route')
    const res = await DELETE(deleteReq('nonexistent'), {
      params: Promise.resolve({ id: 'nonexistent' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 204 on successful delete', async () => {
    adminUser()
    mockDeleteSingle.mockResolvedValue({ data: { id: 'sub-1' }, error: null })
    const { DELETE } = await import('../route')
    const res = await DELETE(deleteReq('sub-1'), {
      params: Promise.resolve({ id: 'sub-1' }),
    })
    expect(res.status).toBe(204)
  })
})
