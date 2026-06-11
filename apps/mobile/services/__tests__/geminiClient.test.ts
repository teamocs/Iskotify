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
 *
 * Thinking-model assertions (Task A):
 *   - thinkingConfig: { thinkingBudget: 0 } present in every request body
 *   - Parts where thought===true are skipped; only text parts joined
 *   - Empty text + MAX_TOKENS finishReason → retried once with doubled budget
 *   - 400 mentioning thinkingConfig → retried same model without thinkingConfig, map flipped
 *   - blockReason present → specific friendly message
 *   - 503/500 → specific "Gemini is busy" message
 *   - validateGeminiKey uses maxOutputTokens:32 + thinkingConfig
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
          finishReason: 'STOP',
        },
      ],
    }),
  }
}

function makeOkResponseWithFinishReason(parts: Array<Record<string, unknown>>, finishReason: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          content: { parts },
          finishReason,
        },
      ],
    }),
  }
}

function makeBlockedResponse(blockReason: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      promptFeedback: { blockReason },
      candidates: [],
    }),
  }
}

function makeErrorResponse(status: number, errorMessage = 'Error from API') {
  return {
    ok: false,
    status,
    json: async () => ({ error: { message: errorMessage, code: status } }),
  }
}

describe('generateGeminiReply', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()
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
            finishReason: 'STOP',
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

  it('maps 503 to "Gemini is busy" message', async () => {
    const SECRET_KEY = 'AIzaBusyKey503'
    global.fetch = jest.fn().mockResolvedValue(makeErrorResponse(503))
    const { generateGeminiReply } = require('../geminiClient')

    let errorMessage = ''
    try {
      await generateGeminiReply(SECRET_KEY, 'system', 'question')
    } catch (e) {
      errorMessage = (e as Error).message
    }

    expect(errorMessage).toContain('busy')
    expect(errorMessage).not.toContain(SECRET_KEY)
  })

  it('maps 500 to "Gemini is busy" message', async () => {
    const SECRET_KEY = 'AIzaBusyKey500'
    global.fetch = jest.fn().mockResolvedValue(makeErrorResponse(500))
    const { generateGeminiReply } = require('../geminiClient')

    let errorMessage = ''
    try {
      await generateGeminiReply(SECRET_KEY, 'system', 'question')
    } catch (e) {
      errorMessage = (e as Error).message
    }

    expect(errorMessage).toContain('busy')
    expect(errorMessage).not.toContain(SECRET_KEY)
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

  // ── Task A: thinkingConfig in every request body ──────────────────────────
  it('includes thinkingConfig: { thinkingBudget: 0 } in the request body', async () => {
    global.fetch = jest.fn().mockResolvedValue(makeOkResponse('ok'))
    const { generateGeminiReply } = require('../geminiClient')
    await generateGeminiReply('test-key', 'system', 'question')

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, { body: string }]
    const body = JSON.parse(init.body)
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 })
  })

  // ── Task A: thought parts skipped ─────────────────────────────────────────
  it('skips parts where thought===true and joins only text parts', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                { thought: true, text: 'This is a thinking part — should be ignored.' },
                { text: 'Real answer part one. ' },
                { text: 'Real answer part two.' },
              ],
            },
            finishReason: 'STOP',
          },
        ],
      }),
    })
    const { generateGeminiReply } = require('../geminiClient')
    const result = await generateGeminiReply('test-key', 'system', 'question')
    expect(result).toBe('Real answer part one. Real answer part two.')
    expect(result).not.toContain('thinking part')
  })

  // ── Task A: MAX_TOKENS empty text → retry with doubled budget ──────────────
  it('retries once with doubled maxOutputTokens when parts are empty and finishReason=MAX_TOKENS', async () => {
    global.fetch = jest.fn()
      // First call: empty text parts + MAX_TOKENS
      .mockResolvedValueOnce(makeOkResponseWithFinishReason(
        [{ thought: true, text: 'thinking...' }],
        'MAX_TOKENS',
      ))
      // Second call (retry with doubled budget): succeeds with real text
      .mockResolvedValueOnce(makeOkResponse('Retried reply'))

    const { generateGeminiReply } = require('../geminiClient')
    const result = await generateGeminiReply('test-key', 'system', 'question', { maxOutputTokens: 64 })

    expect(result).toBe('Retried reply')
    expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(2)

    // Second call must have doubled maxOutputTokens
    const [, init2] = (global.fetch as jest.Mock).mock.calls[1] as [string, { body: string }]
    const body2 = JSON.parse(init2.body)
    expect(body2.generationConfig.maxOutputTokens).toBe(128)
    expect(body2.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 })
  })

  it('throws "cut off" message when MAX_TOKENS retry also fails with empty text', async () => {
    global.fetch = jest.fn()
      // Both calls: empty text parts + MAX_TOKENS
      .mockResolvedValue(makeOkResponseWithFinishReason(
        [{ thought: true, text: 'thinking...' }],
        'MAX_TOKENS',
      ))

    const { generateGeminiReply } = require('../geminiClient')
    let errorMessage = ''
    try {
      await generateGeminiReply('test-key', 'system', 'question', { maxOutputTokens: 64 })
    } catch (e) {
      errorMessage = (e as Error).message
    }

    expect(errorMessage).toContain('cut off')
    expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(2)
  })

  // ── Task A: blockReason mapping ───────────────────────────────────────────
  it('maps promptFeedback.blockReason to specific rephrasing message', async () => {
    global.fetch = jest.fn().mockResolvedValue(makeBlockedResponse('SAFETY'))
    const { generateGeminiReply } = require('../geminiClient')

    let errorMessage = ''
    try {
      await generateGeminiReply('test-key', 'system', 'question')
    } catch (e) {
      errorMessage = (e as Error).message
    }

    expect(errorMessage).toContain("can't be answered")
    expect(errorMessage).toContain('rephrasing')
  })

  // ── Task A: 400 with thinkingConfig in error message → retry without ──────
  it('retries without thinkingConfig on 400 mentioning thinkingConfig, then flips map', async () => {
    global.fetch = jest.fn()
      // First call: 400 with thinkingConfig in error message
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: 'Invalid value for thinkingConfig parameter INVALID_ARGUMENT',
            code: 400,
          },
        }),
      })
      // Second call (retry without thinkingConfig): succeeds
      .mockResolvedValueOnce(makeOkResponse('Success without thinking'))

    const { generateGeminiReply, _resetModelIdxForTests } = require('../geminiClient')
    _resetModelIdxForTests()

    const result = await generateGeminiReply('test-key', 'system', 'question')
    expect(result).toBe('Success without thinking')
    expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(2)

    // Second call must NOT include thinkingConfig
    const [, init2] = (global.fetch as jest.Mock).mock.calls[1] as [string, { body: string }]
    const body2 = JSON.parse(init2.body)
    expect(body2.generationConfig.thinkingConfig).toBeUndefined()
  })

  it('does not re-send thinkingConfig on subsequent calls after 400 flip', async () => {
    global.fetch = jest.fn()
      // First call: 400 with thinkingConfig in error message
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { message: 'INVALID_ARGUMENT thinkingConfig', code: 400 },
        }),
      })
      // Second call (retry without thinkingConfig): succeeds
      .mockResolvedValueOnce(makeOkResponse('First success'))
      // Third call (subsequent, should omit thinkingConfig from the start)
      .mockResolvedValueOnce(makeOkResponse('Second success'))

    const { generateGeminiReply, _resetModelIdxForTests } = require('../geminiClient')
    _resetModelIdxForTests()

    await generateGeminiReply('test-key', 'system', 'question 1')
    await generateGeminiReply('test-key', 'system', 'question 2')

    // Third call (second generateGeminiReply) must not have thinkingConfig
    const [, init3] = (global.fetch as jest.Mock).mock.calls[2] as [string, { body: string }]
    const body3 = JSON.parse(init3.body)
    expect(body3.generationConfig.thinkingConfig).toBeUndefined()
  })
})

describe('validateGeminiKey', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()
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

  // Task A: validate uses maxOutputTokens:32 (not 5) + thinkingConfig
  it('sends validate call using maxOutputTokens: 32 (not 5)', async () => {
    global.fetch = jest.fn().mockResolvedValue(makeOkResponse('OK'))
    const { validateGeminiKey } = require('../geminiClient')
    await validateGeminiKey('AIzaValidKey')

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, { body: string }]
    const body = JSON.parse(init.body)
    expect(body.generationConfig.maxOutputTokens).toBe(32)
  })

  it('sends validate call with thinkingConfig: { thinkingBudget: 0 }', async () => {
    global.fetch = jest.fn().mockResolvedValue(makeOkResponse('OK'))
    const { validateGeminiKey } = require('../geminiClient')
    await validateGeminiKey('AIzaValidKey')

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, { body: string }]
    const body = JSON.parse(init.body)
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 })
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
