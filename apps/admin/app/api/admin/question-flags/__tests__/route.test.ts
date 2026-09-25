import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fake-anon-key')

const mockGetUser = vi.fn()
vi.mock('@/lib/supabase', () => ({
  createAuthClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

const mockProfileSingle = vi.fn()
const mockUpsert = vi.fn()
const mockDelete = vi.fn()
let deleteEqs: Array<[string, unknown]> = []

function makeChain(table: string): unknown {
  if (table === 'profiles') {
    return { select: () => ({ eq: () => ({ single: mockProfileSingle }) }) }
  }
  if (table === 'question_flag_dismissals') {
    return {
      upsert: (row: unknown, opts: unknown) => Promise.resolve(mockUpsert(row, opts)),
      delete: () => {
        const chain = {
          eq(col: string, val: unknown) {
            deleteEqs.push([col, val])
            return deleteEqs.length >= 2 ? Promise.resolve(mockDelete(deleteEqs)) : chain
          },
        }
        return chain
      },
    }
  }
  throw new Error(`Unexpected table: ${table}`)
}

const mockFrom = vi.fn((table: string) => makeChain(table))
vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))

// requireAdmin calls getUser once; the route reads the user again for dismissed_by.
function adminUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  mockProfileSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
}
function noUser() { mockGetUser.mockResolvedValue({ data: { user: null } }) }
function nonAdmin() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u2' } } })
  mockProfileSingle.mockResolvedValueOnce({ data: { role: 'student' }, error: null })
}

const FP = '0a1b2c3d'
const post = (body: unknown) =>
  new NextRequest('http://localhost/api/admin/question-flags', {
    method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
const del = (qs: string, body?: unknown) =>
  new NextRequest(`http://localhost/api/admin/question-flags${qs}`, {
    method: 'DELETE', ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  })

async function load() { return import('../route') }

beforeEach(() => {
  vi.resetModules()
  mockGetUser.mockReset()
  mockProfileSingle.mockReset()
  mockUpsert.mockReset()
  mockDelete.mockReset()
  mockFrom.mockClear()
  deleteEqs = []
})

describe('POST /api/admin/question-flags', () => {
  it('refuses a signed-out caller with 401', async () => {
    noUser()
    const { POST } = await load()
    expect((await POST(post({ question_id: 'M001', options_fingerprint: FP }))).status).toBe(401)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('refuses a non-admin with 403', async () => {
    nonAdmin()
    const { POST } = await load()
    expect((await POST(post({ question_id: 'M001', options_fingerprint: FP }))).status).toBe(403)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it.each([
    ['invalid JSON', 'not json'],
    ['missing question_id', { options_fingerprint: FP }],
    ['blank question_id', { question_id: '  ', options_fingerprint: FP }],
    ['bad fingerprint', { question_id: 'M001', options_fingerprint: 'xyz' }],
    ['non-string fingerprint', { question_id: 'M001', options_fingerprint: 12345678 }],
  ])('rejects %s with 400', async (_name, body) => {
    adminUser()
    const { POST } = await load()
    const res = await POST(post(body))
    expect(res.status).toBe(400)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('upserts the dismissal with the admin as dismissed_by', async () => {
    adminUser()
    mockUpsert.mockReturnValue({ error: null })
    const { POST } = await load()
    const res = await POST(post({ question_id: 'M001', options_fingerprint: FP }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    const [row, opts] = mockUpsert.mock.calls[0]!
    expect(row).toMatchObject({ question_id: 'M001', options_fingerprint: FP, dismissed_by: 'admin-1' })
    expect(typeof (row as { dismissed_at: unknown }).dismissed_at).toBe('string')
    expect(opts).toEqual({ onConflict: 'question_id,options_fingerprint' })
  })

  it('maps a database error to 500', async () => {
    adminUser()
    mockUpsert.mockReturnValue({ error: { message: 'relation does not exist' } })
    const { POST } = await load()
    const res = await POST(post({ question_id: 'M001', options_fingerprint: FP }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Database error')
  })
})

describe('DELETE /api/admin/question-flags', () => {
  it('refuses a non-admin with 403', async () => {
    nonAdmin()
    const { DELETE } = await load()
    expect((await DELETE(del(`?question_id=M001&options_fingerprint=${FP}`))).status).toBe(403)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('rejects missing keys with 400', async () => {
    adminUser()
    const { DELETE } = await load()
    expect((await DELETE(del('?question_id=M001'))).status).toBe(400)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('deletes by question id and fingerprint from the query string', async () => {
    adminUser()
    mockDelete.mockReturnValue({ error: null })
    const { DELETE } = await load()
    const res = await DELETE(del(`?question_id=M001&options_fingerprint=${FP}`))
    expect(res.status).toBe(200)
    expect(deleteEqs).toEqual([['question_id', 'M001'], ['options_fingerprint', FP]])
  })

  it('accepts the keys as a JSON body', async () => {
    adminUser()
    mockDelete.mockReturnValue({ error: null })
    const { DELETE } = await load()
    const res = await DELETE(del('', { question_id: 'S002', options_fingerprint: FP }))
    expect(res.status).toBe(200)
    expect(deleteEqs).toEqual([['question_id', 'S002'], ['options_fingerprint', FP]])
  })

  it('maps a database error to 500', async () => {
    adminUser()
    mockDelete.mockReturnValue({ error: { message: 'boom' } })
    const { DELETE } = await load()
    expect((await DELETE(del(`?question_id=M001&options_fingerprint=${FP}`))).status).toBe(500)
  })
})
