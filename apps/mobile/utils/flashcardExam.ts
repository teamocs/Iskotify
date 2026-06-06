export const QUICK_SIZE = 15
export const FULL_CAP = 60

function norm(s: string): string { return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim() }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!] }
  return a
}

export function pickQuestions<T extends { stem: string }>(all: T[], mode: 'quick' | 'full'): T[] {
  const seen = new Set<string>()
  const deduped: T[] = []
  for (const item of all) { const k = norm(item.stem); if (k && !seen.has(k)) { seen.add(k); deduped.push(item) } }
  if (mode === 'full') return deduped.slice(0, FULL_CAP)
  if (deduped.length <= QUICK_SIZE) return deduped
  return shuffle(deduped).slice(0, QUICK_SIZE)
}
