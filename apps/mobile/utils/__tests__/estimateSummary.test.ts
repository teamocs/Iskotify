import { estimateSummaryLabel } from '../estimateSummary'
import { MIN_ANSWERS, type Readiness } from '../subtestReadiness'

function readiness(overrides: Partial<Readiness> = {}): Readiness {
  const notStarted = { percent: null, answered: 0, needed: MIN_ANSWERS }
  return {
    math: notStarted,
    reading: notStarted,
    language: notStarted,
    science: notStarted,
    ready: false,
    ...overrides,
  }
}

describe('estimateSummaryLabel', () => {
  it('prompts to add grades when there are no grades yet', () => {
    expect(estimateSummaryLabel({ status: 'no-grades', readiness: null, result: null })).toBe('Add your grades')
  })

  it('prompts to add grades when the disclaimer has not been acknowledged', () => {
    // The card itself never shows the disclaimer modal — tapping it opens the
    // full screen, which gates on the disclaimer. Same call-to-action as no-grades.
    expect(estimateSummaryLabel({ status: 'disclaimer', readiness: null, result: null })).toBe('Add your grades')
  })

  it('shows total questions still needed across all four subtests when not ready', () => {
    const r = readiness({
      math: { percent: null, answered: 5, needed: 15 },
      reading: { percent: null, answered: 0, needed: 20 },
      language: { percent: 80, answered: 20, needed: 0 },
      science: { percent: null, answered: 10, needed: 10 },
    })
    expect(estimateSummaryLabel({ status: 'not-ready', readiness: r, result: null }))
      .toBe('Practice 45 more questions to unlock')
  })

  it('singularizes "question" when exactly 1 is needed', () => {
    const r = readiness({
      math: { percent: 80, answered: 20, needed: 0 },
      reading: { percent: 80, answered: 20, needed: 0 },
      language: { percent: 80, answered: 20, needed: 0 },
      science: { percent: null, answered: 19, needed: 1 },
    })
    expect(estimateSummaryLabel({ status: 'not-ready', readiness: r, result: null }))
      .toBe('Practice 1 more question to unlock')
  })

  it('shows the low–high range when ready', () => {
    expect(estimateSummaryLabel({
      status: 'ready',
      readiness: readiness({ ready: true }),
      result: { point: 2.35, low: 2.15, high: 2.55 },
    })).toBe('2.15–2.55')
  })

  it('returns a loading label while loading', () => {
    expect(estimateSummaryLabel({ status: 'loading', readiness: null, result: null })).toBe('Loading…')
  })

  it('returns an unavailable label on error', () => {
    expect(estimateSummaryLabel({ status: 'error', readiness: null, result: null })).toBe('Estimate unavailable')
  })
})
