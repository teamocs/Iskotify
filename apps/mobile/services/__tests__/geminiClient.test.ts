/**
 * Unit tests for services/geminiClient.ts
 *
 * Security assertions:
 *   - API key is sent via x-goog-api-key HEADER, never embedded in the URL
 *   - Error messages thrown to callers contain zero key material
 *   - Raw response body is never propagated
 *
 * Model-churn resilience assertions:
 *   - 404 on primary model → falls back to secondary and succeeds
 *   - workingModelIdx is remembered across calls (sticky)
 *   - All candidates returning 404 → friendly generic error (no key in message)
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

describe('generateGeminiReply — model-churn resilience', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()
  })

  it('404 on first model falls back to the second model and succeeds', async () => {
    const { generateGeminiReply, _resetModelIdxForTests } = require('../geminiClient')
    _resetModelIdxForTests()

    // First call → 404 (primary model deprecated); second call → 200 (fallback succeeds)
    global.fetch = jest.fn()
      .mockResolvedValueOnce(makeErrorResponse(404))
      .mockResolvedValueOnce(makeOkResponse('Fallback reply'))

    const result = await generateGeminiReply('AIza-key', 'system', 'user question')
    expect(result).toBe('Fallback reply')
    expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(2)

    // Both calls must use the header, never the URL
    const calls = (global.fetch as jest.Mock).mock.calls as [string, RequestInit & { headers: Record<string, string> }][]
    for (const [url, init] of calls) {
      expect(init.headers['x-goog-api-key']).toBe('AIza-key')
      expect(url).not.toContain('AIza-key')
      expect(url.startsWith(GEMINI_ENDPOINT_PREFIX)).toBe(true)
    }
  })

  it('sticky workingModelIdx: second call skips straight to the working model (only 1 fetch)', async () => {
    const { generateGeminiReply, _resetModelIdxForTests } = require('../geminiClient')
    _resetModelIdxForTests()

    // First call: primary 404 → fallback succeeds (2 fetches, idx advances to 1)
    global.fetch = jest.fn()
      .mockResolvedValueOnce(makeErrorResponse(404))
      .mockResolvedValueOnce(makeOkResponse('First reply'))
    await generateGeminiReply('AIza-key', 'system', 'first question')
    expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(2)

    // Second call should go directly to the remembered model (1 fetch, not 2)
    ;(global.fetch as jest.Mock).mockClear()
    global.fetch = jest.fn().mockResolvedValueOnce(makeOkResponse('Second reply'))
    const result = await generateGeminiReply('AIza-key', 'system', 'second question')
    expect(result).toBe('Second reply')
    expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(1)
  })

  it('all candidates returning 404 → friendly generic error without key material', async () => {
    const SECRET_KEY = 'AIzaDeprecatedAllKey'
    const { generateGeminiReply, _resetModelIdxForTests } = require('../geminiClient')
    _resetModelIdxForTests()

    // Return 404 for every fetch call (all 3 candidates exhausted)
    global.fetch = jest.fn().mockResolvedValue(makeErrorResponse(404))

    let errorMessage = ''
    try {
      await generateGeminiReply(SECRET_KEY, 'system', 'user question')
    } catch (e) {
      errorMessage = (e as Error).message
    }

    // Must be the generic friendly error
    expect(errorMessage).toBe('Gemini ran into a problem — please try again in a moment.')
    // Key must not appear in the error
    expect(errorMessage).not.toContain(SECRET_KEY)
    // Should have tried all 3 candidates
    expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(3)
  })

  it('non-404 errors on primary model are not retried (preserve existing status mapping)', async () => {
    const { generateGeminiReply, _resetModelIdxForTests } = require('../geminiClient')
    _resetModelIdxForTests()

    global.fetch = jest.fn().mockResolvedValueOnce(makeErrorResponse(429))

    let errorMessage = ''
    try {
      await generateGeminiReply('AIza-key', 'system', 'question')
    } catch (e) {
      errorMessage = (e as Error).message
    }

    // 429 → quota message, no fallback attempted
    expect(errorMessage).toContain('allowance')
    expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(1)
  })
})
