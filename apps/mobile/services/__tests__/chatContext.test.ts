import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import type { DrizzleClient } from '../../db/client'
import type { HomeStats } from '../../hooks/useHomeStats'
import { buildProgressContext } from '../chatContext'

function makeDb(): DrizzleClient {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE topics (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE practice_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      listing_slug TEXT NOT NULL DEFAULT '',
      topic_id TEXT NOT NULL DEFAULT '',
      deck_id TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      duration_secs INTEGER NOT NULL DEFAULT 0,
      completed_at INTEGER NOT NULL
    );
  `)
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

const STATS_BASE: HomeStats = {
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
  refresh: async () => {},
}

describe('buildProgressContext', () => {
  it('returns "no focused exam" message when listing is null', async () => {
    const db = makeDb()
    const stats: HomeStats = { ...STATS_BASE, listing: null }
    const out = await buildProgressContext(db, stats)
    expect(out).toContain('No focused exam')
  })

  it('includes listing title, days left, streak, and accuracy', async () => {
    const db = makeDb()
    const out = await buildProgressContext(db, STATS_BASE)
    expect(out).toContain('UPCAT 2026')
    expect(out).toContain('30 days')
    expect(out).toContain('Streak: 5 days')
    expect(out).toContain("Today's accuracy: 75%")
  })

  it('lists top 3 weak topics with accuracy percentages', async () => {
    const db = makeDb()
    const out = await buildProgressContext(db, STATS_BASE)
    expect(out).toContain('Algebra (32%)')
    expect(out).toContain('Biology (45%)')
  })

  it('emits "none yet" when weakTopics is empty', async () => {
    const db = makeDb()
    const stats: HomeStats = { ...STATS_BASE, weakTopics: [] }
    const out = await buildProgressContext(db, stats)
    expect(out).toContain('Top weak topics: none yet')
  })

  it('includes recent practice sessions joined with topic names, ordered most-recent-first', async () => {
    const db = makeDb()
    const now = Date.now()
    await db.insert(schema.topics).values([
      { id: 't1', name: 'Algebra', subjectId: 'math', status: 'active' },
      { id: 't2', name: 'Biology', subjectId: 'sci', status: 'active' },
    ])
    await db.insert(schema.practiceSessions).values([
      { topicId: 't1', score: 7, total: 10, completedAt: now - 1000 },
      { topicId: 't2', score: 8, total: 10, completedAt: now - 2000 },
    ])
    const out = await buildProgressContext(db, STATS_BASE)
    expect(out).toContain('Algebra — 7/10')
    expect(out).toContain('Biology — 8/10')
  })

  it('emits "(no recent sessions)" when practice_sessions is empty', async () => {
    const db = makeDb()
    const out = await buildProgressContext(db, STATS_BASE)
    expect(out).toContain('(no recent sessions)')
  })

  it('handles sessions whose topic was deleted (falls back to "mixed practice")', async () => {
    const db = makeDb()
    await db.insert(schema.practiceSessions).values([
      { topicId: 'ghost-topic-id', score: 5, total: 10, completedAt: Date.now() },
    ])
    const out = await buildProgressContext(db, STATS_BASE)
    expect(out).toContain('mixed practice')
  })
})
