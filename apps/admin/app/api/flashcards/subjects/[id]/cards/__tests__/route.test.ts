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
const mockRange = vi.fn()
const mockOrderChain: { order: ReturnType<typeof vi.fn>; range: ReturnType<typeof vi.fn> } = {
  order: vi.fn(),
  range: mockRange,
}
mockOrderChain.order.mockReturnValue(mockOrderChain)
const mockOrder = vi.fn(() => mockOrderChain)
const mockEq = vi.fn(() => ({ order: mockOrder }))
const mockSelect = vi.fn(() => ({ eq: mockEq }))

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
  // flashcards table
  return { select: mockSelect }
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
  mockRange.mockClear()
  mockOrder.mockClear()
  mockOrderChain.order.mockClear()
  mockOrderChain.order.mockReturnValue(mockOrderChain)
  mockEq.mockClear()
  mockSelect.mockClear()
  mockFrom.mockClear()
}

const PARAMS = Promise.resolve({ id: 'subject-1' })

function makeReq(topicId: string | null, page = '1') {
  const url = new URL('http://localhost/api/flashcards/subjects/subject-1/cards')
  if (topicId) url.searchParams.set('topic_id', topicId)
  if (page !== '1') url.searchParams.set('page', page)
  return new NextRequest(url)
}

// ── GET /api/flashcards/subjects/[id]/cards ───────────────────────────────────

describe('GET /api/flashcards/subjects/[id]/cards', () => {
  beforeEach(() => resetAll())

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { GET } = await import('../route')
    const res = await GET(makeReq('topic-1'), { params: PARAMS })
    expect(res.status).toBe(401)
    expect(mockRange).not.toHaveBeenCalled()
  })

  it('returns 403 when signed-in non-admin', async () => {
    nonAdmin()
    const { GET } = await import('../route')
    const res = await GET(makeReq('topic-1'), { params: PARAMS })
    expect(res.status).toBe(403)
    expect(mockRange).not.toHaveBeenCalled()
  })

  it('returns 400 when topic_id is missing', async () => {
    adminUser()
    const { GET } = await import('../route')
    const res = await GET(makeReq(null), { params: PARAMS })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/topic_id/i)
  })

  it('returns page 1 cards with hasMore true when more cards exist', async () => {
    adminUser()
    const cards = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`, question: `Q${i}`, answer: `A${i}`, explanation: '',
    }))
    mockRange.mockResolvedValueOnce({ data: cards, count: 15, error: null })
    const { GET } = await import('../route')
    const res = await GET(makeReq('topic-1'), { params: PARAMS })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cards).toHaveLength(10)
    expect(body.total).toBe(15)
    expect(body.page).toBe(1)
    expect(body.hasMore).toBe(true)
    expect(mockEq).toHaveBeenCalledWith('topic_id', 'topic-1')
    expect(mockOrder).toHaveBeenCalledWith('created_at')
    expect(mockRange).toHaveBeenCalledWith(0, 9)
  })

  it('returns page 2 with correct offset and hasMore false', async () => {
    adminUser()
    const cards = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`, question: `Q${i}`, answer: `A${i}`, explanation: '',
    }))
    mockRange.mockResolvedValueOnce({ data: cards, count: 15, error: null })
    const { GET } = await import('../route')
    const res = await GET(makeReq('topic-1', '2'), { params: PARAMS })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.page).toBe(2)
    expect(body.hasMore).toBe(false)
    expect(mockRange).toHaveBeenCalledWith(10, 19)
  })

  it('returns empty result for topic with no cards', async () => {
    adminUser()
    mockRange.mockResolvedValueOnce({ data: [], count: 0, error: null })
    const { GET } = await import('../route')
    const res = await GET(makeReq('topic-empty'), { params: PARAMS })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cards).toHaveLength(0)
    expect(body.total).toBe(0)
    expect(body.hasMore).toBe(false)
  })

  it('returns 500 when Supabase query fails', async () => {
    adminUser()
    mockRange.mockResolvedValueOnce({ data: null, count: null, error: { message: 'DB error' } })
    const { GET } = await import('../route')
    const res = await GET(makeReq('topic-1'), { params: PARAMS })
    expect(res.status).toBe(500)
  })
})
