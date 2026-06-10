import { pickTemplate } from '../coachTemplates'
import type { HomeStats } from '../../hooks/useHomeStats'

const EMPTY: HomeStats = {
  listing: null,
  daysLeft: null,
  todayAccuracy: null,
  streakDays: 0,
  weakTopics: [],
  firstTopicId: null,
  fullName: '',
  importantDayIndices: [],
  practiceDayIndices: [],
  focusedListings: [],
  noteReminders: [],
  listingAccuracy: {},
  refresh: async () => {},
}

const FULL: HomeStats = {
  listing: { title: 'UPCAT 2026', examDate: Date.now() + 30 * 86400000 },
  daysLeft: 30,
  todayAccuracy: 75,
  streakDays: 5,
  weakTopics: [
    { topicId: 't1', topicName: 'Algebra', accuracy: 32 },
    { topicId: 't2', topicName: 'Biology', accuracy: 45 },
  ],
  firstTopicId: 't1',
  fullName: 'Juan',
  importantDayIndices: [],
  practiceDayIndices: [],
  focusedListings: [],
  noteReminders: [],
  listingAccuracy: {},
  refresh: async () => {},
}

describe('pickTemplate', () => {
  it('returns a non-empty string for empty stats', () => {
    const phrase = pickTemplate(EMPTY, 0)
    expect(typeof phrase).toBe('string')
    expect(phrase.length).toBeGreaterThan(0)
  })

  it('returns a non-empty string for full stats', () => {
    const phrase = pickTemplate(FULL, 0)
    expect(typeof phrase).toBe('string')
    expect(phrase.length).toBeGreaterThan(0)
  })

  it('rotates deterministically — same index returns same phrase', () => {
    const a = pickTemplate(FULL, 3)
    const b = pickTemplate(FULL, 3)
    expect(a).toBe(b)
  })

  it('produces at least 13 distinct phrases over 15 indices for full stats', () => {
    const phrases = new Set<string>()
    for (let i = 0; i < 15; i++) phrases.add(pickTemplate(FULL, i))
    expect(phrases.size).toBeGreaterThanOrEqual(13)
  })

  it('handles negative indices via true-modulo wrap', () => {
    expect(pickTemplate(FULL, -1)).toBe(pickTemplate(FULL, 14))
    expect(pickTemplate(FULL, -15)).toBe(pickTemplate(FULL, 0))
  })

  it('wraps around — index beyond ring length returns same as index % ringSize', () => {
    const a = pickTemplate(FULL, 2)
    const b = pickTemplate(FULL, 17)  // 17 % 15 = 2
    expect(a).toBe(b)
  })

  it('never throws for any combination of missing data', () => {
    for (let i = 0; i < 50; i++) {
      expect(() => pickTemplate(EMPTY, i)).not.toThrow()
      expect(() => pickTemplate(FULL, i)).not.toThrow()
    }
  })

  it('interpolates listing.title when stats include a listing', () => {
    let found = false
    for (let i = 0; i < 15; i++) {
      if (pickTemplate(FULL, i).includes('UPCAT 2026')) { found = true; break }
    }
    expect(found).toBe(true)
  })

  it('interpolates weakest topic name when stats include weak topics', () => {
    let found = false
    for (let i = 0; i < 15; i++) {
      if (pickTemplate(FULL, i).includes('Algebra')) { found = true; break }
    }
    expect(found).toBe(true)
  })
})
