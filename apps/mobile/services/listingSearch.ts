import { searchListings, reorderByIds, type SearchableListing } from '../utils/listingSearch'
import { modelExists, runRawCompletion } from './llm'

const ADMIN_BASE_URL = process.env.EXPO_PUBLIC_ADMIN_BASE_URL ?? 'https://iskotify.vercel.app'

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

function expansionPrompt(q: string): string {
  return `Expand this student's search into related keywords (courses, fields, synonyms) for matching Philippine college entrance exams and scholarships. Output ONLY comma-separated keywords, no sentences.\nSearch: ${q}\nKeywords:`
}

/**
 * Hybrid "talk-to-AI" search, run on submit. Tiers, with graceful degradation:
 *   1. Gemini via the admin proxy (best, online) — returns a relevance-ranked id list.
 *   2. On-device LLM query expansion → the offline keyword ranker (no network).
 *   3. null → caller keeps the instant keyword results it already shows.
 *
 * Returns reordered listings, or null to fall back to keyword results.
 */
export async function aiSearchListings(
  query: string,
  listings: SearchableListing[],
  userRegion?: string | null,
): Promise<SearchableListing[] | null> {
  const q = query.trim()
  if (!q || listings.length === 0) return null

  // Tier 1 — Gemini proxy.
  try {
    const items = listings.slice(0, 120).map(l => ({
      id: l.id, title: l.title, type: l.type, region: l.region ?? '', provider: l.provider ?? '',
    }))
    const res = await fetchWithTimeout(
      `${ADMIN_BASE_URL}/api/search/listings`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, items }) },
      8000,
    )
    if (res.ok) {
      const body = await res.json() as { ids?: unknown }
      if (Array.isArray(body.ids) && body.ids.length > 0) {
        return reorderByIds(listings, body.ids.map(String))
      }
      // Empty ids → fall through to keyword (don't force an empty screen).
    }
  } catch {
    // network/proxy error → fall through
  }

  // Tier 2 — on-device LLM expansion → keyword ranker.
  try {
    if (await modelExists()) {
      const expanded = await runRawCompletion(expansionPrompt(q), 60)
      if (expanded && expanded.trim()) {
        return searchListings(listings, `${q} ${expanded}`, userRegion)
      }
    }
  } catch {
    // model/inference error → fall through
  }

  // Tier 3 — keep the caller's instant keyword results.
  return null
}
