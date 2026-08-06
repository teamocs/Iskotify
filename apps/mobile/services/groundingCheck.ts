/**
 * groundingCheck.ts — deterministic post-generation fact verifier.
 *
 * Phase 3 (T3.2) grounding enforcement: a hard, LLM-independent backstop that
 * extracts the "checkable facts" from a generated answer (URLs, years, and
 * currency-tagged peso amounts) and verifies EVERY one is present in the RAG
 * context the answer was grounded on. Any fabricated date/amount/URL that the
 * context does not support → grounded=false, so the caller can replace the
 * answer with a safe fallback instead of showing a confidently-wrong figure.
 *
 * Precision-biased on purpose: only years, currency-tagged amounts, and URLs
 * are treated as claims. Bare small numbers in advice ("focus 30 minutes",
 * "5-day streak", percentages) are NOT claims — they must never trigger a
 * false rejection of an otherwise-fine answer.
 *
 * Pure: no React, no DB, no network. OTA-safe JS.
 */

export interface ClaimSet {
  urls: string[]
  years: string[]
  amounts: string[]
}

// http(s) URLs up to the first whitespace or closing paren.
const URL_RE = /https?:\/\/[^\s)]+/gi
// 4-digit years in the 1900–2099 range (avoids matching arbitrary counts).
const YEAR_RE = /\b(?:19|20)\d{2}\b/g
// Currency-PREFIXED amounts: ₱, php, or a leading "p" + a number (with commas/decimals).
const AMOUNT_PREFIX_RE = /(?:₱|php|p)\s?\d[\d,]*(?:\.\d+)?/gi
// Currency-SUFFIXED amounts: a 3+ digit number followed by "pesos"/"php".
const AMOUNT_SUFFIX_RE = /\b\d[\d,]{2,}\s*(?:pesos?|php)\b/gi

/**
 * extractClaims — pull the verifiable facts (URLs, years, currency-tagged
 * amounts) out of a piece of text. Bare numbers without a currency tag and
 * numbers outside the year range are intentionally ignored.
 */
export function extractClaims(text: string): ClaimSet {
  const safe = text ?? ''
  const urls = safe.match(URL_RE) ?? []
  const years = safe.match(YEAR_RE) ?? []
  const amounts = [
    ...(safe.match(AMOUNT_PREFIX_RE) ?? []),
    ...(safe.match(AMOUNT_SUFFIX_RE) ?? []),
  ]
  return { urls, years, amounts }
}

/** Strip everything but digits (₱50,000 → "50000"). */
function digitsOnly(s: string): string {
  return s.replace(/\D/g, '')
}

/**
 * verifyGrounding — return grounded=false + the unsupported claims when ANY
 * URL / year / amount in `answer` is missing from `context`. grounded=true when
 * there are no claims or every claim is supported.
 *
 * Matching rules:
 *   - URL:    case-insensitive substring of the context.
 *   - year:   literal substring of the context.
 *   - amount: digit-run match — strip non-digits from the amount and require
 *             that exact digit sequence to appear among the context's digit
 *             runs (commas removed first, so "₱50,000" is grounded by both
 *             "50000" and "50,000").
 */
export function verifyGrounding(
  answer: string,
  context: string,
): { grounded: boolean; unsupported: string[] } {
  const claims = extractClaims(answer)
  const ctx = context ?? ''
  const ctxLower = ctx.toLowerCase()
  // Context digit sequences with comma separators removed so grouped numbers
  // ("50,000") collapse to a single run ("50000") for comparison.
  const ctxDigitRuns = new Set(ctx.replace(/,/g, '').match(/\d+/g) ?? [])
  const unsupported: string[] = []

  for (const url of claims.urls) {
    if (!ctxLower.includes(url.toLowerCase())) unsupported.push(url)
  }
  for (const year of claims.years) {
    if (!ctx.includes(year)) unsupported.push(year)
  }
  for (const amount of claims.amounts) {
    const digits = digitsOnly(amount)
    if (digits.length === 0) continue
    if (!ctxDigitRuns.has(digits)) unsupported.push(amount)
  }

  return { grounded: unsupported.length === 0, unsupported }
}
