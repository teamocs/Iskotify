import { parseTopicIds } from '../useSavedDecks'

describe('parseTopicIds', () => {
  it('parses a valid JSON array of strings', () => {
    expect(parseTopicIds('["t1","t2","t3"]')).toEqual(['t1', 't2', 't3'])
  })

  it('returns empty array for empty JSON array', () => {
    expect(parseTopicIds('[]')).toEqual([])
  })

  it('filters out non-string values', () => {
    expect(parseTopicIds('[1, "t1", null, "t2"]')).toEqual(['t1', 't2'])
  })

  it('returns empty array for invalid JSON', () => {
    expect(parseTopicIds('not-json')).toEqual([])
  })

  it('returns empty array for JSON non-array', () => {
    expect(parseTopicIds('"just-a-string"')).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(parseTopicIds('')).toEqual([])
  })
})
