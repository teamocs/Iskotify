import { describe, it, expect } from 'vitest'
import { detectDialect, convertRecords } from '../dialects'
import { resolveFileRule } from '../fileRules'

function ruleFor(name: string) {
  const r = resolveFileRule(name)
  if (r?.kind !== 'import') throw new Error(`no import rule for ${name}`)
  return r
}

describe('detectDialect', () => {
  it('recognises the UPCAT ID/A-D/Answer layout (with or without figure columns)', () => {
    expect(detectDialect(['ID', 'Topic', 'Subtopic', 'Difficulty', 'Question', 'A', 'B', 'C', 'D', 'Answer', 'Solution'])).toBe('abcd-letter')
    expect(detectDialect(['ID', 'Topic', 'Subtopic', 'Difficulty', 'HasFigure', 'FigureFile', 'FigureCaption', 'Question', 'A', 'B', 'C', 'D', 'Answer', 'Solution'])).toBe('abcd-letter')
  })
  it('recognises the reading layout by its stimulus columns', () => {
    expect(detectDialect(['ID', 'Topic', 'StimulusID', 'StimulusTitle', 'StimulusType', 'Language', 'SkillTested', 'Difficulty', 'HasFigure', 'FigureFile', 'FigureCaption', 'Passage', 'Question', 'A', 'B', 'C', 'D', 'Answer', 'Solution'])).toBe('reading-stimulus')
  })
  it('recognises "Option A.. / Correct Answer" and "option_1.. / correct_option" layouts', () => {
    expect(detectDialect(['No.', 'Category', 'Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Explanation'])).toBe('option-letter')
    expect(detectDialect(['id', 'category', 'question', 'option_1', 'option_2', 'option_3', 'option_4', 'correct_option', 'explanation'])).toBe('option-numeric')
  })
  it('returns null for unknown headers', () => {
    expect(detectDialect(['foo', 'bar'])).toBeNull()
  })
})

