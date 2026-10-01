import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { renderHook, waitFor } from '@testing-library/react-native'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { computeStrength, filterTopicsWithCards, usePracticeData } from '../usePracticeData'

jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]) },
}))
let mockDb: DrizzleClient
jest.mock('../useDb', () => ({ useDb: () => mockDb }))

const fcList = [
  { id: 'fc1', topicId: 't1' },
  { id: 'fc2', topicId: 't1' },
  { id: 'fc3', topicId: 't2' },
]

// A9: strength uses the shared weakness rule (utils/weakness.ts) — New below
// MIN_SAMPLE answers, then Weak <60%, Review <80%, Strong >=80%.
const attempts = (flashcardId: string, correct: number, wrong: number) => [
  ...Array.from({ length: correct }, () => ({ flashcardId, correct: true })),
  ...Array.from({ length: wrong }, () => ({ flashcardId, correct: false })),
]

describe('computeStrength', () => {
  it('returns New with no progress', () => {
    expect(computeStrength('t1', [], fcList)).toBe('New')
  })

  it('returns New below the minimum sample, however the few answers went', () => {
    expect(computeStrength('t1', attempts('fc1', 0, 4), fcList)).toBe('New')
    expect(computeStrength('t1', attempts('fc1', 4, 0), fcList)).toBe('New')
  })

  it('returns Weak when accuracy < 60% (with enough answers)', () => {
    expect(computeStrength('t1', attempts('fc1', 2, 3), fcList)).toBe('Weak') // 40%
    expect(computeStrength('t1', attempts('fc1', 5, 4), fcList)).toBe('Weak') // 56%, the old <50 cut-off called this Review
  })

  it('returns Review for 60% up to (not including) 80%', () => {
    expect(computeStrength('t1', attempts('fc1', 3, 2), fcList)).toBe('Review') // 60%
    expect(computeStrength('t1', attempts('fc1', 7, 3), fcList)).toBe('Review') // 70%
  })

  it('returns Strong when accuracy >= 80%', () => {
    expect(computeStrength('t1', attempts('fc1', 4, 1), fcList)).toBe('Strong')
  })

  it('handles SQLite numeric 0/1 for correct', () => {
    const rows = [1, 1, 1, 0, 0].map(c => ({ flashcardId: 'fc1', correct: c }))
    expect(computeStrength('t1', rows, fcList)).toBe('Review')
  })

  it('ignores progress records for flashcards in other topics', () => {
    expect(computeStrength('t1', attempts('fc3', 5, 0), fcList)).toBe('New') // fc3 belongs to t2
  })
})

describe('filterTopicsWithCards', () => {
  it('drops topics with no cards in the flashcard list', () => {
    const topics = [
      { id: 't1', name: 'Algebra', subjectId: 'math' },
      { id: 't2', name: 'Geometry', subjectId: 'math' },
      { id: 'ghost', name: 'DOST-SEI Examination', subjectId: 'dostsei' },
    ]
    const cards = [
      { topicId: 't1' }, { topicId: 't1' }, { topicId: 't2' },
    ]
    const out = filterTopicsWithCards(topics, cards)
    expect(out.map(t => t.id)).toEqual(['t1', 't2'])
  })

  it('returns empty when no topics have cards', () => {
    const topics = [
      { id: 'ghost1', name: 'A', subjectId: 's1' },
      { id: 'ghost2', name: 'B', subjectId: 's1' },
    ]
    expect(filterTopicsWithCards(topics, [])).toEqual([])
  })

  it('keeps all topics when every topic has at least one card', () => {
    const topics = [
      { id: 't1', name: 'A', subjectId: 's1' },
      { id: 't2', name: 'B', subjectId: 's1' },
    ]
    const cards = [{ topicId: 't1' }, { topicId: 't2' }]
    const out = filterTopicsWithCards(topics, cards)
    expect(out).toHaveLength(2)
  })

  it('preserves topic object identity (does not clone)', () => {
    const t = { id: 't1', name: 'A', subjectId: 's1' }
    const out = filterTopicsWithCards([t], [{ topicId: 't1' }])
    expect(out[0]).toBe(t)
  })
})

describe('usePracticeData — published cards only (A6)', () => {
  it('does not count draft cards, nor show a topic that only has drafts', async () => {
    const raw = new Database(':memory:')
    raw.exec(CREATE_SQL)
    for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup */ } }
    mockDb = drizzle(raw, { schema }) as unknown as DrizzleClient
    raw.exec(`
      INSERT INTO subjects (id, name) VALUES ('s1', 'Math');
      INSERT INTO topics (id, name, subject_id, status) VALUES ('t1', 'Algebra', 's1', 'published'), ('t2', 'Ghost', 's1', 'published');
      INSERT INTO flashcards (id, topic_id, question, answer, explanation, listing_slugs, status) VALUES
        ('a', 't1', 'q', 'a', 'e', '[]', 'published'), ('b', 't1', 'q', 'a', 'e', '[]', 'draft'), ('c', 't2', 'q', 'a', 'e', '[]', 'draft');
    `)
    const { result } = renderHook(() => usePracticeData())
    await waitFor(() => expect(result.current.loaded).toBe(true))
    await waitFor(() => expect(result.current.totalCards).toBe(1))
    expect(result.current.cardCountByTopic).toEqual({ t1: 1 })
    expect(result.current.topicRows.map(r => r.topic.id)).toEqual(['t1'])
  })
})
