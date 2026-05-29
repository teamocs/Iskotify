import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockLimit = vi.fn()
const mockNot = vi.fn(() => ({ limit: mockLimit }))
const mockSelect = vi.fn(() => ({ not: mockNot }))
const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }))
const mockFrom = vi.fn(() => ({ select: mockSelect, update: mockUpdate }))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('ADMIN_BACKFILL_SECRET', 'fake-secret')
  mockLimit.mockReset()
  mockNot.mockClear()
  mockSelect.mockClear()
  mockUpdateEq.mockClear()
  mockUpdate.mockClear()
  mockFrom.mockClear()
})

function makeReq(query = '', secret = 'fake-secret') {
  return new NextRequest(`http://localhost/api/flashcards/sanitize-legacy${query}`, {
    method: 'POST',
    headers: { 'x-admin-secret': secret },
  })
}

async function importRoute() {
  return (await import('../route')).POST
}

describe('POST /api/flashcards/sanitize-legacy', () => {
  it('returns 401 without admin secret', async () => {
    const POST = await importRoute()
    const req = new NextRequest('http://localhost/api/flashcards/sanitize-legacy', { method: 'POST' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('dry_run=1 returns counts without writing', async () => {
    mockLimit.mockResolvedValueOnce({
      data: [
        { id: 'c1', question: 'Q1?\nA. opt1\nB. opt2\nC. opt3\nD. opt4', answer: 'C. opt3' },
        { id: 'c2', question: 'Q2?\nA. x\nB. y\nC. z\nD. w', answer: 'A. x' },
      ],
      error: null,
    })
    const POST = await importRoute()
    const res = await POST(makeReq('?dry_run=1&limit=10'))
    expect(res.status).toBe(200)
    const body = await res.json() as { dry_run: boolean; updated: number; parsed_ok: number }
    expect(body.dry_run).toBe(true)
    expect(body.parsed_ok).toBe(2)
    expect(body.updated).toBe(0)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('dry_run=0 writes parsed rows back to Supabase', async () => {
    mockLimit.mockResolvedValueOnce({
      data: [
        { id: 'c1', question: 'Q1?\nA. opt1\nB. opt2\nC. opt3\nD. opt4', answer: 'C. opt3' },
      ],
      error: null,
    })
    const POST = await importRoute()
    const res = await POST(makeReq('?dry_run=0&limit=10'))
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({
      question: 'Q1?',
      options: ['opt1', 'opt2', 'opt3', 'opt4'],
      correct_answer_index: 2,
    })
    const body = await res.json() as { updated: number }
    expect(body.updated).toBe(1)
  })

  it('reports answer-mismatch rows in a separate bucket without writing', async () => {
    mockLimit.mockResolvedValueOnce({
      data: [
        // Answer says C but option C doesn't match the answer text
        { id: 'c1', question: 'Q?\nA. X\nB. Y\nC. Z\nD. W', answer: 'C. Mitochondria' },
      ],
      error: null,
    })
    const POST = await importRoute()
    const res = await POST(makeReq('?dry_run=0&limit=10'))
    const body = await res.json() as { answer_mismatch: number; updated: number }
    expect(body.answer_mismatch).toBe(1)
    expect(body.updated).toBe(0)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('respects the limit parameter', async () => {
    mockLimit.mockResolvedValueOnce({ data: [], error: null })
    const POST = await importRoute()
    await POST(makeReq('?limit=25'))
    expect(mockLimit).toHaveBeenCalledWith(25)
  })
})
