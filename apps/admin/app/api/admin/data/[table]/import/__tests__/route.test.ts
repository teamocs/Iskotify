import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fake-anon-key')

// ── Auth client mock ────────────────────────────────────────────────────────
const mockGetUser = vi.fn()
vi.mock('@/lib/supabase', () => ({
  createAuthClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

// ── Service client mock (profiles gate + data-table upsert path) ─────────────
const mockSingle = vi.fn()
const mockUpsert = vi.fn()

function makeChain(table: string): any {
  if (table === 'profiles') {
    return { select() { return { eq() { return { single: mockSingle } } } } }
  }
  return {
    select() {
      return { order() { return { range: () => Promise.resolve({ data: [], error: null }) } } }
    },
    upsert(chunk: unknown) { return Promise.resolve(mockUpsert(chunk)) },
  }
}

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({ from: (t: string) => makeChain(t) })),
}))

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

function makeReq(table: string, file: File | null) {
  const fd = new FormData()
  if (file) fd.append('file', file)
  return new NextRequest(`http://localhost/api/admin/data/${table}/import`, { method: 'POST', body: fd })
}
function makeContext(table: string) {
  return { params: Promise.resolve({ table }) }
}

describe('POST /api/admin/data/[table]/import', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetUser.mockReset()
    mockSingle.mockReset()
    mockUpsert.mockReset()
    mockUpsert.mockResolvedValue({ error: null })
  })

  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { POST } = await import('../route')
    const res = await POST(makeReq('upcat_facts', new File(['topic\nx'], 'a.csv')), makeContext('upcat_facts'))
    expect(res.status).toBe(401)
  })

  it('returns 403 when non-admin', async () => {
    nonAdmin()
    const { POST } = await import('../route')
    const res = await POST(makeReq('upcat_facts', new File(['topic\nx'], 'a.csv')), makeContext('upcat_facts'))
    expect(res.status).toBe(403)
  })

  it('returns 400 for unknown table', async () => {
    adminUser()
    const { POST } = await import('../route')
    const res = await POST(makeReq('secret_table', new File(['x'], 'a.csv')), makeContext('secret_table'))
    expect(res.status).toBe(400)
  })

  it('returns 400 when no file is uploaded', async () => {
    adminUser()
    const { POST } = await import('../route')
    const res = await POST(makeReq('upcat_facts', null), makeContext('upcat_facts'))
    expect(res.status).toBe(400)
  })

  it('returns 400 when the file has no data rows', async () => {
    adminUser()
    const { POST } = await import('../route')
    const res = await POST(makeReq('upcat_facts', new File(['topic,question,answer\n'], 'a.csv')), makeContext('upcat_facts'))
    expect(res.status).toBe(400)
  })

  it('imports a CSV file', async () => {
    adminUser()
    const { POST } = await import('../route')
    const csv = 'topic,question,answer\nGeneral,What is UPCAT,An exam'
    const res = await POST(makeReq('upcat_facts', new File([csv], 'facts.csv', { type: 'text/csv' })), makeContext('upcat_facts'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.inserted).toBe(1)
    expect(mockUpsert).toHaveBeenCalledTimes(1)
  })

  it('imports a JSON file (array of rows)', async () => {
    adminUser()
    const { POST } = await import('../route')
    const body = JSON.stringify([{ topic: 'T', question: 'Q', answer: 'A' }])
    const res = await POST(makeReq('upcat_facts', new File([body], 'facts.json', { type: 'application/json' })), makeContext('upcat_facts'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.inserted).toBe(1)
  })
})
