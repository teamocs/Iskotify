/**
 * Task 2.3 — TDD parity tests for services/homeAggregates.ts
 *
 * Uses a real better-sqlite3 in-memory DB (same harness pattern as syncHeal.test.ts).
 * Seeds user_progress (~50 rows across days/topics including today), flashcards
 * (3 topics, listing_slugs arrays), and topics.
 *
 * Oracle = replicated pure-JS computations from the OLD useHomeStats logic
 * (inlined here because the hook file imports expo-router which can't be loaded
 * in the node test environment — divergence noted).
 *
 * Each aggregate SQL function must produce results identical to the oracle.
 */

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import type { DrizzleClient } from '../../db/client'

import {
  getTodayAccuracy,
  getPracticeDayIndices,
  getWeakTopicStats,
  getTopicCardCounts,
  getListingAccuracy,
} from '../homeAggregates'

// ── Inlined oracle functions (mirrors useHomeStats pure fns) ──────────────────

function oracleComputeTodayAccuracy(
  rows: Array<{ correct: boolean | number }>
): number | null {
  if (rows.length === 0) return null
  const correct = rows.filter(r => r.correct === true || r.correct === 1).length
  return Math.round((correct / rows.length) * 100)
}

function oracleComputeStreakFromDays(days: number[]): number {
  if (days.length === 0) return 0
  const daySet = new Set(days)
  const today = Math.floor(Date.now() / 86_400_000)
  let d = daySet.has(today) ? today : today - 1
  let streak = 0
  while (daySet.has(d)) { streak++; d-- }
  return streak
}

function oracleComputeStreak(rows: Array<{ answeredAt: number }>): number {
  if (rows.length === 0) return 0
  const days = new Set(rows.map(r => Math.floor(r.answeredAt / 86_400_000)))
  return oracleComputeStreakFromDays(Array.from(days))
}

function oracleComputeWeakTopics(
  progress: Array<{ flashcardId: string; correct: boolean | number }>,
  fcList: Array<{ id: string; topicId: string }>,
  topicList: Array<{ id: string; name: string }>,
): Array<{ topicId: string; topicName: string; accuracy: number }> {
  const fcMap = new Map(fcList.map(f => [f.id, f.topicId]))
  const topicStats = new Map<string, { correct: number; total: number }>()
  for (const p of progress) {
    const tid = fcMap.get(p.flashcardId)
    if (!tid) continue
    const s = topicStats.get(tid) ?? { correct: 0, total: 0 }
    s.total++
    if (p.correct === true || p.correct === 1) s.correct++
    topicStats.set(tid, s)
  }
  const topicMap = new Map(topicList.map(t => [t.id, t.name]))
  return Array.from(topicStats.entries())
    .map(([tid, { correct, total }]) => ({
      topicId: tid,
      topicName: topicMap.get(tid) ?? tid,
      accuracy: Math.round((correct / total) * 100),
    }))
    .filter(t => t.accuracy < 60)
    .sort((a, b) => a.accuracy - b.accuracy || a.topicId.localeCompare(b.topicId))
    .slice(0, 4)
}

// ── Minimal schema ────────────────────────────────────────────────────────────

