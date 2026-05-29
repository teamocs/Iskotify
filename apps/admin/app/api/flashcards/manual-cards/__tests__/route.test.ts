import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')

const mockSingle = vi.fn()
const mockSelectSingle = vi.fn(() => ({ single: mockSingle }))
const mockUpsert = vi.fn(() => ({ select: mockSelectSingle }))
const mockInsertSelect = vi.fn(() => ({ select: mockSelectSingle }))
// flashcards insert now chains .select() — resolve with empty inserted rows
const mockInsertCardSelect = vi.fn().mockResolvedValue({ data: [], error: null })
const mockInsertCard = vi.fn(() => ({ select: mockInsertCardSelect }))
const mockEqFlat = vi.fn().mockResolvedValue({ error: null })
const mockUpdateEq = vi.fn(() => ({ eq: mockEqFlat }))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'flashcard_subjects') return { upsert: mockUpsert }
      if (table === 'flashcard_topics')   return { insert: mockInsertSelect }
      if (table === 'flashcards')         return { insert: mockInsertCard, update: mockUpdateEq, delete: () => ({ eq: mockEqFlat }) }
      return {}
    }),
  })),
}))

// Stub out Gemini so fire-and-forget doesn't make real network calls in tests
vi.mock('@/lib/gemini/generateDistractors', () => ({
  generateDistractorsForCard: vi.fn().mockResolvedValue(null),
}))

// ─── POST /api/flashcards/manual ─────────────────────────────────────────────

describe('POST /api/flashcards/manual', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSingle.mockClear()
    mockUpsert.mockClear()
    mockInsertSelect.mockClear()
    mockInsertCard.mockClear()
    mockInsertCardSelect.mockClear()
  })

  function makeManualReq(body: object) {
    return new NextRequest('http://localhost/api/flashcards/manual', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  it('returns 400 when required fields are missing', async () => {
    const { POST } = await import('../../manual/route')
    const res = await POST(makeManualReq({ subject_name: 'Science' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when listing_slugs is empty', async () => {
    const { POST } = await import('../../manual/route')
    const res = await POST(
      makeManualReq({
        subject_name: 'Science',
        topic_name: 'Physics',
        listing_slugs: [],
        cards: [{ question: 'Q', answer: 'A', explanation: '' }],
      })
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when cards array is empty', async () => {
    const { POST } = await import('../../manual/route')
    const res = await POST(
      makeManualReq({
        subject_name: 'Science',
        topic_name: 'Physics',
        listing_slugs: ['dost-2026'],
        cards: [],
      })
    )
    expect(res.status).toBe(400)
  })

  it('creates subject, topic, and cards; returns { ok, topic_id }', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { id: 'subj-1' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'topic-1' }, error: null })

    const { POST } = await import('../../manual/route')
    const res = await POST(
      makeManualReq({
        subject_name: 'Science',
        topic_name: 'Physics',
        listing_slugs: ['dost-2026'],
        cards: [{ question: 'Q', answer: 'A', explanation: '' }],
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.topic_id).toBe('topic-1')
    expect(mockInsertCard).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ status: 'published', listing_slugs: ['dost-2026'] }),
      ])
    )
  })

  it('inserts topic with status published (not draft)', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { id: 'subj-1' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'topic-1' }, error: null })

    const { POST } = await import('../../manual/route')
    await POST(
      makeManualReq({
        subject_name: 'Science',
        topic_name: 'Physics',
        listing_slugs: ['dost-2026'],
        cards: [{ question: 'Q', answer: 'A', explanation: '' }],
      })
    )
    expect(mockInsertSelect).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'published' })
    )
  })

  it('returns 500 when subject upsert fails', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })
    const { POST } = await import('../../manual/route')
    const res = await POST(
      makeManualReq({
        subject_name: 'Science',
        topic_name: 'Physics',
        listing_slugs: ['x'],
        cards: [{ question: 'Q', answer: 'A', explanation: '' }],
      })
    )
    expect(res.status).toBe(500)
  })
})

// ─── PATCH /api/flashcards/cards/[id] ────────────────────────────────────────

describe('PATCH /api/flashcards/cards/[id]', () => {
  beforeEach(() => {
    vi.resetModules()
    mockEqFlat.mockClear()
    mockUpdateEq.mockClear()
  })

  it('updates card and returns 200', async () => {
    mockEqFlat.mockResolvedValueOnce({ error: null })
    const { PATCH } = await import('../../cards/[id]/route')
    const req = new NextRequest('http://localhost/api/flashcards/cards/card-1', {
      method: 'PATCH',
      body: JSON.stringify({ answer: 'Updated' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'card-1' }) })
    expect(res.status).toBe(200)
    expect(mockEqFlat).toHaveBeenCalledWith('id', 'card-1')
    expect(mockUpdateEq).not.toHaveBeenCalledWith(
      expect.objectContaining({ topic_id: expect.anything() })
    )
  })

  it('returns 500 when update fails', async () => {
    mockEqFlat.mockResolvedValueOnce({ error: { message: 'DB error' } })
    const { PATCH } = await import('../../cards/[id]/route')
    const req = new NextRequest('http://localhost/api/flashcards/cards/card-1', {
      method: 'PATCH',
      body: JSON.stringify({ answer: 'x' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'card-1' }) })
    expect(res.status).toBe(500)
  })

  it('returns 400 when no updatable fields provided', async () => {
    const { PATCH } = await import('../../cards/[id]/route')
    const req = new NextRequest('http://localhost/api/flashcards/cards/card-1', {
      method: 'PATCH',
      body: JSON.stringify({ topic_id: 'other-topic', status: 'published' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'card-1' }) })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/no updatable fields/i)
  })
})

// ─── DELETE /api/flashcards/cards/[id] ───────────────────────────────────────

describe('DELETE /api/flashcards/cards/[id]', () => {
  beforeEach(() => {
    vi.resetModules()
    mockEqFlat.mockClear()
  })

  it('deletes card and returns 200', async () => {
    mockEqFlat.mockResolvedValueOnce({ error: null })
    const { DELETE } = await import('../../cards/[id]/route')
    const req = new NextRequest('http://localhost/api/flashcards/cards/card-1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'card-1' }) })
    expect(res.status).toBe(200)
    expect(mockEqFlat).toHaveBeenCalledWith('id', 'card-1')
  })

  it('returns 500 when delete fails', async () => {
    mockEqFlat.mockResolvedValueOnce({ error: { message: 'DB error' } })
    const { DELETE } = await import('../../cards/[id]/route')
    const req = new NextRequest('http://localhost/api/flashcards/cards/card-1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'card-1' }) })
    expect(res.status).toBe(500)
  })
})
