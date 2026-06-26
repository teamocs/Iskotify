import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fake-anon-key')

// ── Auth client mock ────────────────────────────────────────────────────────
const mockGetUser = vi.fn()
vi.mock('@/lib/supabase', () => ({
  createAuthClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

// ── Chainable Supabase mock ─────────────────────────────────────────────────
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockSingle = vi.fn()
const mockRange = vi.fn()

// Captured args for assertions
let lastInsertArg: unknown
let lastUpdateArg: unknown
let lastUpdateEqVal: unknown

function makeChain(table: string): any {
  if (table === 'profiles') {
    return {
      select(_c: string) {
        return { eq(_col: string, _val: unknown) { return { single: mockSingle } } }
      },
    }
  }

  // Generic data table chain
  return {
    select(_cols: string, _opts?: unknown) {
      return {
        or(_filter: string) { return this },
        order(_col: string) { return this },
        range(from: number, to: number) {
          return Promise.resolve(mockRange(from, to))
        },
      }
    },
    insert(row: unknown) {
      lastInsertArg = row
      return Promise.resolve(mockInsert(row))
    },
    update(data: unknown) {
      lastUpdateArg = data
      return {
        eq(_col: string, val: unknown) {
          lastUpdateEqVal = val
          return Promise.resolve(mockUpdate(data, _col, val))
        },
      }
    },
    delete() {
      return {
        eq(_col: string, val: unknown) {
          return Promise.resolve(mockDelete(_col, val))
        },
      }
    },
  }
}

const mockFrom = vi.fn((table: string) => makeChain(table))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))

// ── Helpers ─────────────────────────────────────────────────────────────────

function adminUser() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'admin-1' } } })
  mockSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
}

function noUser() {
  mockGetUser.mockResolvedValueOnce({ data: { user: null } })
}

function nonAdmin() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u2' } } })
  mockSingle.mockResolvedValueOnce({ data: { role: 'viewer' }, error: null })
}

function makeGetReq(tableParam: string, extra = '') {
  return new NextRequest(`http://localhost/api/admin/data/${tableParam}${extra}`)
}

