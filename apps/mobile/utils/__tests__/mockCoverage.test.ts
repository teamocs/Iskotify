import { mockCoverage } from '../mockCoverage'

const sec = (skillCategory: string, itemCount: number, displayOrder = 1) => ({ skillCategory, itemCount, displayOrder })

describe('mockCoverage', () => {
  it('is a full mock when every section has its whole item count', () => {
    const c = mockCoverage([sec('Math', 50), sec('Verbal', 40, 2)], new Map([['Math', 50], ['Verbal', 100]]))
    expect(c).toEqual({ kind: 'full', readySections: 2, totalSections: 2, label: 'Full mock ready' })
  })

  it('is partial when some section has no questions yet: counts the sections that can run', () => {
    // Math is full, Verbal runs short (10 of 40), Spatial has nothing: 2 of 3 sections run.
    const c = mockCoverage([sec('Math', 50), sec('Verbal', 40, 2), sec('Spatial', 20, 3)], new Map([['Math', 50], ['Verbal', 10]]))
    expect(c).toEqual({ kind: 'partial', readySections: 2, totalSections: 3, label: 'Partial — 2 of 3 sections' })
  })

  it('drains a shared category in section order, like the exam builder', () => {
    // Two sections draw from one pool of 150: the first takes 100, the second gets 50 of 110.
    const c = mockCoverage([sec('Math', 100), sec('Math', 110, 2)], new Map([['Math', 150]]))
    expect(c.label).toBe('Partial — fewer items per section')
  })

  it('never says "0 of M" for a runnable exam: every section short but none empty', () => {
    const c = mockCoverage([sec('Math', 50), sec('Verbal', 40, 2), sec('Spatial', 20, 3)], new Map([['Math', 5], ['Verbal', 5], ['Spatial', 5]]))
    expect(c).toEqual({ kind: 'partial', readySections: 3, totalSections: 3, label: 'Partial — fewer items per section' })
    expect(c.label).not.toMatch(/0 of/)
  })

  it('a later section left empty by a drained shared pool does not count', () => {
    const c = mockCoverage([sec('Math', 100), sec('Math', 50, 2)], new Map([['Math', 100]]))
    expect(c).toEqual({ kind: 'partial', readySections: 1, totalSections: 2, label: 'Partial — 1 of 2 sections' })
  })

  it('is coming soon when nothing can run', () => {
    expect(mockCoverage([sec('Math', 50)], new Map())).toEqual({ kind: 'none', readySections: 0, totalSections: 1, label: 'Coming soon' })
    expect(mockCoverage([], new Map()).kind).toBe('none')
  })
})
