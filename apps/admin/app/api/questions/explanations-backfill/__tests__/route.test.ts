import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

const mockGenerateOptionExplanations = vi.fn()
vi.mock('@/lib/gemini/generateDistractors', () => ({
  generateOptionExplanations: mockGenerateOptionExplanations,
}))

// ── Auth ──────────────────────────────────────────────────────────────────────
const mockGetUser = vi.fn()
const mockProfileSingle = vi.fn()
vi.mock('@/lib/supabase', () => ({
  createAuthClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
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

// ── Supabase chain ─────────────────────────────────────────────────────────────
// select().eq('strategy_tip','').limit(n)  → rows
// select('*', {count:'exact', head:true}).eq('strategy_tip','')  → count
// update({...}).eq('id'|'question_id', v) → { error }
const mockLimit = vi.fn()
const mockEqAfterSelect = vi.fn(() => ({ limit: mockLimit }))
const mockCountEq = vi.fn(() => Promise.resolve({ count: 0, error: null }))
const mockUpdateEq = vi.fn(() => Promise.resolve({ error: null }))
const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }))

function makeChain(table: string) {
  if (table === 'profiles') {
    return { select: () => ({ eq: () => ({ single: mockProfileSingle }) }) }
  }
  return {
    select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.count === 'exact') return { eq: mockCountEq }
      return { eq: mockEqAfterSelect }
    },
    update: mockUpdate,
  }
}
const mockFrom = vi.fn((table: string) => makeChain(table))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))

beforeEach(() => {
  vi.resetModules()
  mockGetUser.mockReset()
  mockProfileSingle.mockReset()
  mockGenerateOptionExplanations.mockReset()
  mockLimit.mockReset()
  mockEqAfterSelect.mockClear()
  mockCountEq.mockReset()
  mockUpdateEq.mockClear()
  mockUpdate.mockClear()
  mockFrom.mockClear()
})

