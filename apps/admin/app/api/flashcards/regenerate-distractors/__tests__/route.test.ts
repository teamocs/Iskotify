import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

const mockGenerate = vi.fn()
vi.mock('@/lib/gemini/generateDistractors', () => ({
  generateDistractorsForCard: mockGenerate,
}))

// ── Auth ──────────────────────────────────────────────────────────────────
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

// ── Supabase chain ──────────────────────────────────────────────────────────
// Real supabase-js query builders are chainable in any order and are
// themselves PromiseLike (awaitable without an explicit .then() call site),
// so the mock builders below expose eq/in/not/limit (each returning `this`)
// plus a `then` so `await query` resolves to the configured result.
let topicsResult: { data: unknown; error: unknown } = { data: [], error: null }
let rowsResult: { data: unknown; error: unknown } = { data: [], error: null }
let countResult: { count: number | null; error: unknown } = { count: 0, error: null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeAwaitableBuilder(resultRef: () => any) {
  const calls: unknown[][] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    eq: (...a: unknown[]) => { calls.push(['eq', ...a]); return builder },
    in: (...a: unknown[]) => { calls.push(['in', ...a]); return builder },
    not: (...a: unknown[]) => { calls.push(['not', ...a]); return builder },
    limit: (...a: unknown[]) => { calls.push(['limit', ...a]); return builder },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then: (resolve: any, reject: any) => Promise.resolve(resultRef()).then(resolve, reject),
    _calls: calls,
  }
  return builder
}

const mockUpdateEq = vi.fn(() => Promise.resolve({ error: null }))
const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lastRowsBuilder: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lastCountBuilder: any

function makeChain(table: string) {
  if (table === 'profiles') {
    return { select: () => ({ eq: () => ({ single: mockProfileSingle }) }) }
  }
  if (table === 'flashcard_topics') {
    return { select: () => ({ eq: () => Promise.resolve(topicsResult) }) }
  }
  // flashcards
  return {
    select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.count === 'exact') {
        lastCountBuilder = makeAwaitableBuilder(() => countResult)
        return lastCountBuilder
      }
      lastRowsBuilder = makeAwaitableBuilder(() => rowsResult)
      return lastRowsBuilder
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
  mockGenerate.mockReset()
  mockUpdateEq.mockClear()
  mockUpdate.mockClear()
  mockFrom.mockClear()
  topicsResult = { data: [], error: null }
  rowsResult = { data: [], error: null }
  countResult = { count: 0, error: null }
  lastRowsBuilder = undefined
  lastCountBuilder = undefined
})

