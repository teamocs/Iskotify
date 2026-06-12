import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fake-anon-key')

// ── Auth client mock (mirrors data/__tests__/route.test.ts pattern) ──────────
const mockGetUser = vi.fn()
vi.mock('@/lib/supabase', () => ({
  createAuthClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

// ── Chainable Supabase mock ──────────────────────────────────────────────────
const mockProfileSingle = vi.fn()
const mockRange = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockReportSingle = vi.fn()
const mockQuestionMaybeSingle = vi.fn()

// Captured args for assertions
let capturedOrArg: string | undefined
let capturedEqArgs: Array<[string, unknown]> = []
let capturedOrderArgs: Array<[string, unknown]> = []
let lastUpdateArg: Record<string, unknown> | undefined
let lastUpdateEq: [string, unknown] | undefined
let lastDeleteEq: [string, unknown] | undefined
let questionTableQueried: string | undefined
let questionEq: [string, unknown] | undefined

function makeChain(table: string): any {
  if (table === 'profiles') {
    return {
      select(_c: string) {
        return { eq(_col: string, _val: unknown) { return { single: mockProfileSingle } } }
      },
    }
  }

  if (table === 'question_reports') {
    const listChain: any = {
      eq(col: string, val: unknown) { capturedEqArgs.push([col, val]); return listChain },
      or(filter: string) { capturedOrArg = filter; return listChain },
      order(col: string, opts: unknown) { capturedOrderArgs.push([col, opts]); return listChain },
      range(from: number, to: number) { return Promise.resolve(mockRange(from, to)) },
      single: mockReportSingle,
    }
    return {
      select(_cols: string, _opts?: unknown) { return listChain },
      update(data: Record<string, unknown>) {
        lastUpdateArg = data
        return {
          eq(col: string, val: unknown) {
            lastUpdateEq = [col, val]
            return Promise.resolve(mockUpdate(data, col, val))
          },
        }
      },
      delete() {
        return {
          eq(col: string, val: unknown) {
            lastDeleteEq = [col, val]
            return Promise.resolve(mockDelete(col, val))
          },
        }
      },
    }
  }

  // Underlying question tables (flashcards / upcat_questions)
  questionTableQueried = table
  return {
    select(_cols: string) {
      return {
        eq(col: string, val: unknown) {
          questionEq = [col, val]
          return { maybeSingle: mockQuestionMaybeSingle }
        },
      }
    },
  }
}

const mockFrom = vi.fn((table: string) => makeChain(table))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))

// ── Auth helpers ─────────────────────────────────────────────────────────────

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
  mockFrom.mockClear()
  mockRange.mockReset()
  mockUpdate.mockReset()
  mockDelete.mockReset()
  mockReportSingle.mockReset()
  mockQuestionMaybeSingle.mockReset()
  capturedOrArg = undefined
  capturedEqArgs = []
  capturedOrderArgs = []
  lastUpdateArg = undefined
  lastUpdateEq = undefined
  lastDeleteEq = undefined
  questionTableQueried = undefined
  questionEq = undefined
}

function makeListReq(qs = '') {
  return new NextRequest(`http://localhost/api/admin/reports${qs}`)
}

function makeIdContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

// ── GET /api/admin/reports ───────────────────────────────────────────────────

