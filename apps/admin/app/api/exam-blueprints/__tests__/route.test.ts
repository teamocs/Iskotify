import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fake-anon-key')

// ---- Auth client mock ----
const mockGetUser = vi.fn()
vi.mock('@/lib/supabase', () => ({
  createAuthClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

// ---- Chainable supabase mock helpers ----
// We need to support:
//   .from('profiles').select('role').eq('id', uid).single()  → { data: { role } }
//   .from('exam_blueprints').select('*').order('display_order') → { data: [] }
//   .from('exam_blueprints').upsert({...}, {onConflict}) → { error: null }
//   .from('exam_blueprint_sections').delete().eq(...) → { error: null }
//   .from('exam_blueprint_sections').insert([...]) → { error: null }
//   .from('exam_course_notes').delete().eq(...) → { error: null }
//   .from('exam_course_notes').insert([...]) → { error: null }
//   .from('exam_blueprints').delete().eq('slug', slug) → { error: null }

const mockUpsert = vi.fn()
const mockInsert = vi.fn()
const mockDeleteEq = vi.fn()
const mockProfileSingle = vi.fn()
const mockSelectOrder = vi.fn()

// Track what tables were called for upsert/insert/delete
const upsertCalls: { table: string; data: any }[] = []
const insertCalls: { table: string; rows: any }[] = []
const deleteCalls: { table: string; col: string; val: any }[] = []

function makeChain(table: string): any {
  const chain: any = {
    select(_cols: string) {
      if (table === 'profiles') {
        return {
          eq(_col: string, _val: any) {
            return { single: mockProfileSingle }
          },
        }
      }
      // exam_* selects return order chain resolving to { data: [], error: null }
      return {
        order(_col: string) {
          return Promise.resolve(mockSelectOrder())
        },
      }
    },
    upsert(data: any, _opts?: any) {
      upsertCalls.push({ table, data })
      return Promise.resolve(mockUpsert())
    },
    insert(rows: any) {
      insertCalls.push({ table, rows })
      return Promise.resolve(mockInsert())
    },
    delete() {
      return {
        eq(col: string, val: any) {
          deleteCalls.push({ table, col, val })
          return Promise.resolve(mockDeleteEq())
        },
      }
    },
  }
  return chain
}

const mockFrom = vi.fn((table: string) => makeChain(table))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

function makeReq(method: string, body?: object, search?: string) {
  const url = `http://localhost/api/exam-blueprints${search ?? ''}`
  return new NextRequest(url, {
    method,
    body: body != null ? JSON.stringify(body) : undefined,
    headers: body != null ? { 'Content-Type': 'application/json' } : {},
  })
}

describe('GET /api/exam-blueprints', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetUser.mockClear()
    mockProfileSingle.mockClear()
    mockFrom.mockClear()
    upsertCalls.length = 0
    insertCalls.length = 0
    deleteCalls.length = 0
    mockUpsert.mockReset()
    mockInsert.mockReset()
    mockDeleteEq.mockReset()
    mockSelectOrder.mockReset()
  })

  it('returns 403 when profiles.role is not admin', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-1' } } })
    mockProfileSingle.mockResolvedValueOnce({ data: { role: 'viewer' }, error: null })
    const { GET } = await import('../route')
    const res = await GET()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/Forbidden/i)
  })

  it('returns 401 when no user is found', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const { GET } = await import('../route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns blueprint data for admin user', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'admin-1' } } })
    mockProfileSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
    mockSelectOrder.mockReturnValue({ data: [], error: null })
    const { GET } = await import('../route')
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('blueprints')
    expect(json).toHaveProperty('sections')
    expect(json).toHaveProperty('courseNotes')
    expect(json).toHaveProperty('categories')
  })
})

