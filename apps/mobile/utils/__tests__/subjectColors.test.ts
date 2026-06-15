import { subjectColor, SUBJECT_PALETTE } from '../subjectColors'

describe('subjectColor', () => {
  it('is deterministic — same id always maps to the same color', () => {
    expect(subjectColor('math-101')).toEqual(subjectColor('math-101'))
  })

  it('returns a palette entry (accent + fill)', () => {
    const c = subjectColor('science')
    expect(SUBJECT_PALETTE).toContainEqual(c)
    expect(c.accent).toMatch(/^#[0-9a-f]{6}$/i)
    expect(c.fill).toMatch(/^rgba\(/)
  })

  it('falls back to the first hue for an empty id', () => {
    expect(subjectColor('')).toEqual(SUBJECT_PALETTE[0])
  })

  it('spreads distinct subjects across multiple hues', () => {
    const ids = ['Language Proficiency', 'Mathematics', 'Reading Comprehension', 'Science']
    const accents = new Set(ids.map(id => subjectColor(id).accent))
    expect(accents.size).toBeGreaterThan(1)
  })
})
