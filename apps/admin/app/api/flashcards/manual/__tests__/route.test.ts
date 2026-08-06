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
const mockSubjectSingle = vi.fn()
const mockTopicSingle = vi.fn()
const mockInsertCardSelect = vi.fn()
const mockCardsUpdate = vi.fn((_data: unknown) => ({
  eq(_col: string, _val: unknown) {
    return Promise.resolve({ error: null })
  },
}))

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
  if (table === 'flashcard_subjects') {
    return {
      upsert(_data: unknown, _opts?: unknown) {
        return { select: () => ({ single: mockSubjectSingle }) }
      },
    }
  }
  if (table === 'flashcard_topics') {
    return {
      insert(_data: unknown) {
        return { select: () => ({ single: mockTopicSingle }) }
      },
    }
  }
  // flashcards
  return {
    insert(_data: unknown) {
      return { select: mockInsertCardSelect }
    },
    update: mockCardsUpdate,
  }
}

const mockFrom = vi.fn((table: string) => makeChain(table))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))

// Stub distractor generation — fire-and-forget should not make real calls
const mockGenerateDistractors = vi.fn().mockResolvedValue(null)
vi.mock('@/lib/gemini/generateDistractors', () => ({
  generateDistractorsForCard: mockGenerateDistractors,
}))

// Flush the fire-and-forget backfillDistractorsFor() promise chain (POST
// returns before it settles) so tests can assert on its side effects.
async function flushMicrotasks() {
  await new Promise(resolve => setImmediate(resolve))
  await new Promise(resolve => setImmediate(resolve))
}

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
  mockSubjectSingle.mockReset()
  mockTopicSingle.mockReset()
  mockInsertCardSelect.mockReset()
  mockFrom.mockClear()
  mockCardsUpdate.mockClear()
  mockGenerateDistractors.mockReset()
  mockGenerateDistractors.mockResolvedValue(null)
}

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/flashcards/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = {
  subject_name: 'Science',
  topic_name: 'Physics',
  listing_slugs: ['dost-sei'],
  cards: [{ question: 'Q?', answer: 'A', explanation: '' }],
}

// ── POST /api/flashcards/manual ───────────────────────────────────────────────

describe('POST /api/flashcards/manual', () => {
  beforeEach(() => resetAll())

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { POST } = await import('../route')
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(401)
    expect(mockSubjectSingle).not.toHaveBeenCalled()
  })

  it('returns 403 when signed-in non-admin', async () => {
    nonAdmin()
    const { POST } = await import('../route')
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(403)
    expect(mockSubjectSingle).not.toHaveBeenCalled()
  })

  it('returns 400 when required fields are missing', async () => {
    adminUser()
    const { POST } = await import('../route')
    const res = await POST(makeReq({ subject_name: 'Science' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when listing_slugs is empty', async () => {
    adminUser()
    const { POST } = await import('../route')
    const res = await POST(makeReq({ ...validBody, listing_slugs: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when cards array is empty', async () => {
    adminUser()
    const { POST } = await import('../route')
    const res = await POST(makeReq({ ...validBody, cards: [] }))
    expect(res.status).toBe(400)
  })

  it('allows admin to create subject, topic, and cards; returns { ok, topic_id }', async () => {
    adminUser()
    mockSubjectSingle.mockResolvedValueOnce({ data: { id: 'subj-1' }, error: null })
    mockTopicSingle.mockResolvedValueOnce({ data: { id: 'topic-1' }, error: null })
    mockInsertCardSelect.mockResolvedValueOnce({ data: [], error: null })

    const { POST } = await import('../route')
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.topic_id).toBe('topic-1')
  })

  it('persists option_explanations and strategy_tip from the background distractor generation (Finding 2)', async () => {
    adminUser()
    mockSubjectSingle.mockResolvedValueOnce({ data: { id: 'subj-1' }, error: null })
    mockTopicSingle.mockResolvedValueOnce({ data: { id: 'topic-1' }, error: null })
    mockInsertCardSelect.mockResolvedValueOnce({
      data: [{ id: 'card-1', question: 'Q?', answer: 'A' }],
      error: null,
    })
    mockGenerateDistractors.mockResolvedValueOnce({
      options: ['A', 'W1', 'W2', 'W3'],
      correctIndex: 0,
      explanation: 'because',
      optionExplanations: [null, 'wrong W1', 'wrong W2', 'wrong W3'],
      strategyTip: 'Check the units.',
    })

    const { POST } = await import('../route')
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(200)

    await flushMicrotasks()

    expect(mockCardsUpdate).toHaveBeenCalledWith(expect.objectContaining({
      option_explanations: [null, 'wrong W1', 'wrong W2', 'wrong W3'],
      strategy_tip: 'Check the units.',
    }))
  })

  it('returns 500 when subject upsert fails', async () => {
    adminUser()
    mockSubjectSingle.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })
    const { POST } = await import('../route')
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(500)
  })
})
