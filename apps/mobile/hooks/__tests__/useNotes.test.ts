import { parseChecklistItems, makeNoteId } from '../useNotes'

describe('parseChecklistItems', () => {
  it('returns parsed array for valid JSON', () => {
    const raw = JSON.stringify([
      { id: 'a', text: 'Buy pencils', isChecked: false },
      { id: 'b', text: 'Submit form', isChecked: true },
    ])
    expect(parseChecklistItems(raw)).toEqual([
      { id: 'a', text: 'Buy pencils', isChecked: false },
      { id: 'b', text: 'Submit form', isChecked: true },
    ])
  })

  it('returns empty array for empty JSON array', () => {
    expect(parseChecklistItems('[]')).toEqual([])
  })

  it('returns empty array for invalid JSON', () => {
    expect(parseChecklistItems('not-json')).toEqual([])
  })

  it('returns empty array for JSON non-array', () => {
    expect(parseChecklistItems('"just a string"')).toEqual([])
  })

  it('filters out items missing required fields', () => {
    const raw = JSON.stringify([
      { id: 'a', text: 'ok', isChecked: false },
      { id: 'b', text: 'missing isChecked' },
      { text: 'missing id', isChecked: false },
    ])
    expect(parseChecklistItems(raw)).toEqual([{ id: 'a', text: 'ok', isChecked: false }])
  })

  it('filters out non-object items', () => {
    const raw = JSON.stringify([{ id: 'a', text: 'ok', isChecked: false }, null, 42, 'str'])
    expect(parseChecklistItems(raw)).toEqual([{ id: 'a', text: 'ok', isChecked: false }])
  })
})

describe('makeNoteId', () => {
  it('starts with note_', () => {
    expect(makeNoteId()).toMatch(/^note_/)
  })

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => makeNoteId()))
    expect(ids.size).toBe(100)
  })
})