function makePostReq(tableParam: string, body: unknown) {
  return new NextRequest(`http://localhost/api/admin/data/${tableParam}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makePatchReq(tableParam: string, id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/admin/data/${tableParam}?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeDeleteReq(tableParam: string, id?: string) {
  const qs = id ? `?id=${encodeURIComponent(id)}` : ''
  return new NextRequest(`http://localhost/api/admin/data/${tableParam}${qs}`, { method: 'DELETE' })
}

function makeContext(table: string) {
  return { params: Promise.resolve({ table }) }
}

// ── GET tests ────────────────────────────────────────────────────────────────

describe('GET /api/admin/data/[table]', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetUser.mockReset()
    mockSingle.mockReset()
    mockFrom.mockClear()
    mockRange.mockReset()
    mockInsert.mockReset()
    mockUpdate.mockReset()
    mockDelete.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { GET } = await import('../[table]/route')
    const res = await GET(makeGetReq('upcat_facts'), makeContext('upcat_facts'))
    expect(res.status).toBe(401)
  })

  it('returns 403 when non-admin', async () => {
    nonAdmin()
    const { GET } = await import('../[table]/route')
    const res = await GET(makeGetReq('upcat_facts'), makeContext('upcat_facts'))
    expect(res.status).toBe(403)
  })

  it('returns 400 for unknown table', async () => {
    adminUser()
    const { GET } = await import('../[table]/route')
    const res = await GET(makeGetReq('secret_table'), makeContext('secret_table'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Unknown table')
  })

  it('returns rows and count for a known table', async () => {
    adminUser()
    mockRange.mockResolvedValueOnce({
      data: [{ id: 'uuid-1', topic: 'UPCAT', question: 'What is UPCAT?' }],
      count: 1,
      error: null,
    })
    const { GET } = await import('../[table]/route')
    const res = await GET(makeGetReq('upcat_facts'), makeContext('upcat_facts'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.rows).toHaveLength(1)
    expect(json.count).toBe(1)
  })

  it('supports search query param', async () => {
    adminUser()
    mockRange.mockResolvedValueOnce({ data: [], count: 0, error: null })
    const { GET } = await import('../[table]/route')
    const res = await GET(makeGetReq('upcat_facts', '?search=foo'), makeContext('upcat_facts'))
    expect(res.status).toBe(200)
  })

  it('sanitizes injection chars before building .or() — structural chars stripped', async () => {
    // Capture the or() argument so we can assert sanitization
    let capturedOrArg: string | undefined
    const localFrom = vi.fn((table: string) => {
      if (table === 'profiles') return makeChain('profiles')
      return {
        select(_cols: string, _opts?: unknown) {
          return {
            or(filter: string) { capturedOrArg = filter; return this },
            order(_col: string) { return this },
            range(from: number, to: number) {
              return Promise.resolve({ data: [], count: 0, error: null })
            },
          }
        },
      }
    })
    // Temporarily override the module mock for this test
    const { createServerClient } = await import('@iskotify/utils')
    const origImpl = (createServerClient as ReturnType<typeof vi.fn>).getMockImplementation()
    ;(createServerClient as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({ from: localFrom }))

    adminUser()
    const { GET } = await import('../[table]/route')
    // Malicious search: contains structural .or() DSL chars
    const malicious = encodeURIComponent('%,verified.eq.true,(')
    const res = await GET(makeGetReq('upcat_facts', `?search=${malicious}`), makeContext('upcat_facts'))
    expect(res.status).toBe(200)

    // The .or() argument IS built — but the user's injected chars must be stripped
    // from inside the ilike values. Extract what's between %...% delimiters.
    if (capturedOrArg !== undefined) {
      // Each part looks like: col.ilike.%<sanitized>%
      // Extract the content inside %...% and assert no structural chars remain
      const ilikeParts = capturedOrArg.match(/%([^%]*)%/g) ?? []
      for (const part of ilikeParts) {
        // strip the surrounding % markers
        const inner = part.slice(1, -1)
        expect(inner).not.toMatch(/[%,()]/)
      }
    }
  })

  it('skips .or() entirely when search is empty after sanitization', async () => {
    let orCalled = false
    const localFrom = vi.fn((table: string) => {
      if (table === 'profiles') return makeChain('profiles')
      return {
        select(_cols: string, _opts?: unknown) {
          return {
            or(_filter: string) { orCalled = true; return this },
            order(_col: string) { return this },
            range(from: number, to: number) {
              return Promise.resolve({ data: [], count: 0, error: null })
            },
          }
        },
      }
    })
    const { createServerClient } = await import('@iskotify/utils')
    ;(createServerClient as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({ from: localFrom }))

    adminUser()
    const { GET } = await import('../[table]/route')
    // Search that becomes empty after stripping structural chars
    const onlyStructural = encodeURIComponent('%,()')
    const res = await GET(makeGetReq('upcat_facts', `?search=${onlyStructural}`), makeContext('upcat_facts'))
    expect(res.status).toBe(200)
    expect(orCalled).toBe(false)
  })

  it('supports page param for pagination', async () => {
    adminUser()
    mockRange.mockResolvedValueOnce({ data: [], count: 200, error: null })
    const { GET } = await import('../[table]/route')
    const res = await GET(makeGetReq('upcat_facts', '?page=2'), makeContext('upcat_facts'))
    expect(res.status).toBe(200)
    // range should be called with from=100 to=149 for page 2
    expect(mockRange).toHaveBeenCalledWith(100, 149)
  })

  it('returns 500 when DB fails', async () => {
    adminUser()
    mockRange.mockResolvedValueOnce({ data: null, count: null, error: { message: 'DB fail' } })
    const { GET } = await import('../[table]/route')
    const res = await GET(makeGetReq('upcat_facts'), makeContext('upcat_facts'))
    expect(res.status).toBe(500)
  })
})

// ── POST tests ───────────────────────────────────────────────────────────────

describe('POST /api/admin/data/[table]', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetUser.mockReset()
    mockSingle.mockReset()
    mockFrom.mockClear()
    mockRange.mockReset()
    mockInsert.mockReset()
    mockUpdate.mockReset()
    mockDelete.mockReset()
    lastInsertArg = undefined
  })

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { POST } = await import('../[table]/route')
    const res = await POST(makePostReq('upcat_facts', {}), makeContext('upcat_facts'))
    expect(res.status).toBe(401)
  })

  it('returns 403 when non-admin', async () => {
    nonAdmin()
    const { POST } = await import('../[table]/route')
    const res = await POST(makePostReq('upcat_facts', {}), makeContext('upcat_facts'))
    expect(res.status).toBe(403)
  })

  it('returns 400 for unknown table', async () => {
    adminUser()
    const { POST } = await import('../[table]/route')
    const res = await POST(makePostReq('injected_table', {}), makeContext('injected_table'))
    expect(res.status).toBe(400)
  })

  it('returns 400 when text-id (course_id) is missing for career_courses', async () => {
    adminUser()
    const { POST } = await import('../[table]/route')
    // career_courses has idType: 'text' and idColumn: 'course_id'
    const res = await POST(
      makePostReq('career_courses', { name: 'Nursing', cluster: 'Health' }),
      makeContext('career_courses'),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('course_id')
  })

  it('strips non-allowlisted columns from INSERT', async () => {
    adminUser()
    mockInsert.mockResolvedValueOnce({ error: null })
    const { POST } = await import('../[table]/route')
    const res = await POST(
      makePostReq('upcat_facts', {
        topic: 'Qualifying',
        question: 'What is a UPRS?',
        answer: 'University Predicted Rating Score',
        source: 'UP',
        valid_year: 2025,
        // non-allowlisted columns that should be stripped
        injected_col: 'DROP TABLE--',
        admin_override: true,
      }),
      makeContext('upcat_facts'),
    )
    expect(res.status).toBe(201)
    const inserted = lastInsertArg as Record<string, unknown>
    expect(inserted).not.toHaveProperty('injected_col')
    expect(inserted).not.toHaveProperty('admin_override')
    expect(inserted).toHaveProperty('topic', 'Qualifying')
  })

  it('inserts with uuid auto-assigned for uuid-id table', async () => {
    adminUser()
    mockInsert.mockResolvedValueOnce({ error: null })
    const { POST } = await import('../[table]/route')
    const res = await POST(
      makePostReq('upcat_facts', {
        topic: 'General',
        question: 'Test question',
        answer: 'Test answer',
      }),
      makeContext('upcat_facts'),
    )
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(typeof json.id).toBe('string')
    expect(json.id).toHaveLength(36) // UUID format
  })

  it('returns 201 for valid career_courses POST with text id', async () => {
    adminUser()
    mockInsert.mockResolvedValueOnce({ error: null })
    const { POST } = await import('../[table]/route')
    const res = await POST(
      makePostReq('career_courses', {
        course_id: 'nursing',
        name: 'Nursing',
        cluster: 'Health Sciences',
      }),
      makeContext('career_courses'),
    )
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.id).toBe('nursing')
  })

  it('returns 500 when DB insert fails', async () => {
    adminUser()
    mockInsert.mockResolvedValueOnce({ error: { message: 'DB error' } })
    const { POST } = await import('../[table]/route')
    const res = await POST(
      makePostReq('upcat_facts', { topic: 'X', question: 'Q', answer: 'A' }),
      makeContext('upcat_facts'),
    )
    expect(res.status).toBe(500)
  })
})

