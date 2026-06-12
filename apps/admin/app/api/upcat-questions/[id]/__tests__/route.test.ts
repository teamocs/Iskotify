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
const mockQuestionSingle = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()

let lastSelectEq: [string, unknown] | undefined
let lastUpdateArg: Record<string, unknown> | undefined
let lastUpdateEq: [string, unknown] | undefined
let lastDeleteEq: [string, unknown] | undefined

function makeChain(table: string): any {
  if (table === 'profiles') {
    return {
      select(_c: string) {
        return { eq(_col: string, _val: unknown) { return { single: mockProfileSingle } } }
      },
    }
  }

  // upcat_questions
  return {
    select(_cols: string) {
      return {
        eq(col: string, val: unknown) {
          lastSelectEq = [col, val]
          return { single: mockQuestionSingle, maybeSingle: mockQuestionSingle }
        },
      }
    },
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
  mockQuestionSingle.mockReset()
  mockUpdate.mockReset()
  mockDelete.mockReset()
  lastSelectEq = undefined
  lastUpdateArg = undefined
  lastUpdateEq = undefined
  lastDeleteEq = undefined
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

function patchReq(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/upcat-questions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const EXISTING_QUESTION = {
  question_id: 'M001',
  subtest: 'math',
  question_text: 'What is 2+2?',
  options: ['1', '2', '3', '4'],
  correct_index: 3,
  explanation: 'Basic addition.',
  status: 'published',
}

// ── GET /api/upcat-questions/[id] ────────────────────────────────────────────

describe('GET /api/upcat-questions/[id]', () => {
  beforeEach(() => resetAll())

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { GET } = await import('../route')
    const res = await GET(new NextRequest('http://localhost/api/upcat-questions/M001'), ctx('M001'))
    expect(res.status).toBe(401)
  })

  it('returns 403 when non-admin', async () => {
    nonAdmin()
    const { GET } = await import('../route')
    const res = await GET(new NextRequest('http://localhost/api/upcat-questions/M001'), ctx('M001'))
    expect(res.status).toBe(403)
  })

  it('returns the question keyed by question_id', async () => {
    adminUser()
    mockQuestionSingle.mockResolvedValueOnce({ data: EXISTING_QUESTION, error: null })
    const { GET } = await import('../route')
    const res = await GET(new NextRequest('http://localhost/api/upcat-questions/M001'), ctx('M001'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.question.question_id).toBe('M001')
    expect(lastSelectEq).toEqual(['question_id', 'M001'])
  })

  it('returns 404 when the question does not exist', async () => {
    adminUser()
    mockQuestionSingle.mockResolvedValueOnce({ data: null, error: null })
    const { GET } = await import('../route')
    const res = await GET(new NextRequest('http://localhost/api/upcat-questions/NOPE'), ctx('NOPE'))
    expect(res.status).toBe(404)
  })
})

// ── PATCH /api/upcat-questions/[id] ──────────────────────────────────────────

describe('PATCH /api/upcat-questions/[id]', () => {
  beforeEach(() => resetAll())

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('M001', { question_text: 'x' }), ctx('M001'))
    expect(res.status).toBe(401)
  })

  it('returns 403 when non-admin', async () => {
    nonAdmin()
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('M001', { question_text: 'x' }), ctx('M001'))
    expect(res.status).toBe(403)
  })

  it('updates whitelisted fields, sets updated_at, keys on question_id', async () => {
    adminUser()
    mockUpdate.mockResolvedValueOnce({ error: null })
    const { PATCH } = await import('../route')
    const res = await PATCH(
      patchReq('M001', {
        question_text: 'What is 3+3?',
        options: ['4', '5', '6', '7'],
        correct_index: 2,
        explanation: 'Updated.',
        status: 'draft',
      }),
      ctx('M001'),
    )
    expect(res.status).toBe(200)
    expect(lastUpdateEq).toEqual(['question_id', 'M001'])
    expect(lastUpdateArg).toMatchObject({
      question_text: 'What is 3+3?',
      options: ['4', '5', '6', '7'],
      correct_index: 2,
      explanation: 'Updated.',
      status: 'draft',
    })
    expect(typeof lastUpdateArg!.updated_at).toBe('string')
  })

  it('strips non-whitelisted fields (mass-assignment protection)', async () => {
    adminUser()
    mockUpdate.mockResolvedValueOnce({ error: null })
    const { PATCH } = await import('../route')
    const res = await PATCH(
      patchReq('M001', {
        question_text: 'ok',
        question_id: 'HACKED',
        subtest: 'science',
        injected_col: 'DROP TABLE--',
      }),
      ctx('M001'),
    )
    expect(res.status).toBe(200)
    expect(lastUpdateArg).not.toHaveProperty('question_id')
    expect(lastUpdateArg).not.toHaveProperty('subtest')
    expect(lastUpdateArg).not.toHaveProperty('injected_col')
  })

  it('returns 400 when options has fewer than 4 entries', async () => {
    adminUser()
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('M001', { options: ['a', 'b', 'c'], correct_index: 0 }), ctx('M001'))
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns 400 when options contains non-string or empty entries', async () => {
    const { PATCH } = await import('../route')
    adminUser()
    const res1 = await PATCH(patchReq('M001', { options: ['a', 'b', 'c', 42], correct_index: 0 }), ctx('M001'))
    expect(res1.status).toBe(400)
    adminUser()
    const res2 = await PATCH(patchReq('M001', { options: ['a', 'b', 'c', '  '], correct_index: 0 }), ctx('M001'))
    expect(res2.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns 400 when correct_index is out of bounds of the provided options', async () => {
    adminUser()
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('M001', { options: ['a', 'b', 'c', 'd'], correct_index: 7 }), ctx('M001'))
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns 400 when correct_index is negative or not an integer', async () => {
    const { PATCH } = await import('../route')
    adminUser()
    const res1 = await PATCH(patchReq('M001', { options: ['a', 'b', 'c', 'd'], correct_index: -1 }), ctx('M001'))
    expect(res1.status).toBe(400)
    adminUser()
    const res2 = await PATCH(patchReq('M001', { options: ['a', 'b', 'c', 'd'], correct_index: 1.5 }), ctx('M001'))
    expect(res2.status).toBe(400)
    adminUser()
    const res3 = await PATCH(patchReq('M001', { options: ['a', 'b', 'c', 'd'], correct_index: '2' }), ctx('M001'))
    expect(res3.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('validates correct_index against the existing options when options not in patch', async () => {
    adminUser()
    // Existing question has 4 options → correct_index 5 is out of bounds
    mockQuestionSingle.mockResolvedValueOnce({ data: EXISTING_QUESTION, error: null })
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('M001', { correct_index: 5 }), ctx('M001'))
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('accepts a valid correct_index-only patch against existing options', async () => {
    adminUser()
    mockQuestionSingle.mockResolvedValueOnce({ data: EXISTING_QUESTION, error: null })
    mockUpdate.mockResolvedValueOnce({ error: null })
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('M001', { correct_index: 1 }), ctx('M001'))
    expect(res.status).toBe(200)
    expect(lastUpdateArg).toHaveProperty('correct_index', 1)
  })

  it('accepts an options-only patch (4+ entries always cover the 0-3 index range)', async () => {
    adminUser()
    // The DB CHECK caps correct_index at 0..3 and options must have >= 4
    // entries, so a valid options-only replacement can never orphan the
    // existing correct_index — no extra row fetch is needed.
    mockUpdate.mockResolvedValueOnce({ error: null })
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('M001', { options: ['a', 'b', 'c', 'd'] }), ctx('M001'))
    expect(res.status).toBe(200)
    expect(lastUpdateArg).toHaveProperty('options')
  })

  it('returns 400 for an invalid status value', async () => {
    adminUser()
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('M001', { status: 'archived' }), ctx('M001'))
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns 400 when question_text is empty', async () => {
    adminUser()
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('M001', { question_text: '   ' }), ctx('M001'))
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns 400 when no updatable fields are provided', async () => {
    adminUser()
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('M001', { subtest: 'science' }), ctx('M001'))
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns 500 when DB update fails', async () => {
    adminUser()
    mockUpdate.mockResolvedValueOnce({ error: { message: 'DB fail' } })
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('M001', { explanation: 'x' }), ctx('M001'))
    expect(res.status).toBe(500)
  })
})

