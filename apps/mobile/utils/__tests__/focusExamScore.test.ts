import { focusExamScore } from '../focusExamScore'

describe('focusExamScore', () => {
  it('calls a full-mock result the best score', () => {
    expect(focusExamScore(78, 55)).toEqual({ pct: 78, label: 'Best score' })
  })

  it('labels the practice-accuracy fallback honestly — it is not a best score', () => {
    expect(focusExamScore(undefined, 55)).toEqual({ pct: 55, label: 'Practice accuracy' })
  })

  it('says so when there is nothing yet', () => {
    expect(focusExamScore(undefined, undefined)).toEqual({ pct: null, label: 'No score yet' })
  })
})
