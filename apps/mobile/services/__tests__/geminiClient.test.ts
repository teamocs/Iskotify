/**
 * Unit tests for services/geminiClient.ts
 *
 * Security assertions:
 *   - API key is sent via x-goog-api-key HEADER, never embedded in the URL
 *   - Error messages thrown to callers contain zero key material
 *   - Raw response body is never propagated
 */

const GEMINI_ENDPOINT_PREFIX = 'https://generativelanguage.googleapis.com/v1beta/models/'

function makeOkResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [{ text }],
          },
        },
      ],
    }),
  }
}

function makeErrorResponse(status: number) {
  return {
    ok: false,
    status,
    json: async () => ({ error: { message: 'Error from API', code: status } }),
  }
}

describe('generateGeminiReply', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('parses candidates[0].content.parts[*].text joined', async () => {
    global.fetch = jest.fn().mockResolvedValue(makeOkResponse('Hello student!'))
    const { generateGeminiReply } = require('../geminiClient')
    const result = await generateGeminiReply('test-key', 'system', 'user question')
    expect(result).toBe('Hello student!')
  })

  it('joins multiple parts into one string', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'Part one. ' }, { text: 'Part two.' }],
            },
          },
        ],
      }),
    })
    const { generateGeminiReply } = require('../geminiClient')
    const result = await generateGeminiReply('test-key', 'system', 'question')
    expect(result).toBe('Part one. Part two.')
  })

  it('sends the API key via x-goog-api-key HEADER — not in the URL', async () => {
    const SECRET_KEY = 'AIzaSecretKeyNotInUrl'
    global.fetch = jest.fn().mockResolvedValue(makeOkResponse('ok'))
    const { generateGeminiReply } = require('../geminiClient')
    await generateGeminiReply(SECRET_KEY, 'system', 'question')

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }]

    // Key must be in the header
    expect(init.headers['x-goog-api-key']).toBe(SECRET_KEY)

    // Key must NOT appear in the URL (this is the security-critical assertion)
    expect(url).not.toContain(SECRET_KEY)
    expect(url.startsWith(GEMINI_ENDPOINT_PREFIX)).toBe(true)
  })

  it('maps 400 to student-friendly invalid-key message without including the key', async () => {
    const SECRET_KEY = 'AIzaBadKey400'
    global.fetch = jest.fn().mockResolvedValue(makeErrorResponse(400))
    const { generateGeminiReply } = require('../geminiClient')

    let errorMessage = ''
    try {
      await generateGeminiReply(SECRET_KEY, 'system', 'question')
    } catch (e) {
      errorMessage = (e as Error).message
    }

    expect(errorMessage).toContain('key')
    expect(errorMessage).toContain('Google AI Studio')
    // Must not contain the actual key
    expect(errorMessage).not.toContain(SECRET_KEY)
    // Must not contain raw HTTP status or response body
    expect(errorMessage).not.toContain('400')
  })

  it('maps 403 to the same invalid-key message', async () => {
    const SECRET_KEY = 'AIzaBadKey403'
    global.fetch = jest.fn().mockResolvedValue(makeErrorResponse(403))
    const { generateGeminiReply } = require('../geminiClient')

    let errorMessage = ''
    try {
      await generateGeminiReply(SECRET_KEY, 'system', 'question')
    } catch (e) {
      errorMessage = (e as Error).message
    }

    expect(errorMessage).toContain('Google AI Studio')
    expect(errorMessage).not.toContain(SECRET_KEY)
  })

  it('maps 429 to quota-friendly message', async () => {
    const SECRET_KEY = 'AIzaQuotaKey429'
    global.fetch = jest.fn().mockResolvedValue(makeErrorResponse(429))
    const { generateGeminiReply } = require('../geminiClient')

    let errorMessage = ''
    try {
      await generateGeminiReply(SECRET_KEY, 'system', 'question')
    } catch (e) {
      errorMessage = (e as Error).message
    }

    expect(errorMessage).toContain('allowance')
    expect(errorMessage).not.toContain(SECRET_KEY)
    expect(errorMessage).not.toContain('429')
  })

  it('maps network failure to friendly message (no key in error)', async () => {
    const SECRET_KEY = 'AIzaNetworkKey'
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'))
    const { generateGeminiReply } = require('../geminiClient')

    let errorMessage = ''
    try {
      await generateGeminiReply(SECRET_KEY, 'system', 'question')
    } catch (e) {
      errorMessage = (e as Error).message
    }

    expect(errorMessage).toContain('internet')
    expect(errorMessage).not.toContain(SECRET_KEY)
    expect(errorMessage).not.toContain('Network request failed')
  })
})

describe('validateGeminiKey', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns { ok: true } when the call succeeds', async () => {
    global.fetch = jest.fn().mockResolvedValue(makeOkResponse('OK'))
    const { validateGeminiKey } = require('../geminiClient')
    const result = await validateGeminiKey('AIzaValidKey')
    expect(result).toEqual({ ok: true })
  })

  it('returns { ok: false, message } on 403 without throwing', async () => {
    global.fetch = jest.fn().mockResolvedValue(makeErrorResponse(403))
    const { validateGeminiKey } = require('../geminiClient')
    const result = await validateGeminiKey('AIzaInvalidKey')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('Google AI Studio')
      // Key must not appear in the message
      expect(result.message).not.toContain('AIzaInvalidKey')
    }
  })

  it('returns { ok: false, message } on 429 without throwing', async () => {
    global.fetch = jest.fn().mockResolvedValue(makeErrorResponse(429))
    const { validateGeminiKey } = require('../geminiClient')
    const result = await validateGeminiKey('AIzaQuotaKey')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('allowance')
    }
  })

  it('sends validate call using maxOutputTokens: 5', async () => {
    global.fetch = jest.fn().mockResolvedValue(makeOkResponse('OK'))
    const { validateGeminiKey } = require('../geminiClient')
    await validateGeminiKey('AIzaValidKey')

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, { body: string }]
    const body = JSON.parse(init.body)
    expect(body.generationConfig.maxOutputTokens).toBe(5)
  })
})
