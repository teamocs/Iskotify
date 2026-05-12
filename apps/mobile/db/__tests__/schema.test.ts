import { dbSchema } from '../schema'

describe('dbSchema', () => {
  it('defines exactly 5 tables', () => {
    expect(dbSchema.tables).toHaveLength(5)
  })

  it('subjects table has name column', () => {
    const t = dbSchema.tables.find(t => t.name === 'subjects')!
    expect(t.columns.some(c => c.name === 'name' && c.type === 'string')).toBe(true)
  })

  it('flashcards table has remote_updated_at as number', () => {
    const t = dbSchema.tables.find(t => t.name === 'flashcards')!
    const col = t.columns.find(c => c.name === 'remote_updated_at')!
    expect(col.type).toBe('number')
  })

  it('user_settings table has last_synced_at and selected_listing_slug', () => {
    const t = dbSchema.tables.find(t => t.name === 'user_settings')!
    expect(t.columns.some(c => c.name === 'last_synced_at')).toBe(true)
    expect(t.columns.some(c => c.name === 'selected_listing_slug')).toBe(true)
  })

  it('topics table has subject_id indexed', () => {
    const t = dbSchema.tables.find(t => t.name === 'topics')!
    const col = t.columns.find(c => c.name === 'subject_id')!
    expect(col.isIndexed).toBe(true)
  })
})
