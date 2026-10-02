import { describe, it, expect } from 'vitest'
import { resolveFileRule, fileKeyOf, ALL_SUBTESTS, defaultSkillCategory } from '../fileRules'

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

  it.each([
    'DOST_Mechanical-Technical_300Q.csv',
    'DOST-SEI Mechanical Ability 200.xlsx',
    'Mechanical_Reasoning_Batch1.csv',
  ])('maps %s to the DOST Mechanical-Technical pool', name => {
    const rule = resolveFileRule(name)
    if (rule?.kind !== 'import') throw new Error('expected import rule')
    expect(rule.subtest).toBe('Mechanical-Technical')
    expect(rule.skillCategory('Pulleys and Levers')).toBe('Mechanical-Technical')
  })

  it('offers Mechanical-Technical as a pool an admin or AI mapping can pick, with its blueprint skill', () => {
    expect(ALL_SUBTESTS).toContain('Mechanical-Technical')
    expect(defaultSkillCategory('Mechanical-Technical')('Gears')).toBe('Mechanical-Technical')
  })

  it('leaves UPCAT skill category to the importer default', () => {
    const rule = resolveFileRule('UPCAT-Math-500-Questions.csv')
    expect(rule?.kind === 'import' && rule.skillCategory('Algebra')).toBe('')
  })
})

// What sync does with each file in the production Drive folder (2026-10). These
// must not move when the name rules grow: same pool, same skill split, same skips.
describe('resolveFileRule — the files already in Drive', () => {
  it.each([
    ['UPCAT-Math-500-Questions.csv', 'Mathematics'],
    ['UPCAT-Science-600-Questions.csv', 'Science'],
    ['UPCAT-Language-600-Questions.csv', 'Language Proficiency'],
    ['UPCAT-Reading-500-Questions.csv', 'Reading Comprehension'],
    ['ACET_General_Knowledge_300Q.xlsx', 'General Information'],
    ['ACET_General_Knowledge_500Q_Set2.csv', 'General Information'],
    ['USTET_Mental Ability_300.xlsx', 'Mental Ability'],
    ['USTET_Mental Ability_500_Batch2.csv', 'Mental Ability'],
  ])('%s → %s', (name, subtest) => {
    const rule = resolveFileRule(name)
    expect(rule).toMatchObject({ kind: 'import', subtest, mainSubject: subtest })
  })

  it.each(['PSHS_NCE_300_Questions.csv', 'PSHS_NCE_Research_MockExam_300Questions.docx', 'PSHS Math Reviewer.csv'])(
    'skips %s as PSHS (wrong audience), before any section keyword',
    name => expect(resolveFileRule(name)).toMatchObject({ kind: 'skip', reason: expect.stringMatching(/PSHS/) }),
  )

  it('maps the Word file ACET_Abstract_Reasoning_300Q_Visual.docx to a pool, though sync still skips it as a Word file', () => {
    // syncDriveFolder.test: "records unknown, out-of-scope and unsupported files" keeps it skipped.
    const rule = resolveFileRule('ACET_Abstract_Reasoning_300Q_Visual.docx')
    if (rule?.kind !== 'import') throw new Error('expected import rule')
    expect(rule.subtest).toBe('Mental Ability')
    expect(rule.skillCategory('Figure Series')).toBe('Abstract/Non-Verbal Reasoning')
  })

  it('keeps the USTET mental-ability split by topic for the real files', () => {
    for (const name of ['USTET_Mental Ability_300.xlsx', 'USTET_Mental Ability_500_Batch2.csv']) {
      const rule = resolveFileRule(name)
      if (rule?.kind !== 'import') throw new Error('expected import rule')
      expect(rule.skillCategory('Number Sequence')).toBe('Abstract/Non-Verbal Reasoning')
      expect(rule.skillCategory('Syllogism')).toBe('Verbal Reasoning')
    }
  })
})

