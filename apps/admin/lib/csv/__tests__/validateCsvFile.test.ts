import { describe, it, expect } from 'vitest'
import { validateCsvFile, validateHeader, checkDuplicates, EXPECTED_HEADER } from '../validateCsvFile'

describe('validateCsvFile', () => {
  it('accepts a normal-sized .csv file', () => {
    expect(validateCsvFile({ name: 'cards.csv', size: 1024 })).toBeNull()
  })

  it('rejects files over 5MB', () => {
    const err = validateCsvFile({ name: 'big.csv', size: 6 * 1024 * 1024 })
    expect(err?.message).toMatch(/5 ?MB/i)
  })

  it('rejects non-.csv extensions (case-insensitive)', () => {
    expect(validateCsvFile({ name: 'cards.txt', size: 100 })?.message).toMatch(/\.csv/i)
    expect(validateCsvFile({ name: 'cards.CSV', size: 100 })).toBeNull()
  })
})

describe('validateHeader', () => {
  it('accepts the exact expected header', () => {
    expect(validateHeader(EXPECTED_HEADER as unknown as string[])).toBeNull()
  })

  it('strips BOM from first column', () => {
    expect(validateHeader(['﻿subject', 'topic', 'question', 'answer', 'explanation', 'distractors'])).toBeNull()
  })

  it('rejects missing columns', () => {
    const err = validateHeader(['subject', 'topic', 'question'])
    expect(err).not.toBeNull()
  })

  it('rejects extra columns', () => {
    const err = validateHeader([...EXPECTED_HEADER, 'extra'] as unknown as string[])
    expect(err).not.toBeNull()
  })

  it('rejects misspellings', () => {
    const err = validateHeader(['subjects', 'topic', 'question', 'answer', 'explanation', 'distractors'])
    expect(err).not.toBeNull()
  })
})

describe('checkDuplicates', () => {
  it('returns no errors when all rows are unique', () => {
    const errs = checkDuplicates([
      { subject: 'Math', topic: 'Algebra', question: 'Q1' },
      { subject: 'Math', topic: 'Algebra', question: 'Q2' },
      { subject: 'Sci', topic: 'Bio', question: 'Q1' },
    ])
    expect(errs).toEqual([])
  })

  it('detects duplicates within the same subject+topic+question (case-insensitive)', () => {
    const errs = checkDuplicates([
      { subject: 'Math', topic: 'Algebra', question: 'What is 2+2?' },
      { subject: 'math', topic: 'algebra', question: 'WHAT IS 2+2?' },
    ])
    expect(errs).toHaveLength(1)
    expect(errs[0]?.rowIndex).toBe(1)
    expect(errs[0]?.message).toMatch(/duplicate/i)
  })
})
