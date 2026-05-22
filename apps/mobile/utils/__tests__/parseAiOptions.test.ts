import { parseAiOptions } from '../parseAiOptions'

describe('parseAiOptions', () => {
  it('returns null for null input', () => {
    expect(parseAiOptions(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(parseAiOptions(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseAiOptions('')).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseAiOptions('not json')).toBeNull()
  })

  it('returns null when JSON is not an array', () => {
    expect(parseAiOptions('{"foo":"bar"}')).toBeNull()
  })

  it('returns null when array contains non-strings', () => {
    expect(parseAiOptions('[1, 2, 3, 4]')).toBeNull()
  })

  it('returns the string array when valid', () => {
    expect(parseAiOptions('["A","B","C","D"]')).toEqual(['A', 'B', 'C', 'D'])
  })
})
