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

// Module-level sticky index so a working model survives across calls.
// Reset to 0 only when all candidates fail (forces a fresh probe on the next call).
let workingModelIdx = 0

/** Exported for test isolation only — do NOT call in production code. */
export function _resetModelIdxForTests(): void {
  workingModelIdx = 0
}

function buildEndpoint(modelName: string): string {
  return `${GEMINI_ENDPOINT_BASE}${modelName}:generateContent`
}

interface GeminiOpts {
  maxOutputTokens?: number
  temperature?: number
}

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
  return "Gemini ran into a problem — please try again in a moment."
}

function buildRequestBody(
  systemPrompt: string,
  userPrompt: string,
  maxOutputTokens: number,
  temperature: number,
): string {
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
    generationConfig: {
      maxOutputTokens,
      temperature,
    },
  })
}

function parseReply(data: unknown): string {
  const candidates = (data as Record<string, unknown>).candidates
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('no candidates')
  }
  const content = (candidates[0] as Record<string, unknown>).content as Record<string, unknown>
  const parts = content.parts as Array<Record<string, unknown>>
  const text = parts
    .map(p => (typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim()
  if (!text) throw new Error('empty reply')
  return text
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
  const requestBody = buildRequestBody(systemPrompt, userPrompt, maxOutputTokens, temperature)

  // Try starting from the remembered working index, then fall forward through the list.
  const startIdx = workingModelIdx
  for (let offset = 0; offset < GEMINI_MODELS.length; offset++) {
    const idx = (startIdx + offset) % GEMINI_MODELS.length
    const endpoint = buildEndpoint(GEMINI_MODELS[idx]!)

    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: requestBody,
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
      return parseReply(data)
    } catch {
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
      maxOutputTokens: 5,
      temperature: 0,
    })
    return { ok: true }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Gemini ran into a problem — please try again in a moment."
    return { ok: false, message }
  }
}