function makeReq(body: object) {
  return new NextRequest('http://localhost/api/questions/explanations-backfill', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

async function importRoute() {
  return (await import('../route')).POST
}

describe('POST /api/questions/explanations-backfill', () => {
  it('returns 401 when unauthenticated', async () => {
    noUser()
    const POST = await importRoute()
    const res = await POST(makeReq({ source: 'flashcards' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when signed-in non-admin', async () => {
    nonAdmin()
    const POST = await importRoute()
    const res = await POST(makeReq({ source: 'flashcards' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when source is missing or invalid', async () => {
    adminUser()
    const POST = await importRoute()
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/source/i)
  })

  it('returns zero counts when no rows need backfilling (upcat_questions)', async () => {
    adminUser()
    mockLimit.mockResolvedValueOnce({ data: [], error: null })
    mockCountEq.mockResolvedValueOnce({ count: 0, error: null })
    const POST = await importRoute()
    const res = await POST(makeReq({ source: 'upcat_questions' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ source: 'upcat_questions', attempted: 0, succeeded: 0, failed: 0, remaining: 0 })
    expect(mockGenerateOptionExplanations).not.toHaveBeenCalled()
  })

  it('processes upcat_questions rows and writes option_explanations/strategy_tip', async () => {
    adminUser()
    mockLimit.mockResolvedValueOnce({
      data: [
        { question_id: 'q1', question_text: 'Q1?', options: ['a', 'b', 'c', 'd'], correct_index: 0, main_subject: 'Math', topic: 'Algebra' },
        { question_id: 'q2', question_text: 'Q2?', options: ['a', 'b', 'c', 'd'], correct_index: 1, main_subject: 'Sci', topic: 'Bio' },
      ],
      error: null,
    })
    mockGenerateOptionExplanations
      .mockResolvedValueOnce({ optionExplanations: [null, 'wrong', 'wrong', 'wrong'], strategyTip: 'tip1' })
      .mockResolvedValueOnce(null) // q2 fails
    mockCountEq.mockResolvedValueOnce({ count: 5, error: null })

    const POST = await importRoute()
    const res = await POST(makeReq({ source: 'upcat_questions', limit: 10 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ source: 'upcat_questions', attempted: 2, succeeded: 1, failed: 1, remaining: 5 })

    expect(mockLimit).toHaveBeenCalledWith(10)
    expect(mockUpdate).toHaveBeenCalledWith({ option_explanations: [null, 'wrong', 'wrong', 'wrong'], strategy_tip: 'tip1' })
    expect(mockUpdateEq).toHaveBeenCalledWith('question_id', 'q1')
  })

  it('processes flashcards rows, preferring ai_options/ai_correct_index over options when present', async () => {
    adminUser()
    mockLimit.mockResolvedValueOnce({
      data: [
        {
          id: 'c1', question: 'Q1?', options: ['x', 'A', 'y', 'z'], correct_answer_index: 1,
          ai_options: ['A', 'p', 'q', 'r'], ai_correct_index: 0,
          flashcard_topics: { name: 'Topic1', flashcard_subjects: { name: 'Subject1' } },
        },
      ],
      error: null,
    })
    mockGenerateOptionExplanations.mockResolvedValueOnce({
      optionExplanations: [null, 'wrong-p', 'wrong-q', 'wrong-r'], strategyTip: 'tip',
    })
    mockCountEq.mockResolvedValueOnce({ count: 0, error: null })

    const POST = await importRoute()
    const res = await POST(makeReq({ source: 'flashcards' }))
    expect(res.status).toBe(200)
    expect(mockGenerateOptionExplanations).toHaveBeenCalledWith({
      subject: 'Subject1', topic: 'Topic1', question: 'Q1?',
      options: ['A', 'p', 'q', 'r'], correctIndex: 0,
    })
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'c1')
  })

  it('falls back to admin options/correct_answer_index when ai_options absent', async () => {
    adminUser()
    mockLimit.mockResolvedValueOnce({
      data: [{
        id: 'c2', question: 'Q2?', options: ['w', 'x', 'A2', 'z'], correct_answer_index: 2,
        ai_options: null, ai_correct_index: null,
        flashcard_topics: null,
      }],
      error: null,
    })
    mockGenerateOptionExplanations.mockResolvedValueOnce({
      optionExplanations: ['wrong-w', 'wrong-x', null, 'wrong-z'], strategyTip: '',
    })
    mockCountEq.mockResolvedValueOnce({ count: 0, error: null })

    const POST = await importRoute()
    await POST(makeReq({ source: 'flashcards' }))
    expect(mockGenerateOptionExplanations).toHaveBeenCalledWith({
      subject: 'General Knowledge', topic: 'General',
      question: 'Q2?', options: ['w', 'x', 'A2', 'z'], correctIndex: 2,
    })
  })

  it('clamps limit to [1, 100] and defaults to 20', async () => {
    adminUser()
    mockLimit.mockResolvedValue({ data: [], error: null })
    mockCountEq.mockResolvedValue({ count: 0, error: null })
    const POST = await importRoute()

    await POST(makeReq({ source: 'upcat_questions' }))
    expect(mockLimit).toHaveBeenLastCalledWith(20)

    adminUser()
    await POST(makeReq({ source: 'upcat_questions', limit: 999 }))
    expect(mockLimit).toHaveBeenLastCalledWith(100)

    adminUser()
    await POST(makeReq({ source: 'upcat_questions', limit: 0 }))
    expect(mockLimit).toHaveBeenLastCalledWith(1)
  })

  it('skips rows whose options array is not length 4 (upcat_questions) without calling Gemini', async () => {
    adminUser()
    mockLimit.mockResolvedValueOnce({
      data: [{ question_id: 'q1', question_text: 'Q?', options: ['a', 'b'], correct_index: 0, main_subject: 'M', topic: 'T' }],
      error: null,
    })
    mockCountEq.mockResolvedValueOnce({ count: 1, error: null })
    const POST = await importRoute()
    const res = await POST(makeReq({ source: 'upcat_questions' }))
    const body = await res.json()
    expect(body.succeeded).toBe(0)
    expect(body.failed).toBe(1)
    expect(mockGenerateOptionExplanations).not.toHaveBeenCalled()
  })
})
