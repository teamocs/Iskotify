export const QUICK_SIZE = 15
export const FULL_CAP = 60

function norm(s: string): string { return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim() }

/**
 * dedupeByStem — THE single definition of "duplicate flashcard": two items
 * collide when their `stem` normalizes (lowercase, whitespace-collapsed,
 * trimmed) to the same text; first occurrence wins, items with an empty
 * normalized stem are dropped.
 *
 * pickQuestions (below) applies this to size a quiz. services/srsAggregates.ts's
 * getDueFlashcards applies the SAME function (imported from here, not
 * reimplemented) to the due-card row set before counting, so a "Due today (N)"
 * badge — built from that count — can never promise more cards than a
 * same-inputs pickQuestions('due', …) call actually deals out (Task H
 * bugfix: the two used to dedupe independently — pickQuestions deduped,
 * getDueCounts/getDueFlashcards didn't — so duplicate-stem due cards made the
 * badge overstate the quiz).
 */
export function dedupeByStem<T extends { stem: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    const k = norm(item.stem)
    if (k && !seen.has(k)) { seen.add(k); out.push(item) }
  }
  return out
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!] }
  return a
}

/**
 * pickQuestions — sizes/orders a deduped (dedupeByStem) card pool for a quiz run.
 *
 * 'due' mode (Task H) draws from `dueAtById` — a flashcardId → dueAt map
 * (from services/srsAggregates.ts's getDueFlashcards) — keeping only items
 * present in it (i.e. actually due) and ordering the MOST overdue first
 * (smallest/oldest dueAt), capped at FULL_CAP. Items without an `id` or with
 * no entry in `dueAtById` are dropped, so passing an empty/undefined map
 * yields an empty due session rather than silently falling back to "all".
 */
export function pickQuestions<T extends { stem: string; id?: string }>(
  all: T[],
  mode: 'quick' | 'full' | 'due',
  dueAtById?: Record<string, number>,
): T[] {
  const deduped = dedupeByStem(all)

  if (mode === 'due') {
    const map = dueAtById ?? {}
    const due = deduped.filter(item => item.id != null && Object.prototype.hasOwnProperty.call(map, item.id))
    due.sort((a, b) => (map[a.id as string] ?? 0) - (map[b.id as string] ?? 0))
    return due.slice(0, FULL_CAP)
  }

  if (mode === 'full') return deduped.slice(0, FULL_CAP)
  if (deduped.length <= QUICK_SIZE) return deduped
  return shuffle(deduped).slice(0, QUICK_SIZE)
}
