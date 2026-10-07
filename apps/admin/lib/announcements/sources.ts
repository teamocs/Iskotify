// admissions_updates.sources is a jsonb list of {label, url} links: the shape
// the app's News detail reads (apps/mobile/components/updates/NewsDetailModal).
// Everything that writes the column goes through toSourceLinks, so only
// http(s) URLs are ever stored.

export interface SourceLink {
  label: string
  url: string
}

const MAX_SOURCES = 10
const MAX_LABEL = 80

/** The URL if it is an absolute http(s) URL, else null. */
export function httpUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s || /\s/.test(s)) return null
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:' ? s : null
  } catch {
    return null
  }
}

const hostLabel = (url: string) => new URL(url).hostname.replace(/^www\./, '')

/**
 * Any of: a list of URL strings, a list of {url, label?} links, or newline-
 * separated text (the admin form) → deduped {label, url} links, http(s) only.
 */
export function toSourceLinks(input: unknown): SourceLink[] {
  const items: unknown[] = typeof input === 'string' ? input.split(/\r?\n/) : Array.isArray(input) ? input : []
  const out: SourceLink[] = []
  const seen = new Set<string>()
  for (const item of items) {
    const raw = typeof item === 'string' ? item : item && typeof item === 'object' ? (item as { url?: unknown }).url : null
    const url = httpUrl(raw)
    if (!url || seen.has(url)) continue
    seen.add(url)
    const given = item && typeof item === 'object' ? (item as { label?: unknown }).label : null
    const label = typeof given === 'string' && given.trim() ? given.trim().slice(0, MAX_LABEL) : hostLabel(url)
    out.push({ label, url })
    if (out.length >= MAX_SOURCES) break
  }
  return out
}

/** The URLs in a sources value of either shape (strings or links). */
export function sourceUrls(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input
    .map(s => (typeof s === 'string' ? s : s && typeof s === 'object' ? (s as { url?: unknown }).url : null))
    .filter((u): u is string => typeof u === 'string' && u.length > 0)
}
