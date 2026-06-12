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
const mockTopicSingle = vi.fn()

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