function makeDb(): { raw: InstanceType<typeof Database>; db: DrizzleClient } {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE subjects (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL);
    CREATE TABLE topics (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'published'
    );
    CREATE TABLE flashcards (
      id TEXT PRIMARY KEY NOT NULL,
      topic_id TEXT NOT NULL,
      question TEXT NOT NULL DEFAULT '',
      answer TEXT NOT NULL DEFAULT '',
      explanation TEXT NOT NULL DEFAULT '',
      listing_slugs TEXT NOT NULL DEFAULT '[]',
      options TEXT NOT NULL DEFAULT '[]',
      correct_answer_index INTEGER,
      status TEXT NOT NULL DEFAULT 'published',
      remote_updated_at INTEGER,
      ai_options TEXT,
      ai_correct_index INTEGER,
      ai_explanation TEXT,
      ai_enhanced_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS flashcards_topic_id_idx ON flashcards (topic_id);
    CREATE TABLE user_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      flashcard_id TEXT NOT NULL,
      correct INTEGER NOT NULL,
      answered_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS user_progress_answered_at_idx ON user_progress (answered_at);
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
  const db = drizzle(raw, { schema }) as unknown as DrizzleClient
  return { raw, db }
}

// ── Seed data ─────────────────────────────────────────────────────────────────

const DAY = 86_400_000
const today = Math.floor(Date.now() / DAY) * DAY

// Topics
const TOPICS = [
  { id: 't1', name: 'Algebra', subjectId: 's1', status: 'published' },
  { id: 't2', name: 'Biology', subjectId: 's1', status: 'published' },
  { id: 't3', name: 'History', subjectId: 's2', status: 'published' },
]

// Flashcards — 2 per topic, each tagged with listing_slugs
// fc1, fc2: t1; fc3, fc4: t2; fc5, fc6: t3
// upcat slug: fc1-fc4; dost-sei slug: fc3-fc6
const FLASHCARDS = [
  { id: 'fc1', topicId: 't1', listingSlugs: '["upcat"]' },
  { id: 'fc2', topicId: 't1', listingSlugs: '["upcat"]' },
  { id: 'fc3', topicId: 't2', listingSlugs: '["upcat","dost-sei"]' },
  { id: 'fc4', topicId: 't2', listingSlugs: '["upcat","dost-sei"]' },
  { id: 'fc5', topicId: 't3', listingSlugs: '["dost-sei"]' },
  { id: 'fc6', topicId: 't3', listingSlugs: '["dost-sei"]' },
]

// Progress rows:
// today: 4 correct, 2 wrong → 4/6 = 67% today accuracy
// yesterday: 3 correct, 1 wrong
// 2 days ago: 2 correct, 0 wrong
// gap: 3 days ago missing (breaks streak after day 2)
// 4 days ago: 5 rows
// 5 days ago: 2 rows
// 6 days ago: 3 rows
// Topic accuracy total:
//   t1 (fc1, fc2): all 6 correct = 100% (not weak)
//   t2 (fc3, fc4): 3 correct, 3 wrong = 50% (weak)
//   t3 (fc5, fc6): 1 correct, 5 wrong = 17% (weak)

function buildProgress(): Array<{ flashcardId: string; correct: number; answeredAt: number }> {
  const rows: Array<{ flashcardId: string; correct: number; answeredAt: number }> = []
  // today (6 rows)
  rows.push({ flashcardId: 'fc1', correct: 1, answeredAt: today + 100 })
  rows.push({ flashcardId: 'fc2', correct: 1, answeredAt: today + 200 })
  rows.push({ flashcardId: 'fc3', correct: 1, answeredAt: today + 300 })
  rows.push({ flashcardId: 'fc4', correct: 1, answeredAt: today + 400 })
  rows.push({ flashcardId: 'fc5', correct: 0, answeredAt: today + 500 })
  rows.push({ flashcardId: 'fc6', correct: 0, answeredAt: today + 600 })
  // yesterday (4 rows)
  rows.push({ flashcardId: 'fc1', correct: 1, answeredAt: today - DAY + 100 })
  rows.push({ flashcardId: 'fc2', correct: 1, answeredAt: today - DAY + 200 })
  rows.push({ flashcardId: 'fc3', correct: 0, answeredAt: today - DAY + 300 })
  rows.push({ flashcardId: 'fc5', correct: 0, answeredAt: today - DAY + 400 })
  // 2 days ago (2 rows)
  rows.push({ flashcardId: 'fc1', correct: 1, answeredAt: today - 2 * DAY + 100 })
  rows.push({ flashcardId: 'fc2', correct: 1, answeredAt: today - 2 * DAY + 200 })
  // gap: 3 days ago missing
  // 4 days ago (5 rows)
  rows.push({ flashcardId: 'fc3', correct: 1, answeredAt: today - 4 * DAY + 100 })
  rows.push({ flashcardId: 'fc4', correct: 0, answeredAt: today - 4 * DAY + 200 })
  rows.push({ flashcardId: 'fc5', correct: 0, answeredAt: today - 4 * DAY + 300 })
  rows.push({ flashcardId: 'fc6', correct: 0, answeredAt: today - 4 * DAY + 400 })
  rows.push({ flashcardId: 'fc3', correct: 1, answeredAt: today - 4 * DAY + 500 })
  // 5 days ago (2 rows)
  rows.push({ flashcardId: 'fc5', correct: 0, answeredAt: today - 5 * DAY + 100 })
  rows.push({ flashcardId: 'fc6', correct: 0, answeredAt: today - 5 * DAY + 200 })
  // 6 days ago (3 rows)
  rows.push({ flashcardId: 'fc1', correct: 1, answeredAt: today - 6 * DAY + 100 })
  rows.push({ flashcardId: 'fc4', correct: 0, answeredAt: today - 6 * DAY + 200 })
  rows.push({ flashcardId: 'fc6', correct: 0, answeredAt: today - 6 * DAY + 300 })
  return rows
}

const ALL_PROGRESS = buildProgress()
// Oracle-shaped rows (boolean correct)
const ORACLE_PROGRESS = ALL_PROGRESS.map(r => ({
  flashcardId: r.flashcardId,
  correct: r.correct === 1,
  answeredAt: r.answeredAt,
}))
const ORACLE_FC_LIST = FLASHCARDS.map(f => ({ id: f.id, topicId: f.topicId }))
const ORACLE_TOPIC_LIST = TOPICS.map(t => ({ id: t.id, name: t.name }))
const TODAY_START = today

// ── Test setup ────────────────────────────────────────────────────────────────

let db: DrizzleClient
let raw: InstanceType<typeof Database>

beforeEach(() => {
  const pair = makeDb()
  db = pair.db
  raw = pair.raw

  for (const t of TOPICS) {
    raw.prepare('INSERT INTO topics (id, name, subject_id, status) VALUES (?, ?, ?, ?)')
       .run(t.id, t.name, t.subjectId, t.status)
  }
  for (const f of FLASHCARDS) {
    raw.prepare('INSERT INTO flashcards (id, topic_id, listing_slugs) VALUES (?, ?, ?)')
       .run(f.id, f.topicId, f.listingSlugs)
  }
  for (const p of ALL_PROGRESS) {
    raw.prepare('INSERT INTO user_progress (flashcard_id, correct, answered_at) VALUES (?, ?, ?)')
       .run(p.flashcardId, p.correct, p.answeredAt)
  }
})

// ── Parity: getTodayAccuracy vs oracle computeTodayAccuracy ──────────────────

describe('getTodayAccuracy — parity with computeTodayAccuracy oracle', () => {
  it('returns same todayAccuracy percentage as oracle', async () => {
    const todayRows = ORACLE_PROGRESS.filter(p => p.answeredAt >= TODAY_START)
    const oracleAcc = oracleComputeTodayAccuracy(todayRows)

    const { total, correct } = await getTodayAccuracy(db, TODAY_START)
    const sqlAcc = total === 0 ? null : Math.round((correct / total) * 100)

    expect(sqlAcc).toBe(oracleAcc)
    // Sanity: 4 correct out of 6 today rows = 67%
    expect(sqlAcc).toBe(67)
  })

  it('returns total=0, correct=0 when no progress today', async () => {
    raw.exec('DELETE FROM user_progress WHERE answered_at >= ' + TODAY_START)
    const { total, correct } = await getTodayAccuracy(db, TODAY_START)
    expect(total).toBe(0)
    expect(correct).toBe(0)
  })
})

// ── Parity: getPracticeDayIndices + computeStreakFromDays vs oracle computeStreak

describe('getPracticeDayIndices — parity with computeStreak oracle', () => {
  it('produces the same streak count as oracle via computeStreakFromDays', async () => {
    const oracleStreak = oracleComputeStreak(ORACLE_PROGRESS)

    const dayIndices = await getPracticeDayIndices(db)
    const sqlStreak = oracleComputeStreakFromDays(dayIndices)

    expect(sqlStreak).toBe(oracleStreak)
    // today, yesterday, 2 days ago = streak of 3
    expect(sqlStreak).toBe(3)
  })

  it('returns distinct day indices matching oracle practice day set', async () => {
    const oracleDays = new Set(ORACLE_PROGRESS.map(r => Math.floor(r.answeredAt / DAY)))
    const dayIndices = await getPracticeDayIndices(db)

    expect(new Set(dayIndices)).toEqual(oracleDays)
  })

  it('returns empty array when no progress', async () => {
    raw.exec('DELETE FROM user_progress')
    const days = await getPracticeDayIndices(db)
    expect(days).toEqual([])
    expect(oracleComputeStreakFromDays(days)).toBe(0)
  })
})

// ── Parity: getWeakTopicStats vs oracle computeWeakTopics ────────────────────

describe('getWeakTopicStats — parity with computeWeakTopics oracle', () => {
  it('produces same weak topic set as oracle', async () => {
    const oracleWeak = oracleComputeWeakTopics(ORACLE_PROGRESS, ORACLE_FC_LIST, ORACLE_TOPIC_LIST)

    const stats = await getWeakTopicStats(db)
    const topicMap = new Map(ORACLE_TOPIC_LIST.map(t => [t.id, t.name]))

    const sqlWeak = stats
      .map(s => ({
        topicId: s.topicId,
        topicName: topicMap.get(s.topicId) ?? s.topicId,
        accuracy: Math.round((s.ok / s.total) * 100),
      }))
      .filter(t => t.accuracy < 60)
      .sort((a, b) => a.accuracy - b.accuracy || a.topicId.localeCompare(b.topicId))
      .slice(0, 4)

    expect(sqlWeak).toEqual(oracleWeak)
  })

  it('returns no stats when user_progress is empty', async () => {
    raw.exec('DELETE FROM user_progress')
    const stats = await getWeakTopicStats(db)
    expect(stats).toHaveLength(0)
  })

  it('topics with 100% accuracy appear in stats but not in weak list', async () => {
    const stats = await getWeakTopicStats(db)
    // t1 (Algebra) should have 100% accuracy
    const t1 = stats.find(s => s.topicId === 't1')
    expect(t1).toBeDefined()
    expect(Math.round((t1!.ok / t1!.total) * 100)).toBe(100)
    // Not in oracle weak list
    const oracleWeak = oracleComputeWeakTopics(ORACLE_PROGRESS, ORACLE_FC_LIST, ORACLE_TOPIC_LIST)
    expect(oracleWeak.find(w => w.topicId === 't1')).toBeUndefined()
  })
})

// ── Parity: getTopicCardCounts — unfiltered and listing-filtered ──────────────

describe('getTopicCardCounts — card counts per topic', () => {
  it('unfiltered: counts match expected 2 per topic', async () => {
    const rows = await getTopicCardCounts(db)
    const map = new Map(rows.map(r => [r.topicId, r.cardCount]))
    expect(map.get('t1')).toBe(2)
    expect(map.get('t2')).toBe(2)
    expect(map.get('t3')).toBe(2)
  })

  it('filtered by "upcat": only t1 and t2 returned', async () => {
    const rows = await getTopicCardCounts(db, 'upcat')
    const map = new Map(rows.map(r => [r.topicId, r.cardCount]))
    expect(map.get('t1')).toBe(2)
    expect(map.get('t2')).toBe(2)
    expect(map.get('t3')).toBeUndefined()
  })

  it('filtered by "dost-sei": t2 and t3 returned', async () => {
    const rows = await getTopicCardCounts(db, 'dost-sei')
    const map = new Map(rows.map(r => [r.topicId, r.cardCount]))
    expect(map.get('t2')).toBe(2)
    expect(map.get('t3')).toBe(2)
    expect(map.get('t1')).toBeUndefined()
  })

  it('filtered by unknown slug returns empty', async () => {
    const rows = await getTopicCardCounts(db, 'nonexistent-exam')
    expect(rows).toHaveLength(0)
  })

  it('listing-filtered topic ids match JSON.parse loop oracle', async () => {
    // Replicate the OLD usePracticeData JSON.parse loop to get oracle topic IDs
    const slug = 'upcat'
    const oracleTopicIds = new Set<string>()
    for (const fc of FLASHCARDS) {
      try {
        const slugs = JSON.parse(fc.listingSlugs) as string[]
        if (slugs.includes(slug)) oracleTopicIds.add(fc.topicId)
      } catch {}
    }

    const rows = await getTopicCardCounts(db, slug)
    const sqlTopicIds = new Set(rows.map(r => r.topicId))

    expect(sqlTopicIds).toEqual(oracleTopicIds)
  })
})

// ── getListingAccuracy — per-listing score/total sums from practice_sessions ──

describe('getListingAccuracy — per-listing accuracy from practice_sessions', () => {
  beforeEach(() => {
    // Seed practice_sessions: 2 slugs + a zero-total row (excluded) + an empty-slug row (excluded)
    // slug 'upcat':   score=8, total=10  → 80%
    // slug 'dost-sei': score=3, total=5  → 60%
    // total=0 row → excluded by WHERE total > 0
    // empty slug '' row → excluded by WHERE listing_slug != ''
    raw.prepare(`INSERT INTO practice_sessions (listing_slug, score, total, completed_at) VALUES (?, ?, ?, ?)`)
       .run('upcat', 5, 6, Date.now())
    raw.prepare(`INSERT INTO practice_sessions (listing_slug, score, total, completed_at) VALUES (?, ?, ?, ?)`)
       .run('upcat', 3, 4, Date.now())
    raw.prepare(`INSERT INTO practice_sessions (listing_slug, score, total, completed_at) VALUES (?, ?, ?, ?)`)
       .run('dost-sei', 3, 5, Date.now())
    // zero-total row — must be excluded
    raw.prepare(`INSERT INTO practice_sessions (listing_slug, score, total, completed_at) VALUES (?, ?, ?, ?)`)
       .run('upcat', 0, 0, Date.now())
    // empty-slug row — must be excluded
    raw.prepare(`INSERT INTO practice_sessions (listing_slug, score, total, completed_at) VALUES (?, ?, ?, ?)`)
       .run('', 2, 3, Date.now())
  })

  it('returns summed ok and total per listing slug', async () => {
    const rows = await getListingAccuracy(db)
    const map = new Map(rows.map(r => [r.listingSlug, r]))
    const upcat = map.get('upcat')
    expect(upcat).toBeDefined()
    expect(upcat!.ok).toBe(8)   // 5+3
    expect(upcat!.total).toBe(10) // 6+4
    const dost = map.get('dost-sei')
    expect(dost).toBeDefined()
    expect(dost!.ok).toBe(3)
    expect(dost!.total).toBe(5)
  })

  it('excludes zero-total rows so upcat total is only the non-zero rows', async () => {
    const rows = await getListingAccuracy(db)
    const upcat = rows.find(r => r.listingSlug === 'upcat')
    // total should be 10 (6+4), NOT 10+0
    expect(upcat!.total).toBe(10)
  })

  it('excludes empty-slug rows', async () => {
    const rows = await getListingAccuracy(db)
    expect(rows.find(r => r.listingSlug === '')).toBeUndefined()
  })

  it('returns empty array when no practice_sessions', async () => {
    raw.exec('DELETE FROM practice_sessions')
    const rows = await getListingAccuracy(db)
    expect(rows).toHaveLength(0)
  })
})
