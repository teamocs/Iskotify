import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fake-anon-key')

// ---- Auth gate mock (route is admin-only via requireAdmin) ----
const mockGetUser = vi.fn()
const mockSingle = vi.fn()
vi.mock('@/lib/supabase', () => ({
  createAuthClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

// ---- Supabase service-client mock (profiles gate + app_config upsert) ----
const mockUpsert = vi.fn()

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({
    from: (table: string) =>
      table === 'profiles'
        ? { select: () => ({ eq: () => ({ single: mockSingle }) }) }
        : { upsert: mockUpsert },
  })),
}))

function makeRequest(body: unknown) {
  return {
    json: async () => body,
  } as import('next/server').NextRequest
}

async function importRoute() {
  return (await import('../route')).POST
}

describe('POST /api/admin/update-email-template', () => {
  beforeEach(() => {
    vi.resetModules()
    mockUpsert.mockReset()
    mockGetUser.mockReset()
    mockSingle.mockReset()
    // Default: an admin session (individual tests override for 401/403 paths)
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockSingle.mockResolvedValue({ data: { role: 'admin' }, error: null })
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const POST = await importRoute()
    const res = await POST(makeRequest({ template: 'Hi {{name}}' }))
    expect(res.status).toBe(401)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returns 403 for a signed-in non-admin (the middleware lets any session through)', async () => {
    mockSingle.mockResolvedValueOnce({ data: { role: 'viewer' }, error: null })
    const POST = await importRoute()
    const res = await POST(makeRequest({ template: 'evil template' }))
    expect(res.status).toBe(403)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returns {ok:true} and upserts the template when admin', async () => {
    mockUpsert.mockResolvedValueOnce({ error: null })

    const POST = await importRoute()
    const res = await POST(makeRequest({ template: 'Hi {{name}}, install {{apk_url}}' }))
    expect(res.status).toBe(200)

    const json = await res.json() as { ok: boolean }
    expect(json.ok).toBe(true)
    expect(mockUpsert).toHaveBeenCalledOnce()

    const [upsertArg] = mockUpsert.mock.calls[0] as [Record<string, unknown>, unknown]
    expect(upsertArg.key).toBe('update_email_template')
    expect(upsertArg.value).toBe('Hi {{name}}, install {{apk_url}}')
    expect(typeof upsertArg.updated_at).toBe('string')
  })

  it('accepts an empty string template', async () => {
    mockUpsert.mockResolvedValueOnce({ error: null })

    const POST = await importRoute()
    const res = await POST(makeRequest({ template: '' }))
    expect(res.status).toBe(200)

    const json = await res.json() as { ok: boolean }
    expect(json.ok).toBe(true)
  })

  it('returns 400 when template is not a string', async () => {
    const POST = await importRoute()
    const res = await POST(makeRequest({ template: 42 }))
    expect(res.status).toBe(400)

    const json = await res.json() as { ok: boolean }
    expect(json.ok).toBe(false)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returns 400 when template exceeds the max length', async () => {
    const POST = await importRoute()
    const res = await POST(makeRequest({ template: 'x'.repeat(20001) }))
    expect(res.status).toBe(400)

    const json = await res.json() as { ok: boolean }
    expect(json.ok).toBe(false)
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})
