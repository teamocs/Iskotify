/**
 * Gemini REST client for Kuya Baw cloud mode (BYOK).
 *
 * Security contract:
 * - The API key is ALWAYS sent via the x-goog-api-key header — never embedded in the URL
 *   (URL query params appear in server logs, proxies, and network traces).
 * - The key is NEVER included in thrown errors, logged messages, or the raw response body.
 * - Error messages are student-friendly; they contain zero information about the key itself.
 */

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent'

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

/**
 * Call the Gemini generateContent API and return the reply text.
 * Throws a student-friendly Error on failure (never containing the key or raw response body).
 */
export async function generateGeminiReply(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  opts: GeminiOpts = {},
): Promise<string> {
  const { maxOutputTokens = 200, temperature = 0.2 } = opts

  let response: Response
  try {
    response = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
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
      }),
    })
  } catch {
    // Network-level failure (offline, DNS, etc.)
    throw new Error(mapError(null, true))
  }

  if (!response.ok) {
    throw new Error(mapError(response.status, false))
  }

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error(mapError(null, false))
  }

  // Parse candidates[0].content.parts[*].text joined
  try {
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
  } catch {
    throw new Error(mapError(null, false))
  }
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
