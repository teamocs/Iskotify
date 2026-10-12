// admissions_updates.sources → the links the News detail shows. The admin
// console writes [{label, url}]; older rows hold plain URL strings. Only
// http(s) URLs are ever shown or opened (nothing else reaches Linking.openURL).
//
// A regex rather than `new URL()`: React Native's URL implementation is partial.

export interface NewsSource {
  label: string
  url: string
}

const HTTP_URL = /^https?:\/\/([^\s/?#@]+@)?([^\s/?#:@]+)(:\d+)?([/?#][^\s]*)?$/i

export function isHttpUrl(v: unknown): v is string {
  return typeof v === 'string' && HTTP_URL.test(v)
}

/** A URL's host, lowercased, without a leading www. */
export const hostOf = (url: string) => (url.match(HTTP_URL)?.[2] ?? url).toLowerCase().replace(/^www\./, '')

export function newsSources(raw: unknown): NewsSource[] {
  if (!Array.isArray(raw)) return []
  const out: NewsSource[] = []
  for (const s of raw) {
    const url = typeof s === 'string' ? s : s && typeof s === 'object' ? (s as { url?: unknown }).url : null
    if (!isHttpUrl(url)) continue
    const given = s && typeof s === 'object' ? (s as { label?: unknown }).label : null
    out.push({ label: typeof given === 'string' && given.trim() ? given.trim() : hostOf(url), url })
  }
  return out
}

/**
 * The host of the first http(s) source, for a "Source: sei.dost.gov.ph" line.
 * Takes the stored form (a JSON string) or the parsed array. Null when the
 * row has no usable source: a host is never made up.
 */
export function firstSourceHost(raw: unknown): string | null {
  let value = raw
  if (typeof raw === 'string') {
    if (isHttpUrl(raw)) return hostOf(raw)
    try { value = JSON.parse(raw) } catch { return null }
  }
  const first = newsSources(value)[0]
  return first ? hostOf(first.url) : null
}
