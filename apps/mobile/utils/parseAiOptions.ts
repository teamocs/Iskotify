/**
 * Parses a JSON-encoded ai_options column value into a string[] or null.
 * Returns null for missing/empty input, malformed JSON, or non-string-array contents.
 */
export function parseAiOptions(raw: string | null | undefined): string[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    if (!parsed.every(x => typeof x === 'string')) return null
    return parsed as string[]
  } catch {
    return null
  }
}