describe('GET /api/admin/reports', () => {
  beforeEach(() => {
    resetAll()
    mockRange.mockResolvedValue({ data: [], count: 0, error: null })
  })

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { GET } = await import('../route')
    const res = await GET(makeListReq())
    expect(res.status).toBe(401)
  })

  it('returns 403 when non-admin', async () => {
    nonAdmin()
    const { GET } = await import('../route')
    const res = await GET(makeListReq())
    expect(res.status).toBe(403)
  })

  it('returns rows and count ordered by created_at desc', async () => {
    adminUser()
    mockRange.mockResolvedValueOnce({
      data: [{ id: 'r1', question_text: 'Q?', reason: 'wrong answer', status: 'new' }],
      count: 1,
      error: null,
    })
    const { GET } = await import('../route')
    const res = await GET(makeListReq())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.rows).toHaveLength(1)
    expect(json.count).toBe(1)
    expect(capturedOrderArgs).toContainEqual(['created_at', { ascending: false }])
  })

  it('filters by status when a valid status is provided', async () => {
    adminUser()
    const { GET } = await import('../route')
    const res = await GET(makeListReq('?status=reviewed'))
    expect(res.status).toBe(200)
    expect(capturedEqArgs).toContainEqual(['status', 'reviewed'])
  })

  it('returns 400 for an invalid status value', async () => {
    adminUser()
    const { GET } = await import('../route')
    const res = await GET(makeListReq('?status=evil'))
    expect(res.status).toBe(400)
  })

  it('sanitizes q before building .or() — structural chars stripped', async () => {
    adminUser()
    const { GET } = await import('../route')
    const malicious = encodeURIComponent('%,verified.eq.true,(')
    const res = await GET(makeListReq(`?q=${malicious}`))
    expect(res.status).toBe(200)
    expect(capturedOrArg).toBeDefined()
    const ilikeParts = capturedOrArg!.match(/%([^%]*)%/g) ?? []
    expect(ilikeParts.length).toBeGreaterThan(0)
    for (const part of ilikeParts) {
      const inner = part.slice(1, -1)
      expect(inner).not.toMatch(/[%,():.\\*]/)
    }
  })

  it('skips .or() entirely when q is empty after sanitization', async () => {
    adminUser()
    const { GET } = await import('../route')
    const onlyStructural = encodeURIComponent('%,()')
    const res = await GET(makeListReq(`?q=${onlyStructural}`))
    expect(res.status).toBe(200)
    expect(capturedOrArg).toBeUndefined()
  })

  it('paginates with default limit 50 (page=2 → range 100-149)', async () => {
    adminUser()
    const { GET } = await import('../route')
    const res = await GET(makeListReq('?page=2'))
    expect(res.status).toBe(200)
    expect(mockRange).toHaveBeenCalledWith(100, 149)
  })

  it('respects a custom limit (page=1&limit=10 → range 10-19)', async () => {
    adminUser()
    const { GET } = await import('../route')
    const res = await GET(makeListReq('?page=1&limit=10'))
    expect(res.status).toBe(200)
    expect(mockRange).toHaveBeenCalledWith(10, 19)
  })

  it('returns 500 when DB fails', async () => {
    adminUser()
    mockRange.mockResolvedValueOnce({ data: null, count: null, error: { message: 'DB fail' } })
    const { GET } = await import('../route')
    const res = await GET(makeListReq())
    expect(res.status).toBe(500)
  })
})

// ── GET /api/admin/reports/[id] ──────────────────────────────────────────────

describe('GET /api/admin/reports/[id]', () => {
  beforeEach(() => resetAll())

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { GET } = await import('../[id]/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/reports/r1'), makeIdContext('r1'))
    expect(res.status).toBe(401)
  })

  it('returns report plus the underlying flashcard', async () => {
    adminUser()
    mockReportSingle.mockResolvedValueOnce({
      data: { id: 'r1', question_id: 'uuid-1', source_table: 'flashcards', question_text: 'Q?', reason: 'typo', status: 'new' },
      error: null,
    })
    mockQuestionMaybeSingle.mockResolvedValueOnce({
      data: { id: 'uuid-1', question: 'Q?', answer: 'A', explanation: 'E' },
      error: null,
    })
    const { GET } = await import('../[id]/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/reports/r1'), makeIdContext('r1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.report.id).toBe('r1')
    expect(json.question.id).toBe('uuid-1')
    expect(questionTableQueried).toBe('flashcards')
    expect(questionEq).toEqual(['id', 'uuid-1'])
  })

  it('returns report plus the underlying upcat question keyed by question_id', async () => {
    adminUser()
    mockReportSingle.mockResolvedValueOnce({
      data: { id: 'r2', question_id: 'M001', source_table: 'upcat_questions', question_text: 'Q?', reason: 'bad', status: 'new' },
      error: null,
    })
    mockQuestionMaybeSingle.mockResolvedValueOnce({
      data: { question_id: 'M001', question_text: 'Q?', options: ['a', 'b', 'c', 'd'], correct_index: 0 },
      error: null,
    })
    const { GET } = await import('../[id]/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/reports/r2'), makeIdContext('r2'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.question.question_id).toBe('M001')
    expect(questionTableQueried).toBe('upcat_questions')
    expect(questionEq).toEqual(['question_id', 'M001'])
  })

  it('returns 404 when the report does not exist', async () => {
    adminUser()
    mockReportSingle.mockResolvedValueOnce({ data: null, error: { message: 'not found' } })
    const { GET } = await import('../[id]/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/reports/nope'), makeIdContext('nope'))
    expect(res.status).toBe(404)
  })

  it('returns question: null when the underlying question was deleted', async () => {
    adminUser()
    mockReportSingle.mockResolvedValueOnce({
      data: { id: 'r3', question_id: 'gone', source_table: 'flashcards', question_text: 'Q?', reason: 'x', status: 'new' },
      error: null,
    })
    mockQuestionMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    const { GET } = await import('../[id]/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/reports/r3'), makeIdContext('r3'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.question).toBeNull()
  })
})

