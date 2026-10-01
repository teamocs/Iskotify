import { mostCommonSubtest, questionSubtest, groupSectionResults } from '../examSubmit'

const fq = (sectionName: string, subtest: string, correctIndex = 0) => ({ sectionName, q: { subtest, correctIndex } })

describe('questionSubtest', () => {
  it("uses the question's own canonical subtest, not the section display name", () => {
    expect(questionSubtest(fq('Language Proficiency (English & Filipino)', 'Language Proficiency'))).toBe('Language Proficiency')
  })

  it('falls back to the section name only when the question has no subtest', () => {
    expect(questionSubtest(fq('Science', ''))).toBe('Science')
  })
})

describe('mostCommonSubtest', () => {
  it('returns the most frequent value, first seen on a tie', () => {
    expect(mostCommonSubtest(['A', 'B', 'B'])).toBe('B')
    expect(mostCommonSubtest(['A', 'B'])).toBe('A')
  })

  it('is null for an empty list', () => {
    expect(mostCommonSubtest([])).toBeNull()
  })
})

describe('groupSectionResults', () => {
  it('groups by section, scoring correct/total and carrying the canonical subtest', () => {
    const qs = [
      fq('Language Proficiency (English & Filipino)', 'Language Proficiency', 1),
      fq('Language Proficiency (English & Filipino)', 'Language Proficiency', 2),
      fq('Math', 'Mathematics', 0),
    ]
    const res = groupSectionResults(qs, { 0: 1, 1: 0, 2: 0 })
    expect(res).toEqual([
      { sectionName: 'Language Proficiency (English & Filipino)', subtest: 'Language Proficiency', correct: 1, total: 2 },
      { sectionName: 'Math', subtest: 'Mathematics', correct: 1, total: 1 },
    ])
  })

  it('uses the most common subtest when a section mixes subtests', () => {
    const qs = [fq('Mixed', 'Science'), fq('Mixed', 'Mathematics'), fq('Mixed', 'Mathematics')]
    expect(groupSectionResults(qs, {})[0]!.subtest).toBe('Mathematics')
  })
})