function makeReq(body: object) {
  return new NextRequest('http://localhost/api/flashcards/regenerate-distractors', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

async function importRoute() {
  return (await import('../route')).POST
}

describe('POST /api/flashcards/regenerate-distractors', () => {
  it('returns 401 when unauthenticated', async () => {
    noUser()
    const POST = await importRoute()
    const res = await POST(makeReq({}))
    expect(res.status).toBe(401)
  })

  it('returns 403 when signed-in non-admin', async () => {
    nonAdmin()
    const POST = await importRoute()
    const res = await POST(makeReq({}))
    expect(res.status).toBe(403)
  })

  it('regenerates ai_options/ai_correct_index AND option_explanations/strategy_tip together in one update', async () => {
    adminUser()
    rowsResult = {
      data: [{
        id: 'c1', question: 'Q', answer: 'A', topic_id: 't1', ai_options: null,
        flashcard_topics: { name: 'Algebra', flashcard_subjects: { name: 'Math' } },
      }],
      error: null,
    }
    mockGenerate.mockResolvedValueOnce({
      options: ['A', 'w1', 'w2', 'w3'], correctIndex: 0, explanation: 'e',
      optionExplanations: [null, 'x1', 'x2', 'x3'], strategyTip: 'tip',
    })
    countResult = { count: 1, error: null }

    const POST = await importRoute()
    const res = await POST(makeReq({}))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ attempted: 1, succeeded: 1, failed: 0, remaining: 0 })

    expect(mockGenerate).toHaveBeenCalledWith({ subject: 'Math', topic: 'Algebra', question: 'Q', answer: 'A' })
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      ai_options: ['A', 'w1', 'w2', 'w3'],
      ai_correct_index: 0,
      ai_explanation: 'e',
      option_explanations: [null, 'x1', 'x2', 'x3'],
      strategy_tip: 'tip',
    }))
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'c1')
  })

  it('falls back to General/General Knowledge when the topic/subject relation is missing', async () => {
    adminUser()
    rowsResult = {
      data: [{ id: 'c1', question: 'Q', answer: 'A', topic_id: 't1', ai_options: null, flashcard_topics: null }],
      error: null,
    }
    mockGenerate.mockResolvedValueOnce(null)
    countResult = { count: 1, error: null }
    const POST = await importRoute()
    await POST(makeReq({}))
    expect(mockGenerate).toHaveBeenCalledWith({ subject: 'General Knowledge', topic: 'General', question: 'Q', answer: 'A' })
  })

  it('counts a Gemini failure as failed, without writing to the row', async () => {
    adminUser()
    rowsResult = {
      data: [{ id: 'c1', question: 'Q', answer: 'A', topic_id: 't1', ai_options: null, flashcard_topics: null }],
      error: null,
    }
    mockGenerate.mockResolvedValueOnce(null)
    countResult = { count: 1, error: null }
    const POST = await importRoute()
    const res = await POST(makeReq({}))
    const body = await res.json()
    expect(body).toEqual({ attempted: 1, succeeded: 0, failed: 1, remaining: 0 })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('filters by topic_id via .in("topic_id", [id]) and does not resolve any subject', async () => {
    adminUser()
    const POST = await importRoute()
    await POST(makeReq({ topic_id: 't1' }))
    expect(lastRowsBuilder._calls).toContainEqual(['in', 'topic_id', ['t1']])
  })

  it('resolves subject_id to its topic ids before filtering flashcards', async () => {
    adminUser()
    topicsResult = { data: [{ id: 'ta' }, { id: 'tb' }], error: null }
    const POST = await importRoute()
    await POST(makeReq({ subject_id: 's1' }))
    expect(lastRowsBuilder._calls).toContainEqual(['in', 'topic_id', ['ta', 'tb']])
  })

  it('short-circuits to zero results (no Gemini calls) when a subject has no topics', async () => {
    adminUser()
    topicsResult = { data: [], error: null }
    const POST = await importRoute()
    const res = await POST(makeReq({ subject_id: 's-empty' }))
    const body = await res.json()
    expect(body).toEqual({ attempted: 0, succeeded: 0, failed: 0, remaining: 0 })
    expect(mockGenerate).not.toHaveBeenCalled()
    expect(lastRowsBuilder).toBeUndefined()
  })

  it('applies scope=ai_enhanced as a not-null filter on ai_options', async () => {
    adminUser()
    const POST = await importRoute()
    await POST(makeReq({ scope: 'ai_enhanced' }))
    expect(lastRowsBuilder._calls).toContainEqual(['not', 'ai_options', 'is', null])
  })

  it('does not filter on ai_options when scope is "all" (default)', async () => {
    adminUser()
    const POST = await importRoute()
    await POST(makeReq({}))
    expect(lastRowsBuilder._calls.some((c: unknown[]) => c[0] === 'not')).toBe(false)
  })

  it('clamps limit to [1, 100] and defaults to 20', async () => {
    adminUser()
    const POST = await importRoute()
    await POST(makeReq({}))
    expect(lastRowsBuilder._calls).toContainEqual(['limit', 20])

    adminUser()
    await POST(makeReq({ limit: 999 }))
    expect(lastRowsBuilder._calls).toContainEqual(['limit', 100])

    adminUser()
    await POST(makeReq({ limit: 0 }))
    expect(lastRowsBuilder._calls).toContainEqual(['limit', 1])
  })

  it('reports remaining as totalMatched minus attempted', async () => {
    adminUser()
    rowsResult = {
      data: [{ id: 'c1', question: 'Q', answer: 'A', topic_id: 't1', ai_options: null, flashcard_topics: null }],
      error: null,
    }
    mockGenerate.mockResolvedValueOnce({
      options: ['A', 'w1', 'w2', 'w3'], correctIndex: 0, explanation: 'e',
      optionExplanations: [null, null, null, null], strategyTip: '',
    })
    countResult = { count: 9, error: null }
    const POST = await importRoute()
    const res = await POST(makeReq({}))
    const body = await res.json()
    expect(body.remaining).toBe(8)
  })
})