// ── PATCH /api/admin/reports/[id] ────────────────────────────────────────────

describe('PATCH /api/admin/reports/[id]', () => {
  beforeEach(() => resetAll())

  function makePatchReq(id: string, body: unknown) {
    return new NextRequest(`http://localhost/api/admin/reports/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { PATCH } = await import('../[id]/route')
    const res = await PATCH(makePatchReq('r1', { status: 'reviewed' }), makeIdContext('r1'))
    expect(res.status).toBe(401)
  })

  it('returns 403 when non-admin', async () => {
    nonAdmin()
    const { PATCH } = await import('../[id]/route')
    const res = await PATCH(makePatchReq('r1', { status: 'reviewed' }), makeIdContext('r1'))
    expect(res.status).toBe(403)
  })

  it('updates status and sets updated_at', async () => {
    adminUser()
    mockUpdate.mockResolvedValueOnce({ error: null })
    const { PATCH } = await import('../[id]/route')
    const res = await PATCH(makePatchReq('r1', { status: 'resolved' }), makeIdContext('r1'))
    expect(res.status).toBe(200)
    expect(lastUpdateEq).toEqual(['id', 'r1'])
    expect(lastUpdateArg).toHaveProperty('status', 'resolved')
    expect(typeof lastUpdateArg!.updated_at).toBe('string')
  })

  it('rejects an invalid status value with 400', async () => {
    adminUser()
    const { PATCH } = await import('../[id]/route')
    const res = await PATCH(makePatchReq('r1', { status: 'archived' }), makeIdContext('r1'))
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns 400 when status is missing', async () => {
    adminUser()
    const { PATCH } = await import('../[id]/route')
    const res = await PATCH(makePatchReq('r1', { reason: 'nope' }), makeIdContext('r1'))
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('strips non-status fields from the update (mass-assignment protection)', async () => {
    adminUser()
    mockUpdate.mockResolvedValueOnce({ error: null })
    const { PATCH } = await import('../[id]/route')
    const res = await PATCH(
      makePatchReq('r1', {
        status: 'reviewed',
        question_id: 'hacked',
        user_id: 'someone-else',
        reason: 'overwritten',
        injected_col: 'DROP TABLE--',
      }),
      makeIdContext('r1'),
    )
    expect(res.status).toBe(200)
    expect(Object.keys(lastUpdateArg!).sort()).toEqual(['status', 'updated_at'])
  })

  it('returns 500 when DB update fails', async () => {
    adminUser()
    mockUpdate.mockResolvedValueOnce({ error: { message: 'DB fail' } })
    const { PATCH } = await import('../[id]/route')
    const res = await PATCH(makePatchReq('r1', { status: 'reviewed' }), makeIdContext('r1'))
    expect(res.status).toBe(500)
  })
})

// ── DELETE /api/admin/reports/[id] ───────────────────────────────────────────

describe('DELETE /api/admin/reports/[id]', () => {
  beforeEach(() => resetAll())

  function makeDeleteReq(id: string) {
    return new NextRequest(`http://localhost/api/admin/reports/${id}`, { method: 'DELETE' })
  }

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { DELETE } = await import('../[id]/route')
    const res = await DELETE(makeDeleteReq('r1'), makeIdContext('r1'))
    expect(res.status).toBe(401)
  })

  it('returns 403 when non-admin', async () => {
    nonAdmin()
    const { DELETE } = await import('../[id]/route')
    const res = await DELETE(makeDeleteReq('r1'), makeIdContext('r1'))
    expect(res.status).toBe(403)
  })

  it('deletes the report by id and returns 200', async () => {
    adminUser()
    mockDelete.mockResolvedValueOnce({ error: null })
    const { DELETE } = await import('../[id]/route')
    const res = await DELETE(makeDeleteReq('r1'), makeIdContext('r1'))
    expect(res.status).toBe(200)
    expect(lastDeleteEq).toEqual(['id', 'r1'])
  })

  it('returns 500 when DB delete fails', async () => {
    adminUser()
    mockDelete.mockResolvedValueOnce({ error: { message: 'DB fail' } })
    const { DELETE } = await import('../[id]/route')
    const res = await DELETE(makeDeleteReq('r1'), makeIdContext('r1'))
    expect(res.status).toBe(500)
  })
})
