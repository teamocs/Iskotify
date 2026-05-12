import { dbSchema } from '../schema'

describe('dbSchema', () => {
  it('defines exactly 5 tables', () => {
    expect(Object.keys(dbSchema.tables)).toHaveLength(5)
  })

  it('subjects table has name column', () => {
    const t = dbSchema.tables['subjects']
    expect(t.columnArray.some(c => c.name === 'name' && c.type === 'string')).toBe(true)
  })

  it('flashcards table has remote_updated_at as number', () => {
    const col = dbSchema.tables['flashcards'].columnArray.find(c => c.name === 'remote_updated_at')!
    expect(col.type).toBe('number')
  })

  it('user_settings table has last_synced_at and selected_listing_slug', () => {
    const t = dbSchema.tables['user_settings']
    expect(t.columnArray.some(c => c.name === 'last_synced_at')).toBe(true)
    expect(t.columnArray.some(c => c.name === 'selected_listing_slug')).toBe(true)
  })

  it('topics table has subject_id indexed', () => {
    const col = dbSchema.tables['topics'].columnArray.find(c => c.name === 'subject_id')!
    expect(col.isIndexed).toBe(true)
  })

  it('is at schema version 1', () => {
    expect(dbSchema.version).toBe(1)
  })
})
