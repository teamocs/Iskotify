import { describe, it, expect, vi } from 'vitest'
import { suggestColumnMap, validateColumnMap, type ColumnMapSpec } from '../mapColumns'

const spec: ColumnMapSpec = {
  purpose: 'multiple-choice exam questions',
  fields: [
    { key: 'question', description: 'question text', required: true },
    { key: 'answer', description: 'correct answer', required: true },
    { key: 'explanation', description: 'why the answer is right' },
  ],
  choices: [{ key: 'subtest', description: 'question pool', allowed: ['Mathematics', 'Science'], required: true }],
  headers: ['Item', 'Key', 'Rationale', 'Notes'],
  sample: [{ Item: '2+2?', Key: 'B', Rationale: 'sum', Notes: '' }],
}

describe('validateColumnMap', () => {
  it('keeps mappings to real headers and allowed choices', () => {
    const out = validateColumnMap(
      { columns: { question: 'Item', answer: 'Key', explanation: 'Rationale' }, choices: { subtest: 'Mathematics' } },
      spec,
    )
    expect(out).toEqual({ columns: { question: 'Item', answer: 'Key', explanation: 'Rationale' }, choices: { subtest: 'Mathematics' } })
  })

  it('matches headers case- and space-insensitively and returns the real header', () => {
    const out = validateColumnMap({ columns: { question: ' item ', answer: 'KEY' }, choices: { subtest: 'science' } }, spec)
    expect(out?.columns).toEqual({ question: 'Item', answer: 'Key' })
    expect(out?.choices.subtest).toBe('Science')
  })

  it('drops invented headers and unknown fields; fails when a required field is lost', () => {
    expect(validateColumnMap({ columns: { question: 'Item', answer: 'Answer Key' }, choices: { subtest: 'Mathematics' } }, spec)).toBeNull()
    const out = validateColumnMap(
      { columns: { question: 'Item', answer: 'Key', explanation: 'Nope', bogus: 'Notes' }, choices: { subtest: 'Mathematics' } },
      spec,
    )
    expect(out?.columns).toEqual({ question: 'Item', answer: 'Key' })
  })

  it('rejects a choice outside the allowed list', () => {
    expect(validateColumnMap({ columns: { question: 'Item', answer: 'Key' }, choices: { subtest: 'History' } }, spec)).toBeNull()
  })

  it('rejects two fields mapped to the same header', () => {
    expect(validateColumnMap({ columns: { question: 'Item', answer: 'Item' }, choices: { subtest: 'Mathematics' } }, spec)).toBeNull()
  })

  it('rejects non-object input', () => {
    expect(validateColumnMap(null, spec)).toBeNull()
    expect(validateColumnMap('nope', spec)).toBeNull()
  })
})

describe('suggestColumnMap', () => {
  it('parses the model JSON (fenced or bare) and validates it', async () => {
    const ask = vi.fn(async () => '```json\n{"columns":{"question":"Item","answer":"Key"},"choices":{"subtest":"Mathematics"}}\n```')
    const out = await suggestColumnMap(spec, ask)
    expect(out?.columns.question).toBe('Item')
    const prompt = (ask.mock.calls[0] as unknown as [string])[0]
    expect(prompt).toContain('Item')
    expect(prompt).toContain('Mathematics')
  })

  it('returns null when the model is unavailable or returns garbage', async () => {
    expect(await suggestColumnMap(spec, async () => null)).toBeNull()
    expect(await suggestColumnMap(spec, async () => 'not json')).toBeNull()
    expect(await suggestColumnMap(spec, async () => { throw new Error('quota') })).toBeNull()
  })
})
