import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fake-anon-key')

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

const mockGetUser = vi.fn()
vi.mock('@/lib/supabase', () => ({
  createAuthClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

const mockGenerate = vi.fn()
vi.mock('@/lib/gemini/generateDistractors', () => ({
  generateDistractorsForCard: mockGenerate,
}))

const mockProfileSingle = vi.fn()
const mockTopicSingle = vi.fn()
const mockCardsIsAiOptionsNull = vi.fn()
const mockUpdate = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }))

function makeChain(table: string): any {
  if (table === 'profiles') {
    return { select: () => ({ eq: () => ({ single: mockProfileSingle }) }) }
  }
  if (table === 'flashcard_topics') {
    return { select: () => ({ eq: () => ({ single: mockTopicSingle }) }) }
  }
  // flashcards
  return {
    select: () => ({ eq: () => ({ or: () => ({ is: mockCardsIsAiOptionsNull }) }) }),
    update: mockUpdate,
  }
}
const mockFrom = vi.fn((table: string) => makeChain(table))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))

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

beforeEach(() => {
  vi.resetModules()
  mockGetUser.mockReset()
  mockProfileSingle.mockReset()
  mockTopicSingle.mockReset()
  mockCardsIsAiOptionsNull.mockReset()
  mockGenerate.mockReset()
  mockUpdate.mockClear()
  mockFrom.mockClear()
})

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/flashcards/enhance-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function importRoute() {
  return (await import('../route')).POST
}

describe('POST /api/flashcards/enhance-batch', () => {
  it('returns 401 when unauthenticated', async () => {
    noUser()
    const POST = await importRoute()
    const res = await POST(makeReq({ topic_id: 't1' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when signed-in non-admin', async () => {
    nonAdmin()
    const POST = await importRoute()
    const res = await POST(makeReq({ topic_id: 't1' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when topic_id is missing', async () => {
    adminUser()
    const POST = await importRoute()
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
  })

  it('returns 404 when the topic does not exist', async () => {
    adminUser()
    mockTopicSingle.mockResolvedValueOnce({ data: null, error: null })
    const POST = await importRoute()
    const res = await POST(makeReq({ topic_id: 'missing' }))
    expect(res.status).toBe(404)
  })

  it('persists option_explanations and strategy_tip returned by the Gemini pipeline (Finding 2)', async () => {
    adminUser()
    mockTopicSingle.mockResolvedValueOnce({
      data: { id: 't1', name: 'Algebra', flashcard_subjects: { name: 'Math' } },
      error: null,
    })
    mockCardsIsAiOptionsNull.mockResolvedValueOnce({
      data: [{ id: 'c1', question: 'Q', answer: 'Right' }],
      error: null,
    })
    mockGenerate.mockResolvedValueOnce({
      options: ['W1', 'Right', 'W2', 'W3'],
      correctIndex: 1,
      explanation: 'because',
      optionExplanations: ['wrong W1', null, 'wrong W2', 'wrong W3'],
      strategyTip: 'Check the units.',
    })
    const POST = await importRoute()
    const res = await POST(makeReq({ topic_id: 't1' }))
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      option_explanations: ['wrong W1', null, 'wrong W2', 'wrong W3'],
      strategy_tip: 'Check the units.',
    }))
  })

  it('returns enhanced=0 when Gemini returns null for every card', async () => {
    adminUser()
    mockTopicSingle.mockResolvedValueOnce({
      data: { id: 't1', name: 'Algebra', flashcard_subjects: { name: 'Math' } },
      error: null,
    })
    mockCardsIsAiOptionsNull.mockResolvedValueOnce({
      data: [{ id: 'c1', question: 'Q', answer: 'Right' }],
      error: null,
    })
    mockGenerate.mockResolvedValueOnce(null)
    const POST = await importRoute()
    const res = await POST(makeReq({ topic_id: 't1' }))
    expect(res.status).toBe(200)
    const body = await res.json() as { enhanced: number; failed: number }
    expect(body).toEqual(expect.objectContaining({ enhanced: 0, failed: 1 }))
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
