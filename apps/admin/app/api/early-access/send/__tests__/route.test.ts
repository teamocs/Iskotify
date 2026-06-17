import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fake-anon-key')

// ---- Supabase query mocks ----
const mockRegistrationMaybeSingle = vi.fn()
const mockConfigMaybeSingle = vi.fn()
const mockUpdate = vi.fn()

// Track which table is being queried so we can return the right mock
const mockFrom = vi.fn((table: string) => {
  if (table === 'early_access_registrations') {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: mockRegistrationMaybeSingle,
        }),
      }),
      update: () => ({
        eq: mockUpdate,
      }),
    }
  }
  // app_config
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({ maybeSingle: mockConfigMaybeSingle }),
        maybeSingle: mockConfigMaybeSingle,
      }),
      maybeSingle: mockConfigMaybeSingle,
    }),
  }
})

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))

// ---- Email mock ----
const mockSendEmail = vi.fn()
vi.mock('@/lib/email/earlyAccess', () => ({
  sendEarlyAccessApkEmail: mockSendEmail,
}))

function makeRequest(body: unknown) {
  return {
    json: async () => body,
  } as import('next/server').NextRequest
}

async function importRoute() {
  return (await import('../route')).POST
}

const MOCK_ROW = {
  id: 'reg-123',
  email: 'student@example.com',
  full_name: 'Maria Santos',
  status: 'approved',
  approved_at: null,
}

const MOCK_APK_URL = 'https://github.com/example/releases/download/v1/iskotify.apk'

describe('POST /api/early-access/send', () => {
  beforeEach(() => {
    vi.resetModules()
    mockRegistrationMaybeSingle.mockReset()
    mockConfigMaybeSingle.mockReset()
    mockUpdate.mockReset()
    mockSendEmail.mockReset()
    mockFrom.mockClear()
  })

  it('returns 400 when the APK URL is not set in app_config', async () => {
    mockRegistrationMaybeSingle.mockResolvedValueOnce({ data: MOCK_ROW, error: null })
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: { value: '' }, error: null })

    const POST = await importRoute()
    const res = await POST(makeRequest({ id: 'reg-123' }))
    expect(res.status).toBe(400)

    const json = await res.json() as { ok: boolean; error: string }
    expect(json.ok).toBe(false)
    expect(json.error).toContain('No APK link')
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('returns 400 when app_config has null value (row missing)', async () => {
    mockRegistrationMaybeSingle.mockResolvedValueOnce({ data: MOCK_ROW, error: null })
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const POST = await importRoute()
    const res = await POST(makeRequest({ id: 'reg-123' }))
    expect(res.status).toBe(400)

    const json = await res.json() as { ok: boolean }
    expect(json.ok).toBe(false)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('calls sendEarlyAccessApkEmail with the stored URL when URL is set', async () => {
    mockRegistrationMaybeSingle.mockResolvedValueOnce({ data: MOCK_ROW, error: null })
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: { value: MOCK_APK_URL }, error: null })
    mockSendEmail.mockResolvedValueOnce({ ok: true })
    mockUpdate.mockResolvedValueOnce({ error: null })

    const POST = await importRoute()
    const res = await POST(makeRequest({ id: 'reg-123' }))
    expect(res.status).toBe(200)

    expect(mockSendEmail).toHaveBeenCalledOnce()
    const firstCall = mockSendEmail.mock.calls[0]
    if (!firstCall) throw new Error('sendEarlyAccessApkEmail was not called')
    const emailArgs = firstCall[0] as {
      to: string
      name: string | null
      downloadUrl: string
    }
    expect(emailArgs.to).toBe('student@example.com')
    expect(emailArgs.name).toBe('Maria Santos')
    expect(emailArgs.downloadUrl).toBe(MOCK_APK_URL)
    // No expiresHours in the new signature
    expect('expiresHours' in emailArgs).toBe(false)
  })

  it('sets status=sent and backfills approved_at after email succeeds', async () => {
    mockRegistrationMaybeSingle.mockResolvedValueOnce({ data: MOCK_ROW, error: null })
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: { value: MOCK_APK_URL }, error: null })
    mockSendEmail.mockResolvedValueOnce({ ok: true })
    mockUpdate.mockResolvedValueOnce({ error: null })

    const POST = await importRoute()
    const res = await POST(makeRequest({ id: 'reg-123' }))
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledOnce()
  })

  it('returns 502 and does NOT update status when email send fails', async () => {
    mockRegistrationMaybeSingle.mockResolvedValueOnce({ data: MOCK_ROW, error: null })
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: { value: MOCK_APK_URL }, error: null })
    mockSendEmail.mockResolvedValueOnce({ ok: false, error: 'Resend error 422: Invalid from address' })

    const POST = await importRoute()
    const res = await POST(makeRequest({ id: 'reg-123' }))
    expect(res.status).toBe(502)

    const json = await res.json() as { ok: boolean }
    expect(json.ok).toBe(false)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns 400 when id is missing from the body', async () => {
    const POST = await importRoute()
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)

    const json = await res.json() as { ok: boolean }
    expect(json.ok).toBe(false)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('returns 404 when the registration row is not found', async () => {
    mockRegistrationMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: { value: MOCK_APK_URL }, error: null })

    const POST = await importRoute()
    const res = await POST(makeRequest({ id: 'nonexistent' }))
    expect(res.status).toBe(404)

    const json = await res.json() as { ok: boolean }
    expect(json.ok).toBe(false)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('returns {ok:true} on full success', async () => {
    mockRegistrationMaybeSingle.mockResolvedValueOnce({ data: MOCK_ROW, error: null })
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: { value: MOCK_APK_URL }, error: null })
    mockSendEmail.mockResolvedValueOnce({ ok: true })
    mockUpdate.mockResolvedValueOnce({ error: null })

    const POST = await importRoute()
    const res = await POST(makeRequest({ id: 'reg-123' }))
    expect(res.status).toBe(200)

    const json = await res.json() as { ok: boolean }
    expect(json.ok).toBe(true)
  })
})
