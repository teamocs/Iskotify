import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')

// Flexible select chain supporting both:
//   dedup guard:  .select().eq().eq().limit()   (awaited — returns dedupResult)
//   sibling slug: .select().eq().limit().single()
const mockSiblingSingle = vi.fn()
const dedupResult: { value: { data: any[]; error: null } } = { value: { data: [], error: null } }
function makeSelectChain(): any {
  const chain: any = {
    eq: vi.fn(() => chain),
    limit: vi.fn(() => ({
      single: mockSiblingSingle,
      then: (resolve: any, reject: any) => Promise.resolve(dedupResult.value).then(resolve, reject),
    })),
  }
  return chain
}
const mockSiblingSelect = vi.fn(() => makeSelectChain())

// Insert chain: .insert().select().single()  (single-card path)
const mockInsertSingle = vi.fn()
const mockInsertSelect = vi.fn(() => ({ single: mockInsertSingle }))
const mockInsert = vi.fn(() => ({ select: mockInsertSelect }))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: mockSiblingSelect,
      insert: mockInsert,
    })),
  })),
}))

describe('POST /api/flashcards/cards', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSiblingSingle.mockClear()
    mockInsert.mockClear()
    mockInsertSingle.mockClear()
    dedupResult.value = { data: [], error: null }  // no duplicates by default
  })

  it('returns 409 when a published card with the same question + answer already exists', async () => {
    dedupResult.value = { data: [{ id: 'existing', answer: '4' }], error: null }
    const { POST } = await import('../route')
    const res = await POST(makeReq({ topic_id: 'topic-1', question: 'What is 2+2?', answer: '4', listing_slugs: ['upcat'] }))
    expect(res.status).toBe(409)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('allows a same-question card when the answer differs (not a duplicate)', async () => {
    dedupResult.value = { data: [{ id: 'existing', answer: 'receive' }], error: null }
    mockInsertSingle.mockResolvedValueOnce({ data: { id: 'card-new' }, error: null })
    const { POST } = await import('../route')
    const res = await POST(makeReq({ topic_id: 'topic-1', question: 'Choose the correctly spelled word.', answer: 'definitely', listing_slugs: ['upcat'] }))
    expect(res.status).toBe(200)
    expect(mockInsert).toHaveBeenCalled()
  })

  function makeReq(body: object) {
    return new NextRequest('http://localhost/api/flashcards/cards', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  it('returns 400 when topic_id is missing', async () => {
    const { POST } = await import('../route')
    const res = await POST(makeReq({ question: 'Q', answer: 'A' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/topic_id/i)
  })

  it('returns 400 when question is missing', async () => {
    const { POST } = await import('../route')
    const res = await POST(makeReq({ topic_id: 'topic-1', answer: 'A' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/question/i)
  })

  it('returns 400 when answer is missing', async () => {
    const { POST } = await import('../route')
    const res = await POST(makeReq({ topic_id: 'topic-1', question: 'Q' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/answer/i)
  })

  it('inserts card with provided listing_slugs and returns { id }', async () => {
    mockInsertSingle.mockResolvedValueOnce({ data: { id: 'card-new' }, error: null })
    const { POST } = await import('../route')
    const res = await POST(makeReq({
      topic_id: 'topic-1',
      question: 'What is 2+2?',
      answer: '4',
      listing_slugs: ['upcat-2026'],
    }))
    expect(res.status).toBe(200)
    expect((await res.json()).id).toBe('card-new')
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ listing_slugs: ['upcat-2026'] })
    )
  })

  it('inherits listing_slugs from sibling card when not provided', async () => {
    mockSiblingSingle.mockResolvedValueOnce({ data: { listing_slugs: ['dost-2026'] }, error: null })
    mockInsertSingle.mockResolvedValueOnce({ data: { id: 'card-new' }, error: null })
    const { POST } = await import('../route')
    const res = await POST(makeReq({ topic_id: 'topic-1', question: 'Q', answer: 'A' }))
    expect(res.status).toBe(200)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ listing_slugs: ['dost-2026'] })
    )
  })

  it('falls back to [] when no listing_slugs and no sibling cards exist', async () => {
    mockSiblingSingle.mockResolvedValueOnce({ data: null, error: { message: 'No rows' } })
    mockInsertSingle.mockResolvedValueOnce({ data: { id: 'card-new' }, error: null })
    const { POST } = await import('../route')
    const res = await POST(makeReq({ topic_id: 'topic-1', question: 'Q', answer: 'A' }))
    expect(res.status).toBe(200)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ listing_slugs: [] })
    )
  })

  it('returns 500 when insert fails', async () => {
    mockSiblingSingle.mockResolvedValueOnce({ data: null, error: { message: 'No rows' } })
    mockInsertSingle.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })
    const { POST } = await import('../route')
    const res = await POST(makeReq({ topic_id: 'topic-1', question: 'Q', answer: 'A' }))
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// Batch path tests (body.cards array with ai_* fields — used by GenerateMoreModal)
// ---------------------------------------------------------------------------
describe('POST /api/flashcards/cards — batch path', () => {
  const mockBatchInsert = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    mockBatchInsert.mockReset()
    vi.doMock('@iskotify/utils', () => ({
      createServerClient: vi.fn(() => ({
        from: vi.fn(() => ({
          insert: mockBatchInsert,
        })),
      })),
    }))
  })

  function makeReq(body: object) {
    return new NextRequest('http://localhost/api/flashcards/cards', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  it('returns 400 when batch body is missing topic_id', async () => {
    const { POST } = await import('../route')
    const res = await POST(makeReq({ cards: [{ question: 'Q', answer: 'A', explanation: '' }] }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/topic_id/i)
  })

  it('inserts all cards with ai_* fields mapped to snake_case and returns { inserted: N }', async () => {
    mockBatchInsert.mockResolvedValueOnce({ error: null })

    const { POST } = await import('../route')
    const cards = [
      {
        question: 'Q1', answer: 'A1', explanation: 'E1',
        aiOptions: ['A1', 'B', 'C', 'D'], aiCorrectIndex: 0, aiExplanation: 'because A1',
      },
      {
        question: 'Q2', answer: 'A2', explanation: 'E2',
        // no ai fields — distractor generation may have failed for this card
      },
    ]
    const res = await POST(makeReq({ topic_id: 'topic-1', listing_slugs: ['upcat-2026'], cards }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.inserted).toBe(2)

    expect(mockBatchInsert).toHaveBeenCalledTimes(1)
    const insertedRows = mockBatchInsert.mock.calls[0]![0] as Array<Record<string, unknown>>
    expect(insertedRows).toHaveLength(2)

    const row0 = insertedRows[0]!
    const row1 = insertedRows[1]!

    // Card 1 — with ai_* populated
    expect(row0).toMatchObject({
      topic_id: 'topic-1',
      question: 'Q1',
      answer: 'A1',
      explanation: 'E1',
      status: 'published',
      listing_slugs: ['upcat-2026'],
      ai_options: ['A1', 'B', 'C', 'D'],
      ai_correct_index: 0,
      ai_explanation: 'because A1',
    })
    expect(typeof row0.ai_enhanced_at).toBe('string')

    // Card 2 — ai_* should be null when not provided
    expect(row1).toMatchObject({
      topic_id: 'topic-1',
      question: 'Q2',
      answer: 'A2',
      ai_options: null,
      ai_correct_index: null,
      ai_explanation: null,
      ai_enhanced_at: null,
    })
  })

  it('returns 500 when batch insert fails', async () => {
    mockBatchInsert.mockResolvedValueOnce({ error: { message: 'DB batch error' } })
    const { POST } = await import('../route')
    const res = await POST(makeReq({
      topic_id: 'topic-1',
      cards: [{ question: 'Q', answer: 'A', explanation: '' }],
    }))
    expect(res.status).toBe(500)
  })
})
