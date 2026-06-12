import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fake-anon-key')

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}))

// ── Auth client mock ─────────────────────────────────────────────────────────
const mockGetUser = vi.fn()
vi.mock('@/lib/supabase', () => ({
  createAuthClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

// ── Chainable Supabase mock ──────────────────────────────────────────────────
const mockProfileSingle = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()

let lastUpdateArg: Record<string, unknown> | undefined
let lastUpdateEqCol: string | undefined
let lastUpdateEqVal: unknown
let lastDeleteEqCol: string | undefined
let lastDeleteEqVal: unknown

function makeChain(table: string): any {
  if (table === 'profiles') {
    return {
      select(_c: string) {
        return {
          eq(_col: string, _val: unknown) {
            return { single: mockProfileSingle }
          },
        }
      },
    }
  }

  // flashcards table
  return {
    update(data: Record<string, unknown>) {
      lastUpdateArg = data
      return {
        eq(col: string, val: unknown) {
          lastUpdateEqCol = col
          lastUpdateEqVal = val
          return Promise.resolve(mockUpdate(data, col, val))
        },
      }
    },
    delete() {
      return {
        eq(col: string, val: unknown) {
          lastDeleteEqCol = col
          lastDeleteEqVal = val
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
  mockUpdate.mockReset()
  mockDelete.mockReset()
  lastUpdateArg = undefined
  lastUpdateEqCol = undefined
  lastUpdateEqVal = undefined
  lastDeleteEqCol = undefined
  lastDeleteEqVal = undefined
}

function makeIdContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makePatchReq(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/flashcards/cards/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeDeleteReq(id: string) {
  return new NextRequest(`http://localhost/api/flashcards/cards/${id}`, {
    method: 'DELETE',
  })
}

// ── PATCH /api/flashcards/cards/[id] ────────────────────────────────────────

describe('PATCH /api/flashcards/cards/[id]', () => {
  beforeEach(() => resetAll())

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { PATCH } = await import('../route')
    const res = await PATCH(makePatchReq('card-1', { question: 'Q?' }), makeIdContext('card-1'))
    expect(res.status).toBe(401)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns 403 when signed-in non-admin', async () => {
    nonAdmin()
    const { PATCH } = await import('../route')
    const res = await PATCH(makePatchReq('card-1', { question: 'Q?' }), makeIdContext('card-1'))
    expect(res.status).toBe(403)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('allows admin to update question field and returns 200', async () => {
    adminUser()
    mockUpdate.mockResolvedValueOnce({ error: null })
    const { PATCH } = await import('../route')
    const res = await PATCH(makePatchReq('card-1', { question: 'New question?' }), makeIdContext('card-1'))
    expect(res.status).toBe(200)
    expect(lastUpdateArg).toMatchObject({ question: 'New question?' })
    expect(lastUpdateEqCol).toBe('id')
    expect(lastUpdateEqVal).toBe('card-1')
  })

  it('allows admin to update answer field and returns 200', async () => {
    adminUser()
    mockUpdate.mockResolvedValueOnce({ error: null })
    const { PATCH } = await import('../route')
    const res = await PATCH(makePatchReq('card-1', { answer: 'New answer' }), makeIdContext('card-1'))
    expect(res.status).toBe(200)
    expect(lastUpdateArg).toMatchObject({ answer: 'New answer' })
  })

  it('allows admin to update explanation field and returns 200', async () => {
    adminUser()
    mockUpdate.mockResolvedValueOnce({ error: null })
    const { PATCH } = await import('../route')
    const res = await PATCH(makePatchReq('card-1', { explanation: 'Because...' }), makeIdContext('card-1'))
    expect(res.status).toBe(200)
    expect(lastUpdateArg).toMatchObject({ explanation: 'Because...' })
  })

  it('returns 400 when no updatable fields provided', async () => {
    adminUser()
    const { PATCH } = await import('../route')
    const res = await PATCH(makePatchReq('card-1', {}), makeIdContext('card-1'))
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns 400 when question is empty string', async () => {
    adminUser()
    const { PATCH } = await import('../route')
    const res = await PATCH(makePatchReq('card-1', { question: '   ' }), makeIdContext('card-1'))
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns 400 when answer is empty string', async () => {
    adminUser()
    const { PATCH } = await import('../route')
    const res = await PATCH(makePatchReq('card-1', { answer: '' }), makeIdContext('card-1'))
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('only updates whitelisted fields (mass-assignment protection)', async () => {
    adminUser()
    mockUpdate.mockResolvedValueOnce({ error: null })
    const { PATCH } = await import('../route')
    const res = await PATCH(
      makePatchReq('card-1', {
        question: 'Q?',
        answer: 'A',
        topic_id: 'hacked',
        status: 'unpublished',
        listing_slugs: ['evil'],
      }),
      makeIdContext('card-1'),
    )
    expect(res.status).toBe(200)
    expect(Object.keys(lastUpdateArg!).sort()).toEqual(['answer', 'question'])
  })

  it('returns 500 when DB update fails', async () => {
    adminUser()
    mockUpdate.mockResolvedValueOnce({ error: { message: 'DB fail' } })
    const { PATCH } = await import('../route')
    const res = await PATCH(makePatchReq('card-1', { question: 'Q?' }), makeIdContext('card-1'))
    expect(res.status).toBe(500)
  })
})

// ── DELETE /api/flashcards/cards/[id] ───────────────────────────────────────

describe('DELETE /api/flashcards/cards/[id]', () => {
  beforeEach(() => resetAll())

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { DELETE } = await import('../route')
    const res = await DELETE(makeDeleteReq('card-1'), makeIdContext('card-1'))
    expect(res.status).toBe(401)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('returns 403 when signed-in non-admin', async () => {
    nonAdmin()
    const { DELETE } = await import('../route')
    const res = await DELETE(makeDeleteReq('card-1'), makeIdContext('card-1'))
    expect(res.status).toBe(403)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('allows admin to delete card and returns 200', async () => {
    adminUser()
    mockDelete.mockResolvedValueOnce({ error: null })
    const { DELETE } = await import('../route')
    const res = await DELETE(makeDeleteReq('card-42'), makeIdContext('card-42'))
    expect(res.status).toBe(200)
    expect(lastDeleteEqCol).toBe('id')
    expect(lastDeleteEqVal).toBe('card-42')
  })

  it('returns 500 when DB delete fails', async () => {
    adminUser()
    mockDelete.mockResolvedValueOnce({ error: { message: 'DB fail' } })
    const { DELETE } = await import('../route')
    const res = await DELETE(makeDeleteReq('card-1'), makeIdContext('card-1'))
    expect(res.status).toBe(500)
  })
})
