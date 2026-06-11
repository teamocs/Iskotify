/**
 * Gemini REST client for Kuya Baw cloud mode (BYOK).
 *
 * Security contract:
 * - The API key is ALWAYS sent via the x-goog-api-key header — never embedded in the URL
 *   (URL query params appear in server logs, proxies, and network traces).
 * - The key is NEVER included in thrown errors, logged messages, or the raw response body.
 * - Error messages are student-friendly; they contain zero information about the key itself.
 *
 * Model-churn resilience:
 * - GEMINI_MODELS lists candidates in preference order (newest first).
 * - On a 404 (model not found / deprecated), the client advances to the next candidate and
 *   retries within the same call. The working index is remembered for subsequent calls so
 *   only one extra round-trip is ever needed per model deprecation event.
 *
 * Thinking-model resilience (Task A):
 * - gemini-2.5-flash and family are "thinking" models. By default the model's thinking phase
 *   can consume all tokens in the budget, leaving zero for the visible reply.
 * - We suppress thinking with thinkingConfig: { thinkingBudget: 0 } on every request.
 * - If a model returns 400 with an error message mentioning "thinkingConfig" or
 *   "INVALID_ARGUMENT", it does not support the field. We retry once without it and record
 *   the model in supportsThinkingConfig=false so subsequent calls omit it immediately.
 */

const GEMINI_ENDPOINT_BASE =
  'https://generativelanguage.googleapis.com/v1beta/models/'

// Ordered by preference — newest / most capable first.
// On 404 the client falls through the list automatically.
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemini-2.0-flash-lite',
] as const

type GeminiModel = typeof GEMINI_MODELS[number]

// Module-level sticky index so a working model survives across calls.
// Reset to 0 only when all candidates fail (forces a fresh probe on the next call).
let workingModelIdx = 0

// Per-model map: true = send thinkingConfig, false = this model rejected it → omit.
// Defaults to true for all models (thinking models need it suppressed).
const supportsThinkingConfig: Record<string, boolean> = {}
function modelSupportsThinking(modelName: GeminiModel): boolean {
  return supportsThinkingConfig[modelName] !== false
}

/** Exported for test isolation only — do NOT call in production code. */
export function _resetModelIdxForTests(): void {
  workingModelIdx = 0
  for (const k of Object.keys(supportsThinkingConfig)) {
    delete supportsThinkingConfig[k]
  }
}

function buildEndpoint(modelName: string): string {
  return `${GEMINI_ENDPOINT_BASE}${modelName}:generateContent`
}

interface GeminiOpts {
  maxOutputTokens?: number
  temperature?: number
}

/** Sentinel error code — internal only, never shown to users. */
const SENTINEL_CUT_OFF = '__GEMINI_CUT_OFF__'
const SENTINEL_THINKING_CONFIG_400 = '__GEMINI_THINKING_CONFIG_400__'

/** Map an HTTP status code or network error to a student-friendly message. */
function mapError(status: number | null, isNetwork: boolean): string {
  if (isNetwork) {
    return "Couldn't reach Gemini — check your internet and try again."
  }
  if (status === 400 || status === 403) {
    return "That key doesn't look right — double-check it in Google AI Studio."
  }
  if (status === 429) {
    return "Your free Gemini allowance is used up for now — try again in a bit."
  }
  if (status === 500 || status === 503) {
    return "Gemini is busy right now — try again in a moment."
  }
  return "Gemini ran into a problem — please try again in a moment."
}

function buildRequestBody(
  modelName: GeminiModel,
  systemPrompt: string,
  userPrompt: string,
  maxOutputTokens: number,
  temperature: number,
): string {
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens,
    temperature,
  }

  if (modelSupportsThinking(modelName)) {
    generationConfig['thinkingConfig'] = { thinkingBudget: 0 }
  }

  return JSON.stringify({
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig,
  })
}

function parseReply(data: unknown): string {
  const d = data as Record<string, unknown>

  // Check for promptFeedback blockReason first (blocked request)
  const promptFeedback = d.promptFeedback as Record<string, unknown> | undefined
  if (promptFeedback?.blockReason) {
    throw new Error("That question can't be answered — try rephrasing it.")
  }

  const candidates = d.candidates
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('no candidates')
  }

  const candidate = candidates[0] as Record<string, unknown>
  const finishReason = candidate.finishReason as string | undefined
  const content = candidate.content as Record<string, unknown> | undefined
  const parts = content?.parts as Array<Record<string, unknown>> | undefined

  // Join only text parts, skipping thought===true parts (thinking model internals)
  const text = (parts ?? [])
    .filter(p => p.thought !== true)
    .map(p => (typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim()

  if (!text && finishReason === 'MAX_TOKENS') {
    // Sentinel: caller should retry with doubled budget
    throw new Error(SENTINEL_CUT_OFF)
  }

  if (!text) throw new Error('empty reply')
  return text
}

/**
 * Internal: perform one fetch attempt and return parsed text.
 * Throws sentinel errors for special retry logic; throws friendly errors for terminal failures.
 */
async function attemptFetch(
  modelName: GeminiModel,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxOutputTokens: number,
  temperature: number,
): Promise<string> {
  const requestBody = buildRequestBody(modelName, systemPrompt, userPrompt, maxOutputTokens, temperature)

  let response: Response
  try {
    response = await fetch(buildEndpoint(modelName), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: requestBody,
    })
  } catch {
    throw new Error(mapError(null, true))
  }

  if (!response.ok) {
    // Try to read error body for diagnosability (never propagate key or full body to user)
    let errMsg = ''
    try {
      const errData = await response.json() as Record<string, unknown>
      const apiError = errData.error as Record<string, unknown> | undefined
      errMsg = typeof apiError?.message === 'string' ? apiError.message.slice(0, 120) : ''
    } catch { /* ignore parse failure */ }

    if (errMsg) {
      console.warn('[gemini]', response.status, errMsg)
    }

    // 400 mentioning thinkingConfig → special sentinel so caller can retry without it
    if (
      response.status === 400 &&
      (errMsg.toLowerCase().includes('thinkingconfig') || errMsg.toLowerCase().includes('invalid_argument'))
    ) {
      throw new Error(SENTINEL_THINKING_CONFIG_400)
    }

    throw new Error(mapError(response.status, false))
  }

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error(mapError(null, false))
  }

  return parseReply(data)
}

