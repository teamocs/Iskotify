import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')

// Sibling lookup chain: .select().eq().limit().single()
const mockSiblingSingle = vi.fn()
const mockSiblingLimit = vi.fn(() => ({ single: mockSiblingSingle }))
const mockSiblingEq = vi.fn(() => ({ limit: mockSiblingLimit }))
const mockSiblingSelect = vi.fn(() => ({ eq: mockSiblingEq }))

// Insert chain: .insert().select().single()
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
