import { describe, it, expect } from 'vitest'
import {
  optionsFingerprint, dismissalKey, addDismissal, removeDismissal,
  partitionByDismissal, dismissalKeysFrom, parseDismissalInput,
  validateQuestionDraft, questionPatch, isDraftDirty,
} from '../reviewQueue'

const opts = ['12', '15', '13', 'All of the above']

describe('optionsFingerprint', () => {
  it('is stable for the same options', () => {
    expect(optionsFingerprint(opts)).toBe(optionsFingerprint([...opts]))
  })
  it('changes when any option text changes', () => {
    expect(optionsFingerprint(opts)).not.toBe(optionsFingerprint(['12', '15', '13', '14']))
  })
  it('changes when options are reordered', () => {
    expect(optionsFingerprint(opts)).not.toBe(optionsFingerprint(['15', '12', '13', 'All of the above']))
  })
  it('does not collide on how options are split', () => {
    expect(optionsFingerprint(['ab', 'c'])).not.toBe(optionsFingerprint(['a', 'bc']))
  })
})

describe('dismissals', () => {
  it('keys a dismissal by question id and option fingerprint', () => {
    expect(dismissalKey('Q2', opts)).toBe(`Q2#${optionsFingerprint(opts)}`)
  })

  it('adds without duplicates and removes', () => {
    expect(addDismissal(['a'], 'a')).toEqual(['a'])
    expect(addDismissal(['a'], 'b')).toEqual(['a', 'b'])
    expect(removeDismissal(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('hides a dismissed question until its options change', () => {
    const items = [
      { question_id: 'Q1', options: ['a', 'b', 'c', 'None of the above'] },
      { question_id: 'Q2', options: opts },
    ]
    const dismissed = [dismissalKey('Q2', opts)]
    const split = partitionByDismissal(items, dismissed)
    expect(split.active.map(i => i.question_id)).toEqual(['Q1'])
    expect(split.dismissed.map(i => i.question_id)).toEqual(['Q2'])

    const edited = [{ question_id: 'Q2', options: ['12', '15', '13', '14'] }]
    expect(partitionByDismissal(edited, dismissed).active).toHaveLength(1)
  })
})

describe('server dismissals', () => {
  it('turns stored rows into dismissal keys', () => {
    const fp = optionsFingerprint(opts)
    expect(dismissalKeysFrom([{ question_id: 'Q2', options_fingerprint: fp }])).toEqual([dismissalKey('Q2', opts)])
  })

  it('fingerprints are 8 lowercase hex characters', () => {
    expect(optionsFingerprint(opts)).toMatch(/^[0-9a-f]{8}$/)
  })

  it('accepts a well-formed dismissal and trims the id', () => {
    expect(parseDismissalInput({ question_id: ' M001 ', options_fingerprint: '0a1b2c3d' }))
      .toEqual({ ok: true, value: { question_id: 'M001', options_fingerprint: '0a1b2c3d' } })
  })

  it.each([
    null, 'x', {}, { question_id: '', options_fingerprint: '0a1b2c3d' },
    { question_id: 'M001' }, { question_id: 'M001', options_fingerprint: 'ZZZZZZZZ' },
    { question_id: 'M001', options_fingerprint: 123 }, { question_id: 'x'.repeat(201), options_fingerprint: '0a1b2c3d' },
  ])('rejects %j', input => {
    expect(parseDismissalInput(input).ok).toBe(false)
  })
})

describe('validateQuestionDraft', () => {
  const ok = { question_text: 'What is 2+2?', options: ['1', '2', '3', '4'], correct_index: 3 }

  it('accepts a complete draft', () => {
    expect(validateQuestionDraft(ok)).toEqual({})
  })

  it('requires question text', () => {
    expect(validateQuestionDraft({ ...ok, question_text: '   ' }).question_text).toMatch(/question/i)
  })

  it('flags each empty option by index', () => {
    const errors = validateQuestionDraft({ ...ok, options: ['1', ' ', '3', ''] })
    expect(errors.option_1).toBeTruthy()
    expect(errors.option_3).toBeTruthy()
    expect(errors.option_0).toBeUndefined()
  })

  it('requires a correct answer within the first four options', () => {
    expect(validateQuestionDraft({ ...ok, correct_index: -1 }).correct_index).toBeTruthy()
    expect(validateQuestionDraft({ ...ok, options: ['1', '2', '3', '4', '5'], correct_index: 4 }).correct_index).toBeTruthy()
  })
})

describe('questionPatch', () => {
  const initial = { question_text: 'Q?', options: ['a', 'b', 'c', 'd'], correct_index: 0 }

  it('sends only the fields that changed, in the PATCH route shape', () => {
    expect(questionPatch(initial, { ...initial, correct_index: 2 })).toEqual({ correct_index: 2 })
    expect(questionPatch(initial, { ...initial, options: ['a', 'b', 'c', 'e'] })).toEqual({ options: ['a', 'b', 'c', 'e'] })
    expect(questionPatch(initial, { ...initial, question_text: 'New?' })).toEqual({ question_text: 'New?' })
  })

  it('is empty (and not dirty) when nothing changed', () => {
    expect(questionPatch(initial, { ...initial, options: [...initial.options] })).toEqual({})
    expect(isDraftDirty(initial, { ...initial, options: [...initial.options] })).toBe(false)
    expect(isDraftDirty(initial, { ...initial, question_text: 'x' })).toBe(true)
  })
})
