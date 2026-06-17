import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock global.fetch before importing the module under test
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Import AFTER stubbing globals so the module captures the stub
import { sendEarlyAccessApkEmail } from '../earlyAccess'

const VALID_ARGS = {
  to: 'student@example.com',
  name: 'Maria Santos',
  downloadUrl: 'https://github.com/iskotify/releases/download/v1.0.0/iskotify-early-access.apk',
}

function setEnv(apiKey?: string, from?: string) {
  if (apiKey !== undefined) {
    process.env.RESEND_API_KEY = apiKey
  } else {
    delete process.env.RESEND_API_KEY
  }
  if (from !== undefined) {
    process.env.EARLY_ACCESS_FROM = from
  } else {
    delete process.env.EARLY_ACCESS_FROM
  }
}

beforeEach(() => {
  mockFetch.mockReset()
})

afterEach(() => {
  delete process.env.RESEND_API_KEY
  delete process.env.EARLY_ACCESS_FROM
})

// ---------- env-missing guard ----------

describe('sendEarlyAccessApkEmail — env not configured', () => {
  it('returns {ok:false} with a clear message when RESEND_API_KEY is missing', async () => {
    setEnv(undefined, 'Iskotify <early-access@iskotify.ph>')
    const result = await sendEarlyAccessApkEmail(VALID_ARGS)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('RESEND_API_KEY')
    }
    // Should NOT call fetch at all
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns {ok:false} with a clear message when EARLY_ACCESS_FROM is missing', async () => {
    setEnv('re_test_key', undefined)
    const result = await sendEarlyAccessApkEmail(VALID_ARGS)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('EARLY_ACCESS_FROM')
    }
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when both env vars are missing', async () => {
    setEnv(undefined, undefined)
    const result = await sendEarlyAccessApkEmail(VALID_ARGS)
    expect(result.ok).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

// ---------- correct fetch shape ----------

describe('sendEarlyAccessApkEmail — correct request shape', () => {
  beforeEach(() => {
    setEnv('re_test_key_abc', 'Iskotify <early-access@iskotify.ph>')
  })

  it('POSTs to https://api.resend.com/emails with Authorization header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'email-id-123' }),
    })

    await sendEarlyAccessApkEmail(VALID_ARGS)

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer re_test_key_abc')
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('sends correct from/to/subject in the JSON body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'email-id-123' }),
    })

    await sendEarlyAccessApkEmail(VALID_ARGS)

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as {
      from: string
      to: string
      subject: string
      html: string
      text: string
    }

    expect(body.from).toBe('Iskotify <early-access@iskotify.ph>')
    expect(body.to).toBe('student@example.com')
    expect(body.subject).toContain('approved')
    expect(body.html).toContain(VALID_ARGS.downloadUrl)
    expect(body.text).toContain(VALID_ARGS.downloadUrl)
  })

  it('includes both html and text fields', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    await sendEarlyAccessApkEmail(VALID_ARGS)

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(typeof body.html).toBe('string')
    expect(typeof body.text).toBe('string')
    expect((body.html as string).length).toBeGreaterThan(100)
    expect((body.text as string).length).toBeGreaterThan(50)
  })

  it('greets by name when name is provided', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    await sendEarlyAccessApkEmail({ ...VALID_ARGS, name: 'Jose Rizal' })

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { html: string; text: string }
    expect(body.html).toContain('Jose Rizal')
    expect(body.text).toContain('Jose Rizal')
  })

  it('uses generic greeting when name is null', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    await sendEarlyAccessApkEmail({ ...VALID_ARGS, name: null })

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { html: string; text: string }
    expect(body.text).toContain('Hi there,')
  })

  it('includes the recipient email in the email body (sign-in reminder)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    await sendEarlyAccessApkEmail(VALID_ARGS)

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { html: string; text: string }
    expect(body.html).toContain('student@example.com')
    expect(body.text).toContain('student@example.com')
  })

  it('returns {ok:true} on 2xx response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'x' }) })

    const result = await sendEarlyAccessApkEmail(VALID_ARGS)
    expect(result.ok).toBe(true)
  })

  it('does NOT include expiry language in html or text', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    await sendEarlyAccessApkEmail(VALID_ARGS)

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { html: string; text: string }

    // The link is permanent — no expiry language should appear
    expect(body.html.toLowerCase()).not.toContain('expire')
    expect(body.text.toLowerCase()).not.toContain('expire')
    expect(body.html).not.toContain('48 hours')
    expect(body.text).not.toContain('48 hours')
  })
})

// ---------- non-2xx error mapping ----------

describe('sendEarlyAccessApkEmail — Resend error handling', () => {
  beforeEach(() => {
    setEnv('re_test_key_abc', 'Iskotify <early-access@iskotify.ph>')
  })

  it('returns {ok:false} when Resend returns 422 with a message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ message: 'Invalid from address', name: 'validation_error' }),
    })

    const result = await sendEarlyAccessApkEmail(VALID_ARGS)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('422')
      expect(result.error).toContain('Invalid from address')
    }
  })

  it('returns {ok:false} when Resend returns 429 with no parseable body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => { throw new Error('not json') },
    })

    const result = await sendEarlyAccessApkEmail(VALID_ARGS)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('429')
    }
  })

  it('returns {ok:false} on network throw without throwing itself', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const result = await sendEarlyAccessApkEmail(VALID_ARGS)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('ECONNREFUSED')
    }
  })

  it('does not throw even when fetch rejects', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(sendEarlyAccessApkEmail(VALID_ARGS)).resolves.not.toThrow()
  })
})
