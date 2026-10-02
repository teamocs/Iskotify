import { describe, it, expect } from 'vitest'
import { convertMapped, kbMappingSpec, parseMappingInput, mappingFromAi, type KbMapping } from '../mapping'

const base: KbMapping = {
  subtest: 'General Information',
  mainSubject: 'General Information',
  skillCategory: '',
  source: 'ai',
  columns: { id: 'No.', question: 'Item', option_a: 'Choice 1', option_b: 'Choice 2', option_c: 'Choice 3', option_d: 'Choice 4', answer: 'Key', explanation: 'Why', topic: 'Area' },
}

const rec = (o: Record<string, string>) => ({ 'No.': '', Item: '', 'Choice 1': '', 'Choice 2': '', 'Choice 3': '', 'Choice 4': '', Key: '', Why: '', Area: '', ...o })

describe('convertMapped', () => {
  it('reads rows through the column map into namespaced draft questions', () => {
    const { rows, rejected } = convertMapped(base, [
      rec({ 'No.': '1', Item: 'Capital of PH?', 'Choice 1': 'Cebu', 'Choice 2': 'Manila', 'Choice 3': 'Davao', 'Choice 4': 'Iloilo', Key: 'B', Why: 'It is.', Area: 'Geography' }),
    ], 'ACET_General_Knowledge_300Q.xlsx')
    expect(rejected).toEqual([])
    expect(rows[0]).toMatchObject({
      question_id: 'acet-general-knowledge-300q:0001',
      subtest: 'General Information',
      question_text: 'Capital of PH?',
      option_a: 'Cebu', option_b: 'Manila',
      correct_answer: 'B',
      explanation: 'It is.',
      topic: 'Geography',
      skill_category: 'General Information',
      status: '',
    })
  })

  it('understands numeric answers and answers written out as the option text', () => {
    const { rows } = convertMapped(base, [
      rec({ 'No.': '1', Item: 'Q1', 'Choice 1': 'w', 'Choice 2': 'x', 'Choice 3': 'y', 'Choice 4': 'z', Key: '3' }),
      rec({ 'No.': '2', Item: 'Q2', 'Choice 1': 'Red', 'Choice 2': 'Blue', 'Choice 3': 'Green', 'Choice 4': 'Gold', Key: ' blue ' }),
    ], 'f.csv')
    expect(rows.map(r => r.correct_answer)).toEqual(['C', 'B'])
  })

  it('rejects rows it cannot read, with the reason', () => {
    const { rows, rejected } = convertMapped(base, [
      rec({ 'No.': '1', Item: '', 'Choice 1': 'a', 'Choice 2': 'b', 'Choice 3': 'c', Key: 'A' }),
      rec({ 'No.': '2', Item: 'Q', 'Choice 1': 'a', 'Choice 2': 'b', 'Choice 3': 'c', Key: 'maybe' }),
    ], 'f.csv')
    expect(rows).toEqual([])
    expect(rejected.map(r => r.reason)).toEqual(['missing question text', 'unreadable correct answer'])
  })

  it('uses the pool default skill category (Mental Ability: sequences are non-verbal)', () => {
    const m: KbMapping = { ...base, subtest: 'Mental Ability', mainSubject: 'Mental Ability' }
    const { rows } = convertMapped(m, [
      rec({ 'No.': '1', Item: '2, 4, 8, ?', 'Choice 1': '10', 'Choice 2': '16', 'Choice 3': '12', 'Choice 4': '14', Key: 'B', Area: 'Number Sequence' }),
      rec({ 'No.': '2', Item: 'Hot : cold', 'Choice 1': 'a', 'Choice 2': 'b', 'Choice 3': 'c', 'Choice 4': 'd', Key: 'A', Area: 'Analogy' }),
    ], 'f.csv')
    expect(rows.map(r => r.skill_category)).toEqual(['Abstract/Non-Verbal Reasoning', 'Verbal Reasoning'])
  })

  it('links passage rows by stimulus id when both are mapped', () => {
    const m: KbMapping = {
      ...base, subtest: 'Reading Comprehension', mainSubject: 'Reading Comprehension',
      columns: { ...base.columns, stimulus_id: 'Set', passage: 'Text' },
    }
    const { rows } = convertMapped(m, [
      { ...rec({ 'No.': '1', Item: 'Main idea?', 'Choice 1': 'a', 'Choice 2': 'b', 'Choice 3': 'c', 'Choice 4': 'd', Key: 'A' }), Set: 'S1', Text: 'Once upon a time.' },
      { ...rec({ 'No.': '2', Item: 'Tone?', 'Choice 1': 'a', 'Choice 2': 'b', 'Choice 3': 'c', 'Choice 4': 'd', Key: 'B' }), Set: 'S1', Text: 'Once upon a time.' },
    ], 'Reading.csv')
    expect(rows.map(r => [r.set_id, r.set_position, r.passage_text])).toEqual([
      ['reading:S1', '1', 'Once upon a time.'],
      ['reading:S1', '2', ''],
    ])
  })
})

describe('kbMappingSpec', () => {
  it('asks for the pool only when the file name does not already fix it', () => {
    const t = { headers: ['Item', 'Key'], records: [{ Item: 'Q', Key: 'A' }] }
    expect(kbMappingSpec('x.csv', t, true).choices?.map(c => c.key)).toEqual(['subtest', 'skill_category'])
    expect(kbMappingSpec('x.csv', t, false).choices ?? []).toEqual([])
  })
})

describe('mappingFromAi', () => {
  it('takes the pool from the file rule when there is one, else from the AI choice', () => {
    const ai = { columns: { question: 'Item' }, choices: { subtest: 'Science', skill_category: 'Science' } }
    expect(mappingFromAi(ai, null)).toMatchObject({ subtest: 'Science', mainSubject: 'Science', skillCategory: 'Science', source: 'ai' })
    expect(mappingFromAi(ai, { subtest: 'Mathematics', mainSubject: 'Mathematics' })).toMatchObject({ subtest: 'Mathematics', skillCategory: '' })
  })
})

describe('parseMappingInput', () => {
  const headers = ['Item', 'Choice 1', 'Choice 2', 'Choice 3', 'Choice 4', 'Key']
  const ok = { subtest: 'Science', columns: { question: 'Item', option_a: 'Choice 1', option_b: 'Choice 2', option_c: 'Choice 3', option_d: 'Choice 4', answer: 'Key' } }

  it('accepts a complete admin mapping', () => {
    expect(parseMappingInput(ok, headers)).toMatchObject({ subtest: 'Science', mainSubject: 'Science', source: 'admin' })
  })

  it('accepts a two-choice (True/False) file: only choices A and B are required', () => {
    const { option_c: _c, option_d: _d, ...twoChoice } = ok.columns
    expect(parseMappingInput({ ...ok, columns: twoChoice }, headers)).toMatchObject({ columns: twoChoice })
  })

  it('explains what is wrong', () => {
    expect(parseMappingInput({ ...ok, subtest: 'History' }, headers)).toMatch(/pool/i)
    expect(parseMappingInput({ ...ok, columns: { ...ok.columns, answer: 'Nope' } }, headers)).toMatch(/Nope/)
    expect(parseMappingInput({ ...ok, columns: { question: 'Item' } }, headers)).toMatch(/required/i)
    expect(parseMappingInput({ ...ok, columns: { ...ok.columns, option_d: 'Item' } }, headers)).toMatch(/more than one/i)
    expect(parseMappingInput({ ...ok, skillCategory: 'Cooking' }, headers)).toMatch(/skill category/i)
  })
})
