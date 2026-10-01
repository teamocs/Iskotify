import { advanceSectionClocks, clampNavIndex } from '../sectionClock'

const MIN = 60_000

describe('advanceSectionClocks (B3: chained section clocks)', () => {
  const minutes = [10, 20, 30]

  it('does nothing while the current section clock is still running', () => {
    expect(advanceSectionClocks({ sectionIdx: 0, sectionEndTime: 1_000, now: 999, minutes }))
      .toEqual({ finished: false, sectionIdx: 0, sectionEndTime: 1_000 })
  })

  it('chains the next clock from the PREVIOUS end, not from now', () => {
    const end0 = 1_000_000
    const now = end0 + 2 * MIN // app was closed; resumed 2 minutes after section 1 expired
    expect(advanceSectionClocks({ sectionIdx: 0, sectionEndTime: end0, now, minutes }))
      .toEqual({ finished: false, sectionIdx: 1, sectionEndTime: end0 + 20 * MIN })
  })

  it('fast-forwards through several already-expired sections in one pass', () => {
    const end0 = 1_000_000
    const now = end0 + 20 * MIN + 5 * MIN // section 2 (20 min) is over too; 5 min into section 3
    expect(advanceSectionClocks({ sectionIdx: 0, sectionEndTime: end0, now, minutes }))
      .toEqual({ finished: false, sectionIdx: 2, sectionEndTime: end0 + 20 * MIN + 30 * MIN })
  })

  it('finishes the exam when the last section clock has run out', () => {
    const end0 = 1_000_000
    const now = end0 + 20 * MIN + 30 * MIN + 1
    expect(advanceSectionClocks({ sectionIdx: 0, sectionEndTime: end0, now, minutes })).toEqual({ finished: true })
  })

  it('finishes when the last section itself expires', () => {
    expect(advanceSectionClocks({ sectionIdx: 2, sectionEndTime: 5_000, now: 5_000, minutes })).toEqual({ finished: true })
  })
})

describe('clampNavIndex (B1: section lock)', () => {
  it('keeps an index inside [floor, ceil)', () => {
    expect(clampNavIndex(4, 3, 6)).toBe(4)
    expect(clampNavIndex(1, 3, 6)).toBe(3)
    expect(clampNavIndex(9, 3, 6)).toBe(5)
  })
  it('a missing ceiling leaves the upper side free', () => {
    expect(clampNavIndex(99, 3, undefined)).toBe(99)
    expect(clampNavIndex(0, 3, undefined)).toBe(3)
  })
})