// ── PATCH tests ──────────────────────────────────────────────────────────────

describe('PATCH /api/admin/data/[table]', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetUser.mockReset()
    mockSingle.mockReset()
    mockFrom.mockClear()
    mockRange.mockReset()
    mockInsert.mockReset()
    mockUpdate.mockReset()
    mockDelete.mockReset()
    lastUpdateArg = undefined
    lastUpdateEqVal = undefined
  })

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { PATCH } = await import('../[table]/route')
    const res = await PATCH(makePatchReq('upcat_facts', 'id-1', {}), makeContext('upcat_facts'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for unknown table', async () => {
    adminUser()
    const { PATCH } = await import('../[table]/route')
    const res = await PATCH(makePatchReq('unknown_table', 'id-1', {}), makeContext('unknown_table'))
    expect(res.status).toBe(400)
  })

  it('returns 400 when id param missing', async () => {
    adminUser()
    const { PATCH } = await import('../[table]/route')
    const req = new NextRequest(`http://localhost/api/admin/data/upcat_facts`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: 'X' }),
    })
    const res = await PATCH(req, makeContext('upcat_facts'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('id')
  })

  it('strips non-allowlisted columns from UPDATE', async () => {
    adminUser()
    mockUpdate.mockResolvedValueOnce({ error: null })
    const { PATCH } = await import('../[table]/route')
    const res = await PATCH(
      makePatchReq('upcat_facts', 'uuid-1', {
        topic: 'Updated topic',
        question: 'New question',
        injected_col: 'DROP TABLE--',
        admin_override: true,
      }),
      makeContext('upcat_facts'),
    )
    expect(res.status).toBe(200)
    const updated = lastUpdateArg as Record<string, unknown>
    expect(updated).not.toHaveProperty('injected_col')
    expect(updated).not.toHaveProperty('admin_override')
    expect(updated).toHaveProperty('topic', 'Updated topic')
  })

  it('sets updated_at on PATCH', async () => {
    adminUser()
    mockUpdate.mockResolvedValueOnce({ error: null })
    const { PATCH } = await import('../[table]/route')
    await PATCH(
      makePatchReq('upcat_facts', 'uuid-1', { topic: 'X' }),
      makeContext('upcat_facts'),
    )
    const updated = lastUpdateArg as Record<string, unknown>
    expect(typeof updated.updated_at).toBe('string')
  })

  it('does not include idColumn in update payload', async () => {
    adminUser()
    mockUpdate.mockResolvedValueOnce({ error: null })
    const { PATCH } = await import('../[table]/route')
    await PATCH(
      makePatchReq('career_courses', 'nursing', {
        course_id: 'nursing',
        name: 'Updated Nursing',
      }),
      makeContext('career_courses'),
    )
    const updated = lastUpdateArg as Record<string, unknown>
    expect(updated).not.toHaveProperty('course_id')
    expect(updated).toHaveProperty('name', 'Updated Nursing')
  })

  it('returns 200 on successful update', async () => {
    adminUser()
    mockUpdate.mockResolvedValueOnce({ error: null })
    const { PATCH } = await import('../[table]/route')
    const res = await PATCH(
      makePatchReq('upcat_cutoffs', 'uuid-2', { campus: 'Diliman', program: 'CS' }),
      makeContext('upcat_cutoffs'),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
  })

  it('returns 500 when DB update fails', async () => {
    adminUser()
    mockUpdate.mockResolvedValueOnce({ error: { message: 'DB fail' } })
    const { PATCH } = await import('../[table]/route')
    const res = await PATCH(
      makePatchReq('upcat_facts', 'uuid-1', { topic: 'X' }),
      makeContext('upcat_facts'),
    )
    expect(res.status).toBe(500)
  })
})