describe('PUT /api/exam-blueprints', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetUser.mockClear()
    mockProfileSingle.mockClear()
    mockFrom.mockClear()
    upsertCalls.length = 0
    insertCalls.length = 0
    deleteCalls.length = 0
    mockUpsert.mockReset()
    mockInsert.mockReset()
    mockDeleteEq.mockReset()
    mockSelectOrder.mockReset()
  })

  it('returns 400 when blueprint.slug is missing', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'admin-1' } } })
    mockProfileSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
    const { PUT } = await import('../route')
    const res = await PUT(makeReq('PUT', { blueprint: { name: 'No slug' }, sections: [], courseNotes: [] }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/slug/i)
  })

  it('returns 403 when user is not admin', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-1' } } })
    mockProfileSingle.mockResolvedValueOnce({ data: { role: 'viewer' }, error: null })
    const { PUT } = await import('../route')
    const res = await PUT(makeReq('PUT', { blueprint: { slug: 'upcat', name: 'UPCAT' }, sections: [], courseNotes: [] }))
    expect(res.status).toBe(403)
  })

  it('upserts the blueprint and inserts sections for admin user', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'admin-1' } } })
    mockProfileSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
    mockUpsert.mockReturnValue({ error: null })
    mockDeleteEq.mockReturnValue({ error: null })
    mockInsert.mockReturnValue({ error: null })

    const { PUT } = await import('../route')
    const res = await PUT(makeReq('PUT', {
      blueprint: {
        slug: 'upcat-2026', name: 'UPCAT 2026', acronym: 'UPCAT',
        total_items: 215, total_time_minutes: 180,
        has_guessing_penalty: true, guessing_penalty: 0.25,
        section_blocked: false, scoring_note: '', mechanics_note: '',
        status: 'published', display_order: 1,
      },
      sections: [
        { name: 'Mathematics', skill_category: 'Mathematics', item_count: 60, time_minutes: null, requires_spatial_logic: false },
        { name: 'Science', skill_category: 'Science', item_count: 60, time_minutes: null, requires_spatial_logic: false },
      ],
      courseNotes: [],
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.slug).toBe('upcat-2026')

    // Verify upsert was called for exam_blueprints
    const bpUpsert = upsertCalls.find(c => c.table === 'exam_blueprints')
    expect(bpUpsert).toBeDefined()
    expect(bpUpsert?.data.slug).toBe('upcat-2026')
    expect(bpUpsert?.data.status).toBe('published')

    // Verify sections were inserted
    const secInsert = insertCalls.find(c => c.table === 'exam_blueprint_sections')
    expect(secInsert).toBeDefined()
    expect(secInsert?.rows).toHaveLength(2)
    expect(secInsert?.rows[0].blueprint_slug).toBe('upcat-2026')
    expect(secInsert?.rows[0].name).toBe('Mathematics')
  })

  it('does not insert sections when sections array is empty', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'admin-1' } } })
    mockProfileSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
    mockUpsert.mockReturnValue({ error: null })
    mockDeleteEq.mockReturnValue({ error: null })

    const { PUT } = await import('../route')
    const res = await PUT(makeReq('PUT', {
      blueprint: { slug: 'empty-bp', name: 'Empty', acronym: '', status: 'draft' },
      sections: [],
      courseNotes: [],
    }))

    expect(res.status).toBe(200)
    const secInsert = insertCalls.find(c => c.table === 'exam_blueprint_sections')
    expect(secInsert).toBeUndefined()
  })
})

describe('DELETE /api/exam-blueprints', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetUser.mockClear()
    mockProfileSingle.mockClear()
    mockFrom.mockClear()
    deleteCalls.length = 0
    mockDeleteEq.mockReset()
  })

  it('returns 400 when slug query param is missing', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'admin-1' } } })
    mockProfileSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
    const { DELETE } = await import('../route')
    const res = await DELETE(makeReq('DELETE'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/slug/i)
  })

  it('deletes the blueprint by slug', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'admin-1' } } })
    mockProfileSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
    mockDeleteEq.mockReturnValue({ error: null })

    const { DELETE } = await import('../route')
    const res = await DELETE(makeReq('DELETE', undefined, '?slug=upcat-2026'))
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)

    const bpDelete = deleteCalls.find(c => c.table === 'exam_blueprints')
    expect(bpDelete).toBeDefined()
    expect(bpDelete?.val).toBe('upcat-2026')
  })
})
