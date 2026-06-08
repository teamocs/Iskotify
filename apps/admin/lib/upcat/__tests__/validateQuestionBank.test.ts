import { describe, it, expect } from 'vitest'
import {
  validateQbRow, normalizeAnswerLetter, validateAllQbRows, countQuestionIds, EXPECTED_COLUMNS,
} from '../validateQuestionBank'

function goodRow(over: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    question_id: 'MA_001', subtest: 'Mathematics', question_text: 'What is 2+2?',
    option_a: '3', option_b: '4', option_c: '5', option_d: '6', correct_answer: 'B',
    ...over,
  }
}

describe('normalizeAnswerLetter', () => {
  it('accepts A-D in any case and 1-4', () => {
    expect(normalizeAnswerLetter('a')).toBe('A')
    expect(normalizeAnswerLetter(' D ')).toBe('D')
    expect(normalizeAnswerLetter('2')).toBe('B')
    expect(normalizeAnswerLetter('4')).toBe('D')
  })
  it('rejects anything else', () => {
    expect(normalizeAnswerLetter('E')).toBeNull()
    expect(normalizeAnswerLetter('')).toBeNull()
    expect(normalizeAnswerLetter('5')).toBeNull()
    expect(normalizeAnswerLetter(undefined)).toBeNull()
  })
})

describe('validateQbRow', () => {
  it('passes a well-formed row', () => {
    expect(validateQbRow(goodRow())).toEqual([])
  })

  it('flags a missing Q ID', () => {
    const errs = validateQbRow(goodRow({ question_id: '' }))
    expect(errs.some(e => e.field === 'question_id')).toBe(true)
  })

  it('flags an invalid subtest with the allowed list', () => {
    const errs = validateQbRow(goodRow({ subtest: 'Math' }))
    const e = errs.find(e => e.field === 'subtest')!
    expect(e.message).toContain('Mathematics')
  })

  it('flags a missing subtest', () => {
    expect(validateQbRow(goodRow({ subtest: '' })).some(e => e.field === 'subtest')).toBe(true)
  })

  it('flags an answer that is not A-D', () => {
    expect(validateQbRow(goodRow({ correct_answer: 'X' })).some(e => e.field === 'correct_answer')).toBe(true)
  })

  it('flags when the answer points to an empty option', () => {
    const errs = validateQbRow(goodRow({ correct_answer: 'C', option_c: '' }))
    expect(errs.some(e => e.field === 'option_c')).toBe(true)
  })

  it('flags fewer than two options', () => {
    const errs = validateQbRow(goodRow({ option_b: '', option_c: '', option_d: '', correct_answer: 'A' }))
    expect(errs.some(e => e.field === 'options')).toBe(true)
  })

  it('flags duplicate Q IDs when idCounts is provided', () => {
    const idCounts = new Map([['MA_001', 2]])
    const errs = validateQbRow(goodRow(), { idCounts })
    expect(errs.some(e => e.field === 'question_id' && /duplicate/i.test(e.message))).toBe(true)
  })
})

describe('countQuestionIds + validateAllQbRows', () => {
  it('counts ids and reports duplicates per row', () => {
    const rows = [goodRow(), goodRow({ question_id: 'MA_001' }), goodRow({ question_id: 'MA_002' })]
    expect(countQuestionIds(rows).get('MA_001')).toBe(2)
    const byRow = validateAllQbRows(rows)
    expect(byRow.has(0)).toBe(true) // duplicate
    expect(byRow.has(1)).toBe(true) // duplicate
    expect(byRow.has(2)).toBe(false) // unique + valid
  })
})

describe('EXPECTED_COLUMNS', () => {
  it('matches the importer contract (23 columns, answer + subtest present)', () => {
    expect(EXPECTED_COLUMNS).toHaveLength(23)
    expect(EXPECTED_COLUMNS).toContain('correct_answer')
    expect(EXPECTED_COLUMNS).toContain('subtest')
    expect(EXPECTED_COLUMNS).toContain('passage_text')
  })
})