// ── DELETE tests ─────────────────────────────────────────────────────────────

describe('DELETE /api/admin/data/[table]', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetUser.mockReset()
    mockSingle.mockReset()
    mockFrom.mockClear()
    mockRange.mockReset()
    mockInsert.mockReset()
    mockUpdate.mockReset()
    mockDelete.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { DELETE } = await import('../[table]/route')
    const res = await DELETE(makeDeleteReq('upcat_facts', 'uuid-1'), makeContext('upcat_facts'))
    expect(res.status).toBe(401)
  })

  it('returns 403 when non-admin', async () => {
    nonAdmin()
    const { DELETE } = await import('../[table]/route')
    const res = await DELETE(makeDeleteReq('upcat_facts', 'uuid-1'), makeContext('upcat_facts'))
    expect(res.status).toBe(403)
  })

  it('returns 400 for unknown table', async () => {
    adminUser()
    const { DELETE } = await import('../[table]/route')
    const res = await DELETE(makeDeleteReq('evil_table', 'id-1'), makeContext('evil_table'))
    expect(res.status).toBe(400)
  })

  it('returns 400 when id param missing', async () => {
    adminUser()
    const { DELETE } = await import('../[table]/route')
    const res = await DELETE(makeDeleteReq('upcat_facts'), makeContext('upcat_facts'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('id')
  })

  it('deletes and returns 200', async () => {
    adminUser()
    mockDelete.mockResolvedValueOnce({ error: null })
    const { DELETE } = await import('../[table]/route')
    const res = await DELETE(makeDeleteReq('upcat_facts', 'uuid-1'), makeContext('upcat_facts'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(mockDelete).toHaveBeenCalledWith('id', 'uuid-1')
  })

  it('returns 500 when DB delete fails', async () => {
    adminUser()
    mockDelete.mockResolvedValueOnce({ error: { message: 'DB fail' } })
    const { DELETE } = await import('../[table]/route')
    const res = await DELETE(makeDeleteReq('upcat_facts', 'uuid-1'), makeContext('upcat_facts'))
    expect(res.status).toBe(500)
  })
})

// ── GET export branch (?export=1) ─────────────────────────────────────────────

describe('GET /api/admin/data/[table]?export=1', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetUser.mockReset()
    mockSingle.mockReset()
    mockFrom.mockClear()
    mockRange.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { GET } = await import('../[table]/route')
    const res = await GET(makeGetReq('upcat_facts', '?export=1&format=csv'), makeContext('upcat_facts'))
    expect(res.status).toBe(401)
  })

  it('exports CSV with header + rows and a download disposition', async () => {
    adminUser()
    mockRange.mockResolvedValueOnce({ data: [{ id: 'uuid-1', topic: 'General', question: 'Q', answer: 'A' }], error: null })
    const { GET } = await import('../[table]/route')
    const res = await GET(makeGetReq('upcat_facts', '?export=1&format=csv'), makeContext('upcat_facts'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toContain('attachment')
    const body = await res.text()
    expect(body).toContain('topic')
    expect(body).toContain('General')
  })

  it('exports JSON as an array', async () => {
    adminUser()
    mockRange.mockResolvedValueOnce({ data: [{ id: 'uuid-1', topic: 'General' }], error: null })
    const { GET } = await import('../[table]/route')
    const res = await GET(makeGetReq('upcat_facts', '?export=1&format=json'), makeContext('upcat_facts'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    const json = await res.json()
    expect(Array.isArray(json)).toBe(true)
    expect(json[0].topic).toBe('General')
  })
})