// ── DELETE /api/upcat-questions/[id] ─────────────────────────────────────────

describe('DELETE /api/upcat-questions/[id]', () => {
  beforeEach(() => resetAll())

  function deleteReq(id: string) {
    return new NextRequest(`http://localhost/api/upcat-questions/${id}`, { method: 'DELETE' })
  }

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { DELETE } = await import('../route')
    const res = await DELETE(deleteReq('M001'), ctx('M001'))
    expect(res.status).toBe(401)
  })

  it('returns 403 when non-admin', async () => {
    nonAdmin()
    const { DELETE } = await import('../route')
    const res = await DELETE(deleteReq('M001'), ctx('M001'))
    expect(res.status).toBe(403)
  })

  it('deletes by question_id and returns 200', async () => {
    adminUser()
    mockDelete.mockResolvedValueOnce({ error: null })
    const { DELETE } = await import('../route')
    const res = await DELETE(deleteReq('M001'), ctx('M001'))
    expect(res.status).toBe(200)
    expect(lastDeleteEq).toEqual(['question_id', 'M001'])
  })

  it('returns 500 when DB delete fails', async () => {
    adminUser()
    mockDelete.mockResolvedValueOnce({ error: { message: 'DB fail' } })
    const { DELETE } = await import('../route')
    const res = await DELETE(deleteReq('M001'), ctx('M001'))
    expect(res.status).toBe(500)
  })
})
