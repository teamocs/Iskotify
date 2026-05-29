import { describe, it, expect } from 'vitest'
import { parseCsvRow } from '../parseCsvRow'

describe('parseCsvRow', () => {
  it('accepts a fully populated valid row', () => {
    const result = parseCsvRow({
      subject: 'Math', topic: 'Algebra', question: 'What is 2+2?',
      answer: '4', explanation: 'Basic', distractors: '3|5|6',
    }, 0)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.subject).toBe('Math')
      expect(result.value.distractors).toEqual(['3', '5', '6'])
    }
  })

  it('accepts a row with empty optional fields', () => {
    const result = parseCsvRow({
      subject: 'Sci', topic: 'Bio', question: 'Q?', answer: 'A', explanation: '', distractors: '',
    }, 0)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.explanation).toBe('')
      expect(result.value.distractors).toEqual([])
    }
  })

  it('trims whitespace from all fields', () => {
    const result = parseCsvRow({
      subject: '  Math  ', topic: ' Algebra ', question: ' Q ',
      answer: ' A ', explanation: '  ', distractors: '',
    }, 0)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.subject).toBe('Math')
  })

  it('rejects missing required fields', () => {
    const result = parseCsvRow({ subject: '', topic: '', question: '', answer: '' }, 3)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const fields = result.errors.map(e => e.field).sort()
      expect(fields).toEqual(['answer', 'question', 'subject', 'topic'])
      expect(result.errors.every(e => e.rowIndex === 3)).toBe(true)
    }
  })

  it('rejects fields that exceed length limits', () => {
    const long = 'x'.repeat(201)
    const result = parseCsvRow({
      subject: long, topic: 'T', question: 'Q', answer: 'A',
    }, 0)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]?.field).toBe('subject')
  })

  it('rejects distractors that are not exactly 3 pipe-separated values', () => {
    const r1 = parseCsvRow({ subject: 'S', topic: 'T', question: 'Q', answer: 'A', distractors: 'a|b' }, 0)
    expect(r1.ok).toBe(false)
    const r2 = parseCsvRow({ subject: 'S', topic: 'T', question: 'Q', answer: 'A', distractors: 'a|b|c|d' }, 0)
    expect(r2.ok).toBe(false)
  })

  it('rejects empty distractor entries', () => {
    const r = parseCsvRow({ subject: 'S', topic: 'T', question: 'Q', answer: 'A', distractors: 'a||c' }, 0)
    expect(r.ok).toBe(false)
  })
})
