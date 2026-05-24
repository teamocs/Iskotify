import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import type { DrizzleClient } from '../../db/client'
import type { HomeStats } from '../../hooks/useHomeStats'
import { buildProgressContext, loadStudentIdentity, buildTopicContext } from '../chatContext'

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
    CREATE TABLE user_settings (
      id INTEGER PRIMARY KEY NOT NULL,
      selected_listing_slug TEXT NOT NULL DEFAULT '',
      last_synced_at INTEGER NOT NULL DEFAULT 0,
      full_name TEXT NOT NULL DEFAULT '',
      school TEXT NOT NULL DEFAULT '',
      grade_level INTEGER,
      google_id TEXT,
      email TEXT,
      notifications_enabled INTEGER DEFAULT 1,
      theme TEXT NOT NULL DEFAULT 'system'
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

describe('loadStudentIdentity', () => {
  it('returns name + grade + school when all three are present', async () => {
    const db = makeDb()
    await db.insert(schema.userSettings).values({
      id: 1, fullName: 'Juan dela Cruz', school: 'UP Los Baños', gradeLevel: 11,
    })
    const out = await loadStudentIdentity(db)
    expect(out).toBe('Student: Juan dela Cruz (Grade 11 student at UP Los Baños).')
  })

  it('returns name + grade when school is empty', async () => {
    const db = makeDb()
    await db.insert(schema.userSettings).values({
      id: 1, fullName: 'Maria', school: '', gradeLevel: 12,
    })
    const out = await loadStudentIdentity(db)
    expect(out).toBe('Student: Maria (Grade 12 student).')
  })

  it('returns name + school when grade is null', async () => {
    const db = makeDb()
    await db.insert(schema.userSettings).values({
      id: 1, fullName: 'Pedro', school: 'PSHS', gradeLevel: null,
    })
    const out = await loadStudentIdentity(db)
    expect(out).toBe('Student: Pedro (student at PSHS).')
  })

  it('returns name only when school is empty and grade is null', async () => {
    const db = makeDb()
    await db.insert(schema.userSettings).values({
      id: 1, fullName: 'Ana', school: '', gradeLevel: null,
    })
    const out = await loadStudentIdentity(db)
    expect(out).toBe('Student: Ana.')
  })

  it('returns "(anonymous)" when name is empty', async () => {
    const db = makeDb()
    await db.insert(schema.userSettings).values({
      id: 1, fullName: '', school: '', gradeLevel: null,
    })
    const out = await loadStudentIdentity(db)
    expect(out).toBe('Student: (anonymous).')
  })

  it('returns "(anonymous)" when no user_settings row exists', async () => {
    const db = makeDb()
    const out = await loadStudentIdentity(db)
    expect(out).toBe('Student: (anonymous).')
  })
})

describe('buildTopicContext', () => {
  it('returns only the identity line (no stats, no sessions)', async () => {
    const db = makeDb()
    await db.insert(schema.userSettings).values({
      id: 1, fullName: 'Juan', school: 'UP', gradeLevel: 11,
    })
    const out = await buildTopicContext(db)
    expect(out).toBe('Student: Juan (Grade 11 student at UP).')
    expect(out).not.toContain('Focused exam')
    expect(out).not.toContain('Streak')
  })
})

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
    expect(out.startsWith('Student:')).toBe(true)  // identity is the first line
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
