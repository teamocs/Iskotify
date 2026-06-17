import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fake-anon-key')

// ---- Supabase upsert mock ----
const mockUpsert = vi.fn()

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({
    from: (_table: string) => ({
      upsert: mockUpsert,
    }),
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

describe('POST /api/early-access/apk-url', () => {
  beforeEach(() => {
    vi.resetModules()
    mockUpsert.mockReset()
  })

  it('returns {ok:true} and upserts when given a valid https:// URL', async () => {
    mockUpsert.mockResolvedValueOnce({ error: null })

    const POST = await importRoute()
    const res = await POST(makeRequest({ url: 'https://github.com/example/releases/download/v1/iskotify.apk' }))
    expect(res.status).toBe(200)

    const json = await res.json() as { ok: boolean }
    expect(json.ok).toBe(true)
    expect(mockUpsert).toHaveBeenCalledOnce()
  })

  it('upserts with key=early_access_apk_url and the correct value', async () => {
    mockUpsert.mockResolvedValueOnce({ error: null })

    const POST = await importRoute()
    await POST(makeRequest({ url: 'https://drive.google.com/file/d/abc123/view' }))

    const [upsertArg] = mockUpsert.mock.calls[0] as [Record<string, unknown>, unknown]
    expect(upsertArg.key).toBe('early_access_apk_url')
    expect(upsertArg.value).toBe('https://drive.google.com/file/d/abc123/view')
    expect(typeof upsertArg.updated_at).toBe('string')
  })

  it('trims whitespace from the URL before saving', async () => {
    mockUpsert.mockResolvedValueOnce({ error: null })

    const POST = await importRoute()
    await POST(makeRequest({ url: '  https://example.com/app.apk  ' }))

    const [upsertArg] = mockUpsert.mock.calls[0] as [Record<string, unknown>, unknown]
    expect(upsertArg.value).toBe('https://example.com/app.apk')
  })

  it('accepts an empty string (clears the link)', async () => {
    mockUpsert.mockResolvedValueOnce({ error: null })

    const POST = await importRoute()
    const res = await POST(makeRequest({ url: '' }))
    expect(res.status).toBe(200)

    const json = await res.json() as { ok: boolean }
    expect(json.ok).toBe(true)

    const [upsertArg] = mockUpsert.mock.calls[0] as [Record<string, unknown>, unknown]
    expect(upsertArg.value).toBe('')
  })

  it('returns 400 for a non-https URL (http://)', async () => {
    const POST = await importRoute()
    const res = await POST(makeRequest({ url: 'http://example.com/app.apk' }))
    expect(res.status).toBe(400)

    const json = await res.json() as { ok: boolean; error: string }
    expect(json.ok).toBe(false)
    expect(json.error).toContain('https')
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returns 400 for an arbitrary non-https string', async () => {
    const POST = await importRoute()
    const res = await POST(makeRequest({ url: 'ftp://storage.example.com/app.apk' }))
    expect(res.status).toBe(400)

    const json = await res.json() as { ok: boolean }
    expect(json.ok).toBe(false)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returns 400 when url field is missing', async () => {
    const POST = await importRoute()
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)

    const json = await res.json() as { ok: boolean }
    expect(json.ok).toBe(false)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returns 400 when url is not a string', async () => {
    const POST = await importRoute()
    const res = await POST(makeRequest({ url: 123 }))
    expect(res.status).toBe(400)

    const json = await res.json() as { ok: boolean }
    expect(json.ok).toBe(false)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returns 400 on invalid JSON body', async () => {
    const POST = await importRoute()
    const badReq = {
      json: async () => { throw new SyntaxError('Unexpected token') },
    } as unknown as import('next/server').NextRequest

    const res = await POST(badReq)
    expect(res.status).toBe(400)

    const json = await res.json() as { ok: boolean }
    expect(json.ok).toBe(false)
  })

  it('returns 500 when the upsert fails', async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: 'DB connection failed' } })

    const POST = await importRoute()
    const res = await POST(makeRequest({ url: 'https://example.com/app.apk' }))
    expect(res.status).toBe(500)

    const json = await res.json() as { ok: boolean }
    expect(json.ok).toBe(false)
  })

  it('returns 500 when the Supabase client init throws', async () => {
    const { createServerClient } = await import('@iskotify/utils')
    vi.mocked(createServerClient).mockImplementationOnce(() => {
      throw new Error('Missing env vars')
    })

    const POST = await importRoute()
    const res = await POST(makeRequest({ url: 'https://example.com/app.apk' }))
    expect(res.status).toBe(500)

    const json = await res.json() as { ok: boolean }
    expect(json.ok).toBe(false)
  })
})
