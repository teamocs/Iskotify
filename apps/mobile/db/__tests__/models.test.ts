import { Subject } from '../models/Subject'
import { Topic } from '../models/Topic'
import { Flashcard } from '../models/Flashcard'
import { Listing } from '../models/Listing'
import { UserSettings } from '../models/UserSettings'

describe('Subject', () => {
  it('has table name subjects', () => {
    expect(Subject.table).toBe('subjects')
  })
})

describe('Topic', () => {
  it('has table name topics', () => {
    expect(Topic.table).toBe('topics')
  })
  it('declares belongs_to subjects association', () => {
    expect(Topic.associations.subjects.type).toBe('belongs_to')
  })
})

describe('Flashcard', () => {
  it('has table name flashcards', () => {
    expect(Flashcard.table).toBe('flashcards')
  })
  it('parses listingSlugs from valid JSON', () => {
    const card = Object.create(Flashcard.prototype) as Flashcard
    ;(card as any)._getRaw = (col: string) =>
      col === 'listing_slugs' ? '["upcat","dost-sei"]' : null
    expect(card.listingSlugs).toEqual(['upcat', 'dost-sei'])
  })
  it('returns empty array for invalid JSON', () => {
    const card = Object.create(Flashcard.prototype) as Flashcard
    ;(card as any)._getRaw = (col: string) =>
      col === 'listing_slugs' ? 'not-json' : null
    expect(card.listingSlugs).toEqual([])
  })
  it('returns empty array for non-array JSON', () => {
    const card = Object.create(Flashcard.prototype) as Flashcard
    ;(card as any)._getRaw = (col: string) =>
      col === 'listing_slugs' ? '{"foo":"bar"}' : null
    expect(card.listingSlugs).toEqual([])
  })
})

describe('Listing', () => {
  it('has table name listings', () => {
    expect(Listing.table).toBe('listings')
  })
})

describe('UserSettings', () => {
  it('has table name user_settings', () => {
    expect(UserSettings.table).toBe('user_settings')
  })
})