describe('resolveFileRule — section keywords anywhere in the name, any exam', () => {
  it.each([
    // [file name, pool, skill_category for a sample topic ('' = importer's subtest default)]
    ['DCAT_Math_200.csv', 'Mathematics', ''],
    ['PUPCET mathematics set 1.xlsx', 'Mathematics', ''],
    ['DOST-SEI Numerical Ability.csv', 'Mathematics', ''],
    ['UPCAT_Mathematics_Batch3.csv', 'Mathematics', ''],
    ['acet-science-300.csv', 'Science', ''],
    ['USTET Science Reviewer.xlsx', 'Science', ''],
    ['ACET_English_300Q.csv', 'Language Proficiency', ''],
    ['DCAT Language Usage.xlsx', 'Language Proficiency', ''],
    ['PUPCET_Grammar_Drill.csv', 'Language Proficiency', ''],
    ['ACET_Reading_Comprehension_200.csv', 'Reading Comprehension', ''],
    ['USTET-READING.csv', 'Reading Comprehension', ''],
    ['PUPCET_General_Information_200.csv', 'General Information', 'General Information'],
    ['USTET GeneralKnowledge.xlsx', 'General Information', 'General Information'],
    ['DCAT_Current-Events_2026.csv', 'General Information', 'General Information'],
    ['DOST_Mental_Ability_300.csv', 'Mental Ability', 'Verbal Reasoning'],
    ['ACET_Logical_Reasoning.csv', 'Mental Ability', 'Verbal Reasoning'],
    ['USTET Logic Drills.csv', 'Mental Ability', 'Verbal Reasoning'],
    ['UPCAT_Biological_Science.csv', 'Science', ''],
    ['ACET_Abstract_Reasoning_200.csv', 'Mental Ability', 'Abstract/Non-Verbal Reasoning'],
    ['USTET Non-Verbal Reasoning.xlsx', 'Mental Ability', 'Abstract/Non-Verbal Reasoning'],
    ['USTET_NonVerbal_Batch1.csv', 'Mental Ability', 'Abstract/Non-Verbal Reasoning'],
    ['USTET Verbal Reasoning.csv', 'Mental Ability', 'Verbal Reasoning'],
    ['ACET_Verbal_Analogy_100.csv', 'Mental Ability', 'Verbal Reasoning'],
    ['DOST_Mechanical-Technical_300Q.csv', 'Mechanical-Technical', 'Mechanical-Technical'],
  ])('%s → %s (%s)', (name, subtest, skill) => {
    const rule = resolveFileRule(name)
    if (rule?.kind !== 'import') throw new Error(`expected an import rule for ${name}`)
    expect(rule.subtest).toBe(subtest)
    expect(rule.mainSubject).toBe(subtest)
    // A topic that, left to the topic split, would be verbal — so a forced skill shows.
    expect(rule.skillCategory('Analogy')).toBe(skill)
  })

  it('lets the topic split mental-ability files whose name names no reasoning type', () => {
    const rule = resolveFileRule('DOST_Mental_Ability_300.csv')
    if (rule?.kind !== 'import') throw new Error('expected import rule')
    expect(rule.skillCategory('Figure Sequence')).toBe('Abstract/Non-Verbal Reasoning')
  })

  it('forces the skill when the name says the reasoning type, whatever the row topic', () => {
    const abstract = resolveFileRule('ACET_Abstract_Reasoning_200.csv')
    const verbal = resolveFileRule('USTET Verbal Reasoning.csv')
    if (abstract?.kind !== 'import' || verbal?.kind !== 'import') throw new Error('expected import rules')
    expect(abstract.skillCategory('Syllogism')).toBe('Abstract/Non-Verbal Reasoning')
    expect(verbal.skillCategory('Number Sequence')).toBe('Verbal Reasoning')
  })

  it.each([
    'math_science_combined.csv',
    'UST English and Reading.xlsx',
    'Science-Mechanical Mix.csv',
    'Abstract Math Puzzles.csv',
    'General Knowledge + Logical Reasoning.csv',
  ])('does not guess when %s names two sections — AI or an admin decides', name => {
    expect(resolveFileRule(name)).toBeNull()
  })

  it.each(['questions-batch-7.csv', 'Mock Exam 2026.xlsx', 'Untitled spreadsheet', 'ACET_300Q.csv'])(
    'returns null for %s (no section in the name)',
    name => expect(resolveFileRule(name)).toBeNull(),
  )
})