/**
 * Call the Gemini generateContent API and return the reply text.
 * Automatically falls back through GEMINI_MODELS on 404 (deprecated/missing model).
 * Throws a student-friendly Error on failure (never containing the key or raw response body).
 */
export async function generateGeminiReply(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  opts: GeminiOpts = {},
): Promise<string> {
  const { maxOutputTokens = 200, temperature = 0.2 } = opts

  // Try starting from the remembered working index, then fall forward through the list.
  const startIdx = workingModelIdx
  for (let offset = 0; offset < GEMINI_MODELS.length; offset++) {
    const idx = (startIdx + offset) % GEMINI_MODELS.length
    const modelName = GEMINI_MODELS[idx]!

    let response: Response
    try {
      response = await fetch(buildEndpoint(modelName), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: buildRequestBody(modelName, systemPrompt, userPrompt, maxOutputTokens, temperature),
      })
    } catch {
      // Network-level failure (offline, DNS, etc.) — no point retrying other models.
      throw new Error(mapError(null, true))
    }

    if (response.status === 404) {
      // Model not found / deprecated — advance to next candidate and retry.
      continue
    }

    if (!response.ok) {
      // Try to read error body for diagnosability
      let errMsg = ''
      try {
        const errData = await response.json() as Record<string, unknown>
        const apiError = errData.error as Record<string, unknown> | undefined
        errMsg = typeof apiError?.message === 'string' ? apiError.message.slice(0, 120) : ''
      } catch { /* ignore */ }

      if (errMsg) {
        console.warn('[gemini]', response.status, errMsg)
      }

      // 400 mentioning thinkingConfig → retry same model without thinkingConfig
      if (
        response.status === 400 &&
        (errMsg.toLowerCase().includes('thinkingconfig') || errMsg.toLowerCase().includes('invalid_argument'))
      ) {
        supportsThinkingConfig[modelName] = false

        // Retry same model once without thinkingConfig
        let retryResponse: Response
        try {
          retryResponse = await fetch(buildEndpoint(modelName), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
            },
            body: buildRequestBody(modelName, systemPrompt, userPrompt, maxOutputTokens, temperature),
          })
        } catch {
          throw new Error(mapError(null, true))
        }

        if (!retryResponse.ok) {
          throw new Error(mapError(retryResponse.status, false))
        }

        workingModelIdx = idx
        let retryData: unknown
        try {
          retryData = await retryResponse.json()
        } catch {
          throw new Error(mapError(null, false))
        }

        try {
          return parseReply(retryData)
        } catch (retryErr) {
          if (retryErr instanceof Error && retryErr.message === SENTINEL_CUT_OFF) {
            return "Gemini's reply got cut off — try again."
          }
          throw new Error(mapError(null, false))
        }
      }

      throw new Error(mapError(response.status, false))
    }

    // Success — lock in this model index for subsequent calls.
    workingModelIdx = idx

    let data: unknown
    try {
      data = await response.json()
    } catch {
      throw new Error(mapError(null, false))
    }

    try {
      const text = parseReply(data)
      return text
    } catch (err) {
      if (err instanceof Error) {
        // MAX_TOKENS with empty text → retry once with doubled budget
        if (err.message === SENTINEL_CUT_OFF) {
          const doubledTokens = maxOutputTokens * 2
          let retryResponse: Response
          try {
            retryResponse = await fetch(buildEndpoint(modelName), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
              },
              body: buildRequestBody(modelName, systemPrompt, userPrompt, doubledTokens, temperature),
            })
          } catch {
            throw new Error(mapError(null, true))
          }

          if (!retryResponse.ok) {
            throw new Error("Gemini's reply got cut off — try again.")
          }

          let retryData: unknown
          try {
            retryData = await retryResponse.json()
          } catch {
            throw new Error("Gemini's reply got cut off — try again.")
          }

          try {
            return parseReply(retryData)
          } catch {
            throw new Error("Gemini's reply got cut off — try again.")
          }
        }

        // blockReason or other parseReply errors — propagate as-is (already friendly)
        if (
          err.message.includes("can't be answered") ||
          err.message.includes('rephrasing')
        ) {
          throw err
        }
      }
      throw new Error(mapError(null, false))
    }
  }

  // All candidates returned 404 — reset so the next call probes from the top.
  workingModelIdx = 0
  throw new Error(mapError(null, false))
}

export type ValidateResult = { ok: true } | { ok: false; message: string }

/**
 * Validate an API key by sending a minimal generateContent call.
 * Returns { ok: true } on success, { ok: false; message } with a student-friendly
 * message on failure. Never throws (callers can use the result directly).
 */
export async function validateGeminiKey(apiKey: string): Promise<ValidateResult> {
  try {
    await generateGeminiReply(apiKey, 'You are a helpful assistant.', 'Say OK', {
      maxOutputTokens: 32,
      temperature: 0,
    })
    return { ok: true }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Gemini ran into a problem — please try again in a moment."
    return { ok: false, message }
  }
}
