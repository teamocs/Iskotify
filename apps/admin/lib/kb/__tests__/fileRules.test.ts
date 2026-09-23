import { describe, it, expect } from 'vitest'
import { resolveFileRule, fileKeyOf } from '../fileRules'

describe('fileKeyOf', () => {
  it('slugs the file stem so it can namespace question ids', () => {
    expect(fileKeyOf('UPCAT-Math-500-Questions.csv')).toBe('upcat-math-500-questions')
    expect(fileKeyOf('USTET_Mental Ability_500_Batch2.csv')).toBe('ustet-mental-ability-500-batch2')
  })
})

describe('resolveFileRule', () => {
  it.each([
    ['UPCAT-Math-500-Questions.csv', 'Mathematics'],
    ['UPCAT-Science-600-Questions.csv', 'Science'],
    ['UPCAT-Language-600-Questions.csv', 'Language Proficiency'],
    ['UPCAT-Reading-500-Questions.csv', 'Reading Comprehension'],
    ['ACET_General_Knowledge_500Q_Set2.csv', 'General Information'],
    ['USTET_Mental Ability_500_Batch2.csv', 'Mental Ability'],
  ])('maps %s to subtest %s', (name, subtest) => {
    const rule = resolveFileRule(name)
    expect(rule?.kind).toBe('import')
    if (rule?.kind === 'import') expect(rule.subtest).toBe(subtest)
  })

  it('skips PSHS NCE (Grade 6 → 7 audience, outside Iskotify)', () => {
    const rule = resolveFileRule('PSHS_NCE_300_Questions.csv')
    expect(rule).toEqual({ kind: 'skip', reason: expect.stringMatching(/PSHS/) })
  })

  it('returns null for an unrecognised file so it is flagged, never guessed', () => {
    expect(resolveFileRule('random-questions.csv')).toBeNull()
  })

  it('tags ACET general knowledge with the blueprint skill category', () => {
    const rule = resolveFileRule('ACET_General_Knowledge_500Q_Set2.csv')
    expect(rule?.kind === 'import' && rule.skillCategory('Philippine Constitution')).toBe('General Information')
  })

  it('splits USTET mental ability into non-verbal (sequences) and verbal reasoning', () => {
    const rule = resolveFileRule('USTET_Mental Ability_500_Batch2.csv')
    if (rule?.kind !== 'import') throw new Error('expected import rule')
    expect(rule.skillCategory('Number Sequence')).toBe('Abstract/Non-Verbal Reasoning')
    expect(rule.skillCategory('Verbal Analogy')).toBe('Verbal Reasoning')
    expect(rule.skillCategory('Syllogism / Logical Reasoning')).toBe('Verbal Reasoning')
  })

  it('leaves UPCAT skill category to the importer default', () => {
    const rule = resolveFileRule('UPCAT-Math-500-Questions.csv')
    expect(rule?.kind === 'import' && rule.skillCategory('Algebra')).toBe('')
  })
})
