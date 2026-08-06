// Anaphoric follow-ups ("what about X", "and the deadline?", pronoun-led, or
// very short) don't carry enough on their own to classify/retrieve. Prepend the
// previous USER question so retrieval has the referent. Self-contained questions
// are returned unchanged so we never dilute a good query.
const ANAPHORIC = /^(what about|how about|and |what of|ok |okay |then |so )/i

export function buildRetrievalQuery(current: string, prevUserText: string | null): string {
  const c = current.trim()
  if (!prevUserText) return c
  const wordCount = c.split(/\s+/).filter(Boolean).length
  const isFollowUp = ANAPHORIC.test(c) || wordCount <= 4
  return isFollowUp ? `${prevUserText.trim()} ${c}` : c
}
