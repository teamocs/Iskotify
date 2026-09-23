import { Image } from 'expo-image'

/**
 * Offline prefetch for a just-built exam/quiz session's figures — a mock exam,
 * subtest drill, or deck/topic/due quiz session so a student who answers
 * offline later still sees the diagram (expo-image caches to disk by URL, so
 * a prefetch now is a cache hit at render time even with no connection).
 */

/** Distinct, non-empty imageUrls out of a session's questions, in first-seen order. */
export function collectImageUrls(items: ReadonlyArray<{ imageUrl?: string | null }>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const url = item.imageUrl
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

/**
 * Prefetch a session's figures to disk cache. Fire-and-forget: never throws,
 * never awaited by the caller, and must never block/delay session start —
 * call it right after building the session's question list and move on.
 */
export function prefetchSessionImages(items: ReadonlyArray<{ imageUrl?: string | null }>): void {
  const urls = collectImageUrls(items)
  if (urls.length === 0) return
  void Image.prefetch(urls, 'disk').catch(() => {
    // Best-effort only — offline, or the URL is stale/unreachable. The
    // QuestionFigure placeholder handles the "still not cached" case later.
  })
}
