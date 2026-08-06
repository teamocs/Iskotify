export const QUICK_SIZE = 15
export const FULL_CAP = 60

function norm(s: string): string { return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim() }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!] }
  return a
}

/**
 * pickQuestions — sizes/orders a deduped card pool for a quiz run.
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
  const seen = new Set<string>()
  const deduped: T[] = []
  for (const item of all) { const k = norm(item.stem); if (k && !seen.has(k)) { seen.add(k); deduped.push(item) } }

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
