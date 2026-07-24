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

// ---- Supabase server client mock ----
const mockUpsert = vi.fn()
const mockProfileSingle = vi.fn()
const mockConfigSingle = vi.fn()
const upsertCalls: { table: string; data: any }[] = []

function makeChain(table: string): any {
  return {
    select(_cols: string) {
      if (table === 'profiles') {
        return { eq(_c: string, _v: any) { return { single: mockProfileSingle } } }
      }
      // ai_chat_config
      return { eq(_c: string, _v: any) { return { single: mockConfigSingle } } }
    },
    upsert(data: any, _opts?: any) {
      upsertCalls.push({ table, data })
      return Promise.resolve(mockUpsert())
    },
  }
}

const mockFrom = vi.fn((table: string) => makeChain(table))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))

function makeReq(method: string, body?: object) {
  const url = 'http://localhost/api/admin/ai-config'
  return new NextRequest(url, {
    method,
    body: body != null ? JSON.stringify(body) : undefined,
    headers: body != null ? { 'Content-Type': 'application/json' } : {},
  })
}

describe('GET /api/admin/ai-config', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetUser.mockClear()
    mockProfileSingle.mockClear()
    mockConfigSingle.mockClear()
    mockFrom.mockClear()
    upsertCalls.length = 0
    mockUpsert.mockReset()
  })

  it('returns 401 when no user', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const { GET } = await import('../route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 403 when user is not admin', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    mockProfileSingle.mockResolvedValueOnce({ data: { role: 'viewer' }, error: null })
    const { GET } = await import('../route')
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('returns config and defaults shape for admin user', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'admin-1' } } })
    mockProfileSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
    mockConfigSingle.mockResolvedValueOnce({
      data: {
        id: 1,
        core_rules_override: '',
        scope_block_override: '',
        grounding_rule_override: '',
        anti_injection_override: '',
        progress_addendum_override: '',
        topic_addendum_override: '',
        math_addendum_override: '',
        rag_total_token_budget: 700,
        rag_per_block_char_cap: 280,
        rag_blocks_enabled: { flashcards: true, listings: true, courses: true, progress: true },
      },
      error: null,
    })
    const { GET } = await import('../route')
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('config')
    expect(json).toHaveProperty('defaults')
    expect(json.defaults).toHaveProperty('coreRules')
    expect(json.defaults).toHaveProperty('progressAddendum')
    expect(json.defaults).toHaveProperty('ragTotalTokenBudget')
    expect(json.defaults.ragTotalTokenBudget).toBe(700)
    expect(json.defaults.ragPerBlockCharCap).toBe(280)
    // Kuya Baw kill-switch default — retired (false) until an admin flips it on.
    expect(json.defaults).toHaveProperty('chatEnabled')
    expect(json.defaults.chatEnabled).toBe(false)
  })

  it('returns config=null when row not found (PGRST116)', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'admin-1' } } })
    mockProfileSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
    mockConfigSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116', message: 'not found' } })
    const { GET } = await import('../route')
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.config).toBeNull()
    expect(json.defaults).toBeDefined()
  })
})

describe('PUT /api/admin/ai-config', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetUser.mockClear()
    mockProfileSingle.mockClear()
    mockConfigSingle.mockClear()
    mockFrom.mockClear()
    upsertCalls.length = 0
    mockUpsert.mockReset()
  })

  it('returns 401 when no user', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const { PUT } = await import('../route')
    const res = await PUT(makeReq('PUT', {}))
    expect(res.status).toBe(401)
  })

  it('returns 403 when user is not admin', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    mockProfileSingle.mockResolvedValueOnce({ data: { role: 'viewer' }, error: null })
    const { PUT } = await import('../route')
    const res = await PUT(makeReq('PUT', { core_rules_override: 'custom' }))
    expect(res.status).toBe(403)
  })

  it('upserts config row for admin user', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'admin-1' } } })
    mockProfileSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
    mockUpsert.mockReturnValue({ error: null })

    const { PUT } = await import('../route')
    const res = await PUT(makeReq('PUT', {
      core_rules_override: 'Custom rules',
      scope_block_override: '',
      rag_total_token_budget: 600,
      rag_per_block_char_cap: 250,
      rag_blocks_enabled: { flashcards: true, listings: false, courses: true, progress: true },
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)

    const call = upsertCalls.find(c => c.table === 'ai_chat_config')
    expect(call).toBeDefined()
    expect(call?.data.id).toBe(1)
    expect(call?.data.core_rules_override).toBe('Custom rules')
    expect(call?.data.rag_total_token_budget).toBe(600)
    expect(call?.data.rag_blocks_enabled.listings).toBe(false)
  })

  it('accepts empty body and upserts with just id=1', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'admin-1' } } })
    mockProfileSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
    mockUpsert.mockReturnValue({ error: null })

    const { PUT } = await import('../route')
    const res = await PUT(makeReq('PUT', {}))
    expect(res.status).toBe(200)

    const call = upsertCalls.find(c => c.table === 'ai_chat_config')
    expect(call?.data.id).toBe(1)
    // chat_enabled is untouched when the field isn't in the body at all.
    expect(call?.data).not.toHaveProperty('chat_enabled')
  })

  // ── Kuya Baw kill-switch — chat_enabled ────────────────────────────────────
  it('forwards chat_enabled = true when the admin flips the toggle on', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'admin-1' } } })
    mockProfileSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
    mockUpsert.mockReturnValue({ error: null })

    const { PUT } = await import('../route')
    const res = await PUT(makeReq('PUT', { chat_enabled: true }))
    expect(res.status).toBe(200)

    const call = upsertCalls.find(c => c.table === 'ai_chat_config')
    expect(call?.data.chat_enabled).toBe(true)
  })

  it('forwards chat_enabled = false when the admin flips the toggle off', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'admin-1' } } })
    mockProfileSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
    mockUpsert.mockReturnValue({ error: null })

    const { PUT } = await import('../route')
    const res = await PUT(makeReq('PUT', { chat_enabled: false }))
    expect(res.status).toBe(200)

    const call = upsertCalls.find(c => c.table === 'ai_chat_config')
    expect(call?.data.chat_enabled).toBe(false)
  })

  it('coerces a non-boolean chat_enabled to false (fail-closed)', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'admin-1' } } })
    mockProfileSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
    mockUpsert.mockReturnValue({ error: null })

    const { PUT } = await import('../route')
    const res = await PUT(makeReq('PUT', { chat_enabled: 'yes' }))
    expect(res.status).toBe(200)

    const call = upsertCalls.find(c => c.table === 'ai_chat_config')
    expect(call?.data.chat_enabled).toBe(false)
  })
})
