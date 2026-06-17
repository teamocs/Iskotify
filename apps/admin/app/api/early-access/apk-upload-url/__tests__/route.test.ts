import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fake-anon-key')

// ---- Supabase signed upload URL mock ----
const mockCreateSignedUploadUrl = vi.fn()

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({
    storage: {
      from: (_bucket: string) => ({
        createSignedUploadUrl: mockCreateSignedUploadUrl,
      }),
    },
  })),
}))

async function importRoute() {
  return (await import('../route')).POST
}

describe('POST /api/early-access/apk-upload-url', () => {
  beforeEach(() => {
    vi.resetModules()
    mockCreateSignedUploadUrl.mockReset()
  })

  it('returns ok:true with path and token on success', async () => {
    mockCreateSignedUploadUrl.mockResolvedValueOnce({
      data: {
        path: 'iskotify-early-access.apk',
        token: 'tok_abc123',
        signedUrl: 'https://fake.supabase.co/storage/v1/upload/sign/early-access-apk/iskotify-early-access.apk?token=tok_abc123',
      },
      error: null,
    })

    const POST = await importRoute()
    const res = await POST()
    expect(res.status).toBe(200)

    const json = await res.json() as { ok: boolean; path: string; token: string; objectKey: string }
    expect(json.ok).toBe(true)
    expect(json.path).toBe('iskotify-early-access.apk')
    expect(json.token).toBe('tok_abc123')
    expect(json.objectKey).toBe('iskotify-early-access.apk')
  })

  it('passes upsert:true to createSignedUploadUrl so re-uploads overwrite the object', async () => {
    mockCreateSignedUploadUrl.mockResolvedValueOnce({
      data: { path: 'iskotify-early-access.apk', token: 'tok_xyz', signedUrl: 'https://x' },
      error: null,
    })

    const POST = await importRoute()
    await POST()

    expect(mockCreateSignedUploadUrl).toHaveBeenCalledWith(
      'iskotify-early-access.apk',
      { upsert: true },
    )
  })

  it('respects EARLY_ACCESS_APK_OBJECT env override', async () => {
    vi.stubEnv('EARLY_ACCESS_APK_OBJECT', 'custom-build-v2.apk')
    mockCreateSignedUploadUrl.mockResolvedValueOnce({
      data: { path: 'custom-build-v2.apk', token: 'tok_custom', signedUrl: 'https://x' },
      error: null,
    })

    const POST = await importRoute()
    const res = await POST()
    const json = await res.json() as { ok: boolean; objectKey: string }
    expect(json.objectKey).toBe('custom-build-v2.apk')
    expect(mockCreateSignedUploadUrl).toHaveBeenCalledWith('custom-build-v2.apk', { upsert: true })

    // Restore default for subsequent tests
    vi.stubEnv('EARLY_ACCESS_APK_OBJECT', '')
  })

  it('returns ok:false with status 500 when createSignedUploadUrl returns an error', async () => {
    mockCreateSignedUploadUrl.mockResolvedValueOnce({
      data: null,
      error: { message: 'Bucket not found', status: 404 },
    })

    const POST = await importRoute()
    const res = await POST()
    expect(res.status).toBe(500)

    const json = await res.json() as { ok: boolean; error: string }
    expect(json.ok).toBe(false)
    expect(typeof json.error).toBe('string')
  })

  it('returns ok:false with status 500 when createSignedUploadUrl returns no data', async () => {
    mockCreateSignedUploadUrl.mockResolvedValueOnce({ data: null, error: null })

    const POST = await importRoute()
    const res = await POST()
    expect(res.status).toBe(500)

    const json = await res.json() as { ok: boolean }
    expect(json.ok).toBe(false)
  })

  it('returns ok:false with status 500 when the Supabase client init fails', async () => {
    // Override the mock for this single test to simulate init failure
    const { createServerClient } = await import('@iskotify/utils')
    vi.mocked(createServerClient).mockImplementationOnce(() => {
      throw new Error('Missing env vars')
    })

    const POST = await importRoute()
    const res = await POST()
    expect(res.status).toBe(500)

    const json = await res.json() as { ok: boolean }
    expect(json.ok).toBe(false)
  })
})
