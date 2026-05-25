import { makeLabelId } from '../useNoteLabels'

describe('makeLabelId', () => {
  it('starts with label_', () => {
    expect(makeLabelId()).toMatch(/^label_/)
  })

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => makeLabelId()))
    expect(ids.size).toBe(100)
  })
})