describe('convertRecords', () => {
  it('converts the UPCAT layout, namespacing ids by file and keeping drafts', () => {
    const { rows, rejected } = convertRecords(ruleFor('UPCAT-Math-500-Questions.csv'), 'abcd-letter', [
      { ID: 'UPCAT-MATH-001', Topic: 'Algebra', Subtopic: 'Ratio', Difficulty: 'Average', Question: 'If x:y = 1:4, x+y:x?', A: '1:5', B: '5:1', C: '4:5', D: '5:4', Answer: 'B', Solution: 'Let x = k.' },
    ])
    expect(rejected).toEqual([])
    expect(rows[0]).toMatchObject({
      question_id: 'upcat-math-500-questions:UPCAT-MATH-001',
      subtest: 'Mathematics', main_subject: 'Mathematics', topic: 'Algebra', subtopic: 'Ratio', difficulty: 'Average',
      question_text: 'If x:y = 1:4, x+y:x?', option_a: '1:5', option_d: '5:4', correct_answer: 'B',
      explanation: 'Let x = k.', status: '', has_visual: 'no',
    })
  })

  it('carries figure references and uses the caption as alt text', () => {
    const { rows } = convertRecords(ruleFor('UPCAT-Science-600-Questions.csv'), 'abcd-letter', [
      { ID: 'UPCAT-SCI-003', Topic: 'Physics', Subtopic: 'Series circuits', Difficulty: 'Average', HasFigure: 'yes', FigureFile: 'diagrams/circuit_3.png', FigureCaption: 'Series circuit with 3 cells', Question: 'Which is correct?', A: 'a', B: 'b', C: 'c', D: 'd', Answer: 'C', Solution: 's' },
    ])
    expect(rows[0]).toMatchObject({ has_visual: 'yes', figure_file: 'diagrams/circuit_3.png', figure_caption: 'Series circuit with 3 cells' })
  })

  it('groups reading questions under a namespaced passage with 1-based positions', () => {
    const base = { Topic: 'Reading Comprehension - Prose passage', StimulusTitle: 'The Sleep Audit', StimulusType: 'Feature article', Language: 'English', SkillTested: 'Main idea', Difficulty: 'Average', HasFigure: 'No', FigureFile: '', FigureCaption: '', A: 'a', B: 'b', C: 'c', D: 'd', Answer: 'A', Solution: 's' }
    const { rows } = convertRecords(ruleFor('UPCAT-Reading-500-Questions.csv'), 'reading-stimulus', [
      { ...base, ID: 'RC001', StimulusID: 'EN01', Passage: 'Students slept 5h40m.', Question: 'Main idea?' },
      { ...base, ID: 'RC002', StimulusID: 'EN01', Passage: 'Students slept 5h40m.', Question: 'Tone?' },
    ])
    expect(rows.map(r => [r.set_id, r.set_position])).toEqual([['upcat-reading-500-questions:EN01', '1'], ['upcat-reading-500-questions:EN01', '2']])
    expect(rows[0].passage_text).toBe('The Sleep Audit\n\nStudents slept 5h40m.')
    expect(rows[0]).toMatchObject({ topic: 'Prose passage', subtopic: 'Main idea', question_format: 'Feature article' })
  })

  it('does not link a figure-only stimulus to a passage (no passage row would exist for the FK)', () => {
    const { rows } = convertRecords(ruleFor('UPCAT-Reading-500-Questions.csv'), 'reading-stimulus', [
      { ID: 'RC200', Topic: 'Reading Comprehension - Data display', StimulusID: 'VA01', StimulusTitle: 'Infographic', StimulusType: 'Infographic', Language: 'English', SkillTested: 'Reading data', Difficulty: 'Easy', HasFigure: 'Yes', FigureFile: 'figures/va01.png', FigureCaption: 'Daily time use', Passage: '', Question: 'Average screen time?', A: 'a', B: 'b', C: 'c', D: 'd', Answer: 'D', Solution: 's' },
    ])
    expect(rows[0].set_id).toBe('')
    expect(rows[0].has_visual).toBe('yes')
  })

  it('parses "A - answer text" correct answers and tags the skill category', () => {
    const { rows } = convertRecords(ruleFor('ACET_General_Knowledge_500Q_Set2.csv'), 'option-letter', [
      { 'No.': '1', Category: 'Philippine Constitution', Question: 'Q?', 'Option A': 'x', 'Option B': 'y', 'Option C': 'z', 'Option D': 'w', 'Correct Answer': 'A - x', Explanation: 'e' },
    ])
    expect(rows[0]).toMatchObject({
      question_id: 'acet-general-knowledge-500q-set2:0001', subtest: 'General Information',
      skill_category: 'General Information', topic: 'Philippine Constitution', correct_answer: 'A',
    })
  })

  it('parses 1-4 correct options and keeps 3-option questions (blank 4th option)', () => {
    const { rows, rejected } = convertRecords(ruleFor('USTET_Mental Ability_500_Batch2.csv'), 'option-numeric', [
      { id: '1', category: 'Number Sequence', question: '2, 4, 6, ?', option_1: '11', option_2: '8', option_3: '14', option_4: '10', correct_option: '2', explanation: '+2' },
      { id: '2', category: 'Syllogism / Logical Reasoning', question: 'All A are B...', option_1: 'True', option_2: 'False', option_3: 'Uncertain', option_4: '', correct_option: '1', explanation: 'e' },
    ])
    expect(rejected).toEqual([])
    expect(rows[0]).toMatchObject({ correct_answer: 'B', skill_category: 'Abstract/Non-Verbal Reasoning' })
    expect(rows[1]).toMatchObject({ option_d: '', correct_answer: 'A', skill_category: 'Verbal Reasoning' })
  })

  it('rejects rows with no question, fewer than 3 options, or an answer pointing at a blank option', () => {
    const { rows, rejected } = convertRecords(ruleFor('UPCAT-Math-500-Questions.csv'), 'abcd-letter', [
      { ID: 'M1', Topic: 't', Subtopic: '', Difficulty: '', Question: '', A: 'a', B: 'b', C: 'c', D: 'd', Answer: 'A', Solution: '' },
      { ID: 'M2', Topic: 't', Subtopic: '', Difficulty: '', Question: 'Q', A: 'a', B: 'b', C: '', D: '', Answer: 'A', Solution: '' },
      { ID: 'M3', Topic: 't', Subtopic: '', Difficulty: '', Question: 'Q', A: 'a', B: 'b', C: 'c', D: '', Answer: 'D', Solution: '' },
      { ID: 'M4', Topic: 't', Subtopic: '', Difficulty: '', Question: 'Q', A: 'a', B: 'b', C: 'c', D: 'd', Answer: 'E', Solution: '' },
    ])
    expect(rows).toEqual([])
    expect(rejected.map(r => r.localId)).toEqual(['M1', 'M2', 'M3', 'M4'])
  })
})
