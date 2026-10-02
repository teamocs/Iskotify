// Honest per-exam availability for the Mock exams list: is the whole mock
// ready, only some sections (or every section, but short), or nothing yet? Pure — the screen passes the
// blueprint's sections and the runnable count per skill category
// (services/examBlueprints.getRunnableCountsByCategory).

export interface MockCoverage {
  kind: 'full' | 'partial' | 'none'
  /** Sections that can serve at least one item now (a short section still runs). */
  readySections: number
  totalSections: number
  label: string
}

/**
 * Sections are filled in display order from each category's pool, the same
 * draining the exam builder does (utils/examBuilder.plannedItemCount), so two
 * sections sharing one category cannot both count the same questions.
 */
export function mockCoverage(
  sections: readonly { skillCategory: string; itemCount: number; displayOrder: number }[],
  runnableByCategory: ReadonlyMap<string, number>,
): MockCoverage {
  const left = new Map(runnableByCategory)
  let ready = 0
  let full = 0
  for (const sec of [...sections].sort((a, b) => a.displayOrder - b.displayOrder)) {
    const avail = left.get(sec.skillCategory) ?? 0
    const take = Math.min(sec.itemCount, avail)
    left.set(sec.skillCategory, avail - Math.max(take, 0))
    if (take > 0) ready++
    if (take >= sec.itemCount) full++
  }
  const total = sections.length
  if (ready === 0) return { kind: 'none', readySections: 0, totalSections: total, label: 'Coming soon' }
  if (full === total) return { kind: 'full', readySections: ready, totalSections: total, label: 'Full mock ready' }
  // Some sections missing: say how many run. All run but some short: say so (never "0 of M").
  const label = ready < total ? `Partial — ${ready} of ${total} sections` : 'Partial — fewer items per section'
  return { kind: 'partial', readySections: ready, totalSections: total, label }
}
