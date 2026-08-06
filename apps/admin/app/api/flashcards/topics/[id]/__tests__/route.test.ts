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
const mockTopicSingle = vi.fn()
const mockPatchSingle = vi.fn()
const mockDeleteSingle = vi.fn()

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
  // flashcard_topics table
  return {
    select(_c: string) {
      return {
        eq(_col: string, _val: unknown) {
          return { single: mockTopicSingle }
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
  mockTopicSingle.mockReset()
  mockPatchSingle.mockReset()
  mockDeleteSingle.mockReset()
  mockFrom.mockClear()
}

function makeIdContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeGetReq(id: string) {
  return new NextRequest(`http://localhost/api/flashcards/topics/${id}`, {
    method: 'GET',
  })
}

function makePatchReq(id: string, body: object) {
  return new NextRequest(`http://localhost/api/flashcards/topics/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeDeleteReq(id: string) {
  return new NextRequest(`http://localhost/api/flashcards/topics/${id}`, {
    method: 'DELETE',
  })
}

// ── GET /api/flashcards/topics/[id] ──────────────────────────────────────────

describe('GET /api/flashcards/topics/[id]', () => {
  beforeEach(() => resetAll())

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { GET } = await import('../route')
    const res = await GET(makeGetReq('topic-1'), makeIdContext('topic-1'))
    expect(res.status).toBe(401)
    expect(mockTopicSingle).not.toHaveBeenCalled()
  })

  it('returns 403 when signed-in non-admin', async () => {
    nonAdmin()
    const { GET } = await import('../route')
    const res = await GET(makeGetReq('topic-1'), makeIdContext('topic-1'))
    expect(res.status).toBe(403)
    expect(mockTopicSingle).not.toHaveBeenCalled()
  })

  it('allows admin to fetch topic and returns 200 with flattened subject', async () => {
    adminUser()
    mockTopicSingle.mockResolvedValueOnce({
      data: {
        id: 'topic-1',
        name: 'Algebra',
        status: 'published',
        subject_id: 'sub-1',
        flashcard_subjects: { id: 'sub-1', name: 'Math' },
      },
      error: null,
    })
    const { GET } = await import('../route')
    const res = await GET(makeGetReq('topic-1'), makeIdContext('topic-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe('topic-1')
    expect(body.name).toBe('Algebra')
    expect(body.subject_name).toBe('Math')
  })

  it('returns 404 when topic not found', async () => {
    adminUser()
    mockTopicSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } })
    const { GET } = await import('../route')
    const res = await GET(makeGetReq('missing'), makeIdContext('missing'))
    expect(res.status).toBe(404)
  })
})

// ── PATCH /api/flashcards/topics/[id] ────────────────────────────────────────

describe('PATCH /api/flashcards/topics/[id]', () => {
  beforeEach(() => resetAll())

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { PATCH } = await import('../route')
    const res = await PATCH(makePatchReq('topic-1', { name: 'Renamed' }), makeIdContext('topic-1'))
    expect(res.status).toBe(401)
    expect(mockPatchSingle).not.toHaveBeenCalled()
  })

  it('returns 403 when signed-in non-admin', async () => {
    nonAdmin()
    const { PATCH } = await import('../route')
    const res = await PATCH(makePatchReq('topic-1', { name: 'Renamed' }), makeIdContext('topic-1'))
    expect(res.status).toBe(403)
    expect(mockPatchSingle).not.toHaveBeenCalled()
  })

  it('returns 400 when name is missing', async () => {
    adminUser()
    const { PATCH } = await import('../route')
    const res = await PATCH(makePatchReq('topic-1', {}), makeIdContext('topic-1'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/name/i)
  })

  it('returns 400 when name is blank whitespace', async () => {
    adminUser()
    const { PATCH } = await import('../route')
    const res = await PATCH(makePatchReq('topic-1', { name: '   ' }), makeIdContext('topic-1'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when topic does not exist', async () => {
    adminUser()
    mockPatchSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116', message: 'Not found' } })
    const { PATCH } = await import('../route')
    const res = await PATCH(makePatchReq('missing', { name: 'Renamed' }), makeIdContext('missing'))
    expect(res.status).toBe(404)
  })

  it('renames the topic and returns 200 with the updated row', async () => {
    adminUser()
    mockPatchSingle.mockResolvedValueOnce({
      data: { id: 'topic-1', name: 'Algebra II', status: 'published', subject_id: 'sub-1' },
      error: null,
    })
    const { PATCH } = await import('../route')
    const res = await PATCH(makePatchReq('topic-1', { name: 'Algebra II' }), makeIdContext('topic-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('Algebra II')
  })
})

// ── DELETE /api/flashcards/topics/[id] ───────────────────────────────────────

describe('DELETE /api/flashcards/topics/[id]', () => {
  beforeEach(() => resetAll())

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { DELETE } = await import('../route')
    const res = await DELETE(makeDeleteReq('topic-1'), makeIdContext('topic-1'))
    expect(res.status).toBe(401)
    expect(mockDeleteSingle).not.toHaveBeenCalled()
  })

  it('returns 403 when signed-in non-admin', async () => {
    nonAdmin()
    const { DELETE } = await import('../route')
    const res = await DELETE(makeDeleteReq('topic-1'), makeIdContext('topic-1'))
    expect(res.status).toBe(403)
    expect(mockDeleteSingle).not.toHaveBeenCalled()
  })

  it('returns 404 when topic does not exist', async () => {
    adminUser()
    mockDeleteSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116', message: 'Not found' } })
    const { DELETE } = await import('../route')
    const res = await DELETE(makeDeleteReq('missing'), makeIdContext('missing'))
    expect(res.status).toBe(404)
  })

  it('returns 204 on successful delete', async () => {
    adminUser()
    mockDeleteSingle.mockResolvedValueOnce({ data: { id: 'topic-1', subject_id: 'sub-1' }, error: null })
    const { DELETE } = await import('../route')
    const res = await DELETE(makeDeleteReq('topic-1'), makeIdContext('topic-1'))
    expect(res.status).toBe(204)
  })

  it('returns 409 with a practice-history message on FK violation (23503)', async () => {
    adminUser()
    mockDeleteSingle.mockResolvedValueOnce({
      data: null,
      error: { code: '23503', message: 'update or delete on table "flashcard_topics" violates foreign key constraint' },
    })
    const { DELETE } = await import('../route')
    const res = await DELETE(makeDeleteReq('topic-1'), makeIdContext('topic-1'))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('Cannot delete: students have practice history on this topic.')
  })
})
