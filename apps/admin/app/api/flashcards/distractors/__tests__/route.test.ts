import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGenerate = vi.fn()
vi.mock('@/lib/gemini/generateDistractors', () => ({
  generateDistractorsForCard: mockGenerate,
}))

const mockSingle = vi.fn()
const mockEq = vi.fn(() => ({ single: mockSingle }))
const mockSelect = vi.fn(() => ({ eq: mockEq }))
const mockUpdate = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }))
const mockFrom = vi.fn(() => ({ select: mockSelect, update: mockUpdate }))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('ADMIN_BACKFILL_SECRET', 'fake-secret')
  mockGenerate.mockReset()
  mockSingle.mockReset()
  mockSelect.mockClear()
  mockEq.mockClear()
  mockUpdate.mockClear()
  mockFrom.mockClear()
})

function makeReq(body: unknown, secret = 'fake-secret') {
  return new NextRequest('http://localhost/api/flashcards/distractors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
    body: JSON.stringify(body),
  })
}

async function importRoute() {
  return (await import('../route')).POST
}

describe('POST /api/flashcards/distractors', () => {
  it('returns 401 without the admin secret header', async () => {
    const POST = await importRoute()
    const req = new NextRequest('http://localhost/api/flashcards/distractors', { method: 'POST', body: JSON.stringify({ cardId: 'c1' }) })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 401 with the wrong admin secret', async () => {
    const POST = await importRoute()
    const res = await POST(makeReq({ cardId: 'c1' }, 'wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when cardId is missing', async () => {
    const POST = await importRoute()
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
  })

  it('returns 404 when the card does not exist', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: null })
    const POST = await importRoute()
    const res = await POST(makeReq({ cardId: 'missing' }))
    expect(res.status).toBe(404)
  })

  it('generates distractors, writes back to Supabase, returns 200', async () => {
    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'c1', question: 'Q', answer: 'Right',
        flashcard_topics: { name: 'Algebra', flashcard_subjects: { name: 'Math' } },
      },
      error: null,
    })
    mockGenerate.mockResolvedValueOnce({
      options: ['W1', 'Right', 'W2', 'W3'],
      correctIndex: 1,
      explanation: 'because',
    })
    const POST = await importRoute()
    const res = await POST(makeReq({ cardId: 'c1' }))
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      ai_options: ['W1', 'Right', 'W2', 'W3'],
      ai_correct_index: 1,
      ai_explanation: 'because',
    }))
    const body = await res.json() as { cached: boolean }
    expect(body.cached).toBe(true)
  })

  it('returns 200 with cached=false when Gemini returns null', async () => {
    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'c1', question: 'Q', answer: 'Right',
        flashcard_topics: { name: 'T', flashcard_subjects: { name: 'S' } },
      },
      error: null,
    })
    mockGenerate.mockResolvedValueOnce(null)
    const POST = await importRoute()
    const res = await POST(makeReq({ cardId: 'c1' }))
    expect(res.status).toBe(200)
    expect(mockUpdate).not.toHaveBeenCalled()
    const body = await res.json() as { cached: boolean }
    expect(body.cached).toBe(false)
  })
})
