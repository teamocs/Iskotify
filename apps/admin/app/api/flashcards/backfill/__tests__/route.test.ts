import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGenerate = vi.fn()
vi.mock('@/lib/gemini/generateDistractors', () => ({
  generateDistractorsForCard: mockGenerate,
}))

const mockLimit = vi.fn()
const mockIsNull = vi.fn(() => ({ limit: mockLimit }))
const mockSelect = vi.fn(() => ({ is: mockIsNull }))
const mockEq = vi.fn(() => ({ select: mockSelect }))
const mockUpdate = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }))
const mockCountIsNull = vi.fn(() => Promise.resolve({ count: 0, error: null }))
const mockCountSelect = vi.fn(() => ({ is: mockCountIsNull }))

const mockFrom = vi.fn((_table: string) => ({
  select: (cols: string, opts?: { count?: string; head?: boolean }) => {
    if (opts?.count === 'exact') {
      return mockCountSelect(cols, opts)
    }
    return mockSelect(cols)
  },
  update: mockUpdate,
}))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('ADMIN_BACKFILL_SECRET', 'fake-secret')
  mockGenerate.mockReset()
  mockLimit.mockReset()
  mockIsNull.mockClear()
  mockSelect.mockClear()
  mockUpdate.mockClear()
  mockCountIsNull.mockReset()
  mockCountSelect.mockClear()
  mockFrom.mockClear()
})

function makeReq(query = '', secret = 'fake-secret') {
  return new NextRequest(`http://localhost/api/flashcards/backfill${query}`, {
    method: 'POST',
    headers: { 'x-admin-secret': secret },
  })
}

async function importRoute() {
  return (await import('../route')).POST
}

describe('POST /api/flashcards/backfill', () => {
  it('returns 401 without admin secret', async () => {
    const POST = await importRoute()
    const req = new NextRequest('http://localhost/api/flashcards/backfill', { method: 'POST' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 200 with zero counts when no cards need backfilling', async () => {
    mockLimit.mockResolvedValueOnce({ data: [], error: null })
    mockCountIsNull.mockResolvedValueOnce({ count: 0, error: null })
    const POST = await importRoute()
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json() as { processed: number; succeeded: number; failed: number; remaining: number }
    expect(body).toEqual({ processed: 0, succeeded: 0, failed: 0, remaining: 0 })
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('processes up to limit cards and reports succeeded/failed split', async () => {
    mockLimit.mockResolvedValueOnce({
      data: [
        { id: 'c1', question: 'Q1', answer: 'A1', flashcard_topics: { name: 'T', flashcard_subjects: { name: 'S' } } },
        { id: 'c2', question: 'Q2', answer: 'A2', flashcard_topics: { name: 'T', flashcard_subjects: { name: 'S' } } },
        { id: 'c3', question: 'Q3', answer: 'A3', flashcard_topics: { name: 'T', flashcard_subjects: { name: 'S' } } },
      ],
      error: null,
    })
    mockGenerate
      .mockResolvedValueOnce({ options: ['x', 'A1', 'y', 'z'], correctIndex: 1, explanation: '' })
      .mockResolvedValueOnce(null)  // c2 fails
      .mockResolvedValueOnce({ options: ['p', 'q', 'A3', 'r'], correctIndex: 2, explanation: '' })
    mockCountIsNull.mockResolvedValueOnce({ count: 47, error: null })

    const POST = await importRoute()
    const res = await POST(makeReq('?limit=3'))
    expect(res.status).toBe(200)
    const body = await res.json() as { processed: number; succeeded: number; failed: number; remaining: number }
    expect(body).toEqual({ processed: 3, succeeded: 2, failed: 1, remaining: 47 })
  })

  it('defaults limit to 50 when query missing', async () => {
    mockLimit.mockResolvedValueOnce({ data: [], error: null })
    mockCountIsNull.mockResolvedValueOnce({ count: 0, error: null })
    const POST = await importRoute()
    await POST(makeReq())
    expect(mockLimit).toHaveBeenCalledWith(50)
  })

  it('clamps limit to [1, 200]', async () => {
    mockLimit.mockResolvedValue({ data: [], error: null })
    mockCountIsNull.mockResolvedValue({ count: 0, error: null })
    const POST = await importRoute()

    await POST(makeReq('?limit=999'))
    expect(mockLimit).toHaveBeenLastCalledWith(200)

    await POST(makeReq('?limit=0'))
    expect(mockLimit).toHaveBeenLastCalledWith(1)
  })
})
