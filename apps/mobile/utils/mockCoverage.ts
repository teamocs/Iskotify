// Honest per-exam availability for the Mock exams list: is the whole mock
// ready, only some sections, or nothing yet? Pure — the screen passes the
// blueprint's sections and the runnable count per skill category
// (services/examBlueprints.getRunnableCountsByCategory).

export interface MockCoverage {
  kind: 'full' | 'partial' | 'none'
  /** Sections whose whole item count can be built now. */
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
  let anyItems = false
  for (const sec of [...sections].sort((a, b) => a.displayOrder - b.displayOrder)) {
    const avail = left.get(sec.skillCategory) ?? 0
    const take = Math.min(sec.itemCount, avail)
    left.set(sec.skillCategory, avail - Math.max(take, 0))
    if (take > 0) anyItems = true
    if (take >= sec.itemCount) ready++
  }
  const total = sections.length
  if (!anyItems) return { kind: 'none', readySections: 0, totalSections: total, label: 'Coming soon' }
  if (ready === total) return { kind: 'full', readySections: ready, totalSections: total, label: 'Full mock ready' }
  return { kind: 'partial', readySections: ready, totalSections: total, label: `Partial — ${ready} of ${total} sections` }
}
