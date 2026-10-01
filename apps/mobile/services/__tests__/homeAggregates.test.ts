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
  getTopicRecentAccuracy,
  getSubjectRecentAccuracy,
  getListingMockBest,
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
      completed_at INTEGER NOT NULL,
      subtest TEXT,
      kind TEXT,
      attempt_key INTEGER
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

// ── Union: getPracticeDayIndices must also count practice_sessions days ──────
// Bug repro: completing a practice session writes ONLY practice_sessions
// (useRecordSession); user_progress is written only by cloud sync. The Home
// streak must count BOTH tables.

describe('getPracticeDayIndices — union of user_progress and practice_sessions', () => {
  const HOUR = 3_600_000
  const todayIdx = today / DAY

  function insertSession(completedAt: number) {
    raw.prepare(
      'INSERT INTO practice_sessions (listing_slug, score, total, completed_at) VALUES (?, ?, ?, ?)'
    ).run('upcat', 5, 10, completedAt)
  }

  it('includes days that exist ONLY in practice_sessions (bug repro: local sessions never moved the streak)', async () => {
    raw.exec('DELETE FROM user_progress')
    insertSession(today + 100)        // today
    insertSession(today - DAY + 200)  // yesterday

    const days = await getPracticeDayIndices(db)
    expect(new Set(days)).toEqual(new Set([todayIdx, todayIdx - 1]))
  })

  it('dedupes a day present in both tables (UNION, not UNION ALL)', async () => {
    raw.exec('DELETE FROM user_progress')
    raw.prepare('INSERT INTO user_progress (flashcard_id, correct, answered_at) VALUES (?, ?, ?)')
       .run('fc1', 1, today + 100)    // today via user_progress
    insertSession(today + 500)        // today via practice_sessions too
    insertSession(today - DAY + 100)  // yesterday via practice_sessions only

    const days = await getPracticeDayIndices(db)
    expect(days.slice().sort()).toEqual([todayIdx - 1, todayIdx].sort())
    expect(days).toHaveLength(2)
  })

  it('applies offsetMs inside the bucket math: 22:00 UTC with +8h offset lands on the NEXT day index', async () => {
    raw.exec('DELETE FROM user_progress')
    const baseDay = 20_000
    const ts = baseDay * DAY + 22 * HOUR // 22:00 UTC = 06:00 next day in UTC+8
    raw.prepare('INSERT INTO user_progress (flashcard_id, correct, answered_at) VALUES (?, ?, ?)')
       .run('fc1', 1, ts)
    insertSession(ts)

    const phOffset = 8 * HOUR
    expect(await getPracticeDayIndices(db, phOffset)).toEqual([baseDay + 1])
    // default offset 0 keeps UTC bucketing (backward compatible)
    expect(await getPracticeDayIndices(db)).toEqual([baseDay])
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

// ── A8: weighted RECENT accuracy per subject / per topic ──────────────────────
// Replaces the all-time "best session %" (one lucky 100% stuck forever). Evidence
// is answered questions only: user_progress (flashcard quizzes, subject via
// topic -> subject) plus question_attempts from upcat_questions with a selected
// answer (mocks/drills/diagnostics, keyed by the canonical subtest). The most
// recent READINESS_WINDOW answers count; fewer than READINESS_MIN_ANSWERED
// answers means "not started" (absent from the result).

describe('getSubjectRecentAccuracy / getTopicRecentAccuracy (A8)', () => {
  beforeEach(() => {
    raw.exec('DELETE FROM user_progress')
    raw.exec(`
      CREATE TABLE IF NOT EXISTS question_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        session_key INTEGER NOT NULL, source_table TEXT NOT NULL, question_id TEXT NOT NULL,
        listing_slug TEXT NOT NULL DEFAULT '', subtest TEXT, topic TEXT, selected_index INTEGER,
        correct_index INTEGER NOT NULL, correct INTEGER NOT NULL, elapsed_ms INTEGER NOT NULL DEFAULT 0,
        answered_at INTEGER NOT NULL
      );
      INSERT INTO subjects (id, name) VALUES ('s1', 'Mathematics'), ('s2', 'Science');
    `)
  })

  const progress = (flashcardId: string, correct: number, wrong: number, at = 1_000) => {
    const stmt = raw.prepare('INSERT INTO user_progress (flashcard_id, correct, answered_at) VALUES (?, ?, ?)')
    for (let i = 0; i < correct; i++) stmt.run(flashcardId, 1, at + i)
    for (let i = 0; i < wrong; i++) stmt.run(flashcardId, 0, at + correct + i)
  }
  const attempt = (subtest: string, correct: boolean, answeredAt: number, over: { selected?: number | null; source?: string } = {}) =>
    raw.prepare(
      "INSERT INTO question_attempts (session_key, source_table, question_id, subtest, selected_index, correct_index, correct, answered_at) VALUES (1, ?, 'q', ?, ?, 0, ?, ?)"
    ).run(over.source ?? 'upcat_questions', subtest, over.selected === undefined ? 0 : over.selected, correct ? 1 : 0, answeredAt)

  it('requires a minimum number of answers — fewer means not started (absent)', async () => {
    progress('fc1', 5, 4) // 9 answers, below the minimum of 10
    expect(await getSubjectRecentAccuracy(db)).toEqual([])
    expect(await getTopicRecentAccuracy(db)).toEqual([])
  })

  it('is weighted over answers (sum correct / sum answered) once the minimum is met', async () => {
    progress('fc1', 8, 2) // t1 / Mathematics: 8/10
    const subj = await getSubjectRecentAccuracy(db)
    expect(subj).toEqual([{ subject: 'Mathematics', pct: 80, answered: 10 }])
    const top = await getTopicRecentAccuracy(db)
    expect(top).toEqual([{ topicId: 't1', pct: 80, answered: 10 }])
  })

  it('only the most recent 60 answers count — an old lucky streak ages out', async () => {
    progress('fc1', 60, 0, 1_000)   // old: 60 correct
    progress('fc1', 0, 30, 100_000) // recent: 30 wrong, newest 60 = 30 right + 30 wrong
    const subj = await getSubjectRecentAccuracy(db)
    expect(subj[0]).toMatchObject({ subject: 'Mathematics', answered: 60, pct: 50 })
  })

  it('merges upcat attempts (by canonical subtest) with flashcard answers for the same subject', async () => {
    progress('fc1', 5, 0)                                  // Mathematics via t1: 5 right
    for (let i = 0; i < 5; i++) attempt('Mathematics', false, 5_000 + i) // + 5 wrong mock answers
    const subj = await getSubjectRecentAccuracy(db)
    expect(subj).toEqual([{ subject: 'Mathematics', pct: 50, answered: 10 }])
  })

  it('skipped attempts (selected_index NULL) and flashcard-source attempts never count', async () => {
    for (let i = 0; i < 10; i++) attempt('Science', false, 5_000 + i, { selected: null })      // skipped
    for (let i = 0; i < 10; i++) attempt('Science', true, 6_000 + i, { source: 'flashcards' }) // duplicate of user_progress
    expect(await getSubjectRecentAccuracy(db)).toEqual([])
  })

  it('legacy bundled diagnostic answers (ids like pre-math-1) never count', async () => {
    const stmt = raw.prepare(
      "INSERT INTO question_attempts (session_key, source_table, question_id, subtest, selected_index, correct_index, correct, answered_at) VALUES (1, 'upcat_questions', ?, 'Science', 0, 0, 1, ?)"
    )
    for (let i = 0; i < 12; i++) stmt.run(`pre-sci-${i}`, 7_000 + i)
    expect(await getSubjectRecentAccuracy(db)).toEqual([])
  })

  it('draft flashcards do not count', async () => {
    raw.exec("UPDATE flashcards SET status = 'draft' WHERE id = 'fc1'")
    progress('fc1', 10, 0)
    expect(await getSubjectRecentAccuracy(db)).toEqual([])
  })
})

// ── getListingMockBest — best overall MOCK-exam attempt % per listing ─────────
// A mock attempt writes ONE practice_sessions row per SECTION (topic_id='',
// non-empty subtest). All section rows of one attempt share the attempt start,
// reconstructable as completed_at - duration_secs*1000 (bucketed to the second).
// The metric: per attempt, overall % = round(sum(score)*100/sum(total)) across
// its sections; per listing, bestPct = MAX over its attempts.

describe('getListingMockBest — best overall mock attempt % per listing', () => {
  // Insert ALL section rows of ONE attempt. They share `attemptStart` (a whole-
  // second epoch ms) and complete a few ms apart, exactly like submit()'s write
  // loop: completed_at = attemptStart + durationMs + spread,
  // duration_secs = round((completed_at - attemptStart)/1000). Because durationMs
  // is a whole second and the spread is <1s, the reconstructed attemptKey buckets
  // to the same second for every section of the attempt.
  function insertMockAttempt(
    listingSlug: string,
    attemptStart: number,
    durationMs: number,
    sections: Array<{ subtest: string; score: number; total: number }>,
  ) {
    sections.forEach((sec, i) => {
      const completedAt = attemptStart + durationMs + i * 3 // few-ms write spread
      const durationSecs = Math.round((completedAt - attemptStart) / 1000)
      raw.prepare(
        'INSERT INTO practice_sessions (listing_slug, topic_id, subtest, score, total, duration_secs, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(listingSlug, '', sec.subtest, sec.score, sec.total, durationSecs, completedAt)
    })
  }

  // Whole-second attempt starts so attemptKey bucketing is deterministic.
  const T0 = Math.floor(Date.now() / 1000) * 1000

  it('returns the MAX attempt % across a listing\'s mock attempts (not the average, not a single best section)', async () => {
    // Attempt A: 3/10 + 2/10 → 5/20 = 25%? no — overall = round(5*100/20)=25; use 50% below
    // Attempt A overall = 50%: sections 6/10 + 4/10 → 10/20 = 50%
    insertMockAttempt('upcat', T0, 1_800_000, [
      { subtest: 'Mathematics', score: 6, total: 10 },
      { subtest: 'Science', score: 4, total: 10 },
    ])
    // Attempt B overall = 80%: sections 9/10 + 7/10 → 16/20 = 80%
    insertMockAttempt('upcat', T0 + 5_000, 1_700_000, [
      { subtest: 'Mathematics', score: 9, total: 10 },
      { subtest: 'Science', score: 7, total: 10 },
    ])

    const rows = await getListingMockBest(db)
    const map = new Map(rows.map(r => [r.listingSlug, r.bestPct]))
    // MAX(50, 80) = 80 — not the average (65) and not a single best section (90)
    expect(map.get('upcat')).toBe(80)
  })

  it('computes per-attempt overall % ACROSS sections (8/10 + 2/10 → 50%, not 80% from the best section)', async () => {
    insertMockAttempt('dost-sei', T0, 1_500_000, [
      { subtest: 'Mathematics', score: 8, total: 10 }, // best single section = 80%
      { subtest: 'Science', score: 2, total: 10 },     // worst single section = 20%
    ])
    const rows = await getListingMockBest(db)
    const map = new Map(rows.map(r => [r.listingSlug, r.bestPct]))
    // overall = round((8+2)*100/(10+10)) = 50, NOT 80 from the best section
    expect(map.get('dost-sei')).toBe(50)
  })

  it("excludes topic-review rows (topic_id != '' / NULL subtest)", async () => {
    // A real mock attempt for 'upcat'
    insertMockAttempt('upcat', T0, 1_200_000, [
      { subtest: 'Mathematics', score: 7, total: 10 },
      { subtest: 'Science', score: 7, total: 10 },
    ])
    // Topic-review row: topic_id != '', NULL subtest, same listing — must NOT count
    raw.prepare(
      'INSERT INTO practice_sessions (listing_slug, topic_id, subtest, score, total, duration_secs, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run('upcat', 't1', null, 10, 10, 30, Date.now())
    // Another topic-review row with a non-empty subtest but a real topic_id — excluded by topic_id filter
    raw.prepare(
      'INSERT INTO practice_sessions (listing_slug, topic_id, subtest, score, total, duration_secs, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run('upcat', 't2', 'Mathematics', 10, 10, 30, Date.now())

    const rows = await getListingMockBest(db)
    const map = new Map(rows.map(r => [r.listingSlug, r.bestPct]))
    // Only the mock attempt counts: round((7+7)*100/20) = 70 (the 100% topic rows are excluded)
    expect(map.get('upcat')).toBe(70)
  })

  it('excludes rows with total=0 and empty listing_slug; a listing with no mock rows is absent', async () => {
    // Valid mock attempt for 'upcat'
    insertMockAttempt('upcat', T0, 1_000_000, [
      { subtest: 'Mathematics', score: 5, total: 10 },
      { subtest: 'Science', score: 5, total: 10 },
    ])
    // total=0 mock-shaped row (division-by-zero guard) — excluded
    raw.prepare(
      'INSERT INTO practice_sessions (listing_slug, topic_id, subtest, score, total, duration_secs, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run('upcat', '', 'Reading Comprehension', 0, 0, 30, Date.now())
    // empty listing_slug mock-shaped row — excluded
    raw.prepare(
      'INSERT INTO practice_sessions (listing_slug, topic_id, subtest, score, total, duration_secs, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run('', '', 'Mathematics', 9, 10, 30, Date.now())

    const rows = await getListingMockBest(db)
    const map = new Map(rows.map(r => [r.listingSlug, r.bestPct]))
    // upcat: round((5+5)*100/20) = 50 — the total=0 row didn't change it
    expect(map.get('upcat')).toBe(50)
    // empty-slug listing absent
    expect(map.get('')).toBeUndefined()
    // 'dost-sei' has no mock rows at all → absent from the result
    expect(map.get('dost-sei')).toBeUndefined()
    expect(rows.find(r => r.listingSlug === 'dost-sei')).toBeUndefined()
  })

  it('returns empty array when there are no practice_sessions', async () => {
    const rows = await getListingMockBest(db)
    expect(rows).toEqual([])
  })
})

// ── A10: kind-aware mock best ─────────────────────────────────────────────────
describe('getListingMockBest — kind / attempt_key (A10)', () => {
  const ins = (kind: string | null, attemptKey: number | null, subtest: string, score: number, total: number, completedAt: number, durationSecs = 10) =>
    raw.prepare(
      'INSERT INTO practice_sessions (listing_slug, topic_id, subtest, score, total, duration_secs, completed_at, kind, attempt_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('upcat', '', subtest, score, total, durationSecs, completedAt, kind, attemptKey)

  it('groups section rows by attempt_key even when completed_at/duration differ wildly', async () => {
    ins('mock', 1_000, 'Mathematics', 8, 10, 500_000, 10)
    ins('mock', 1_000, 'Science', 2, 10, 900_000, 10)
    const rows = await getListingMockBest(db)
    expect(rows).toEqual([{ listingSlug: 'upcat', bestPct: 50 }])
  })

  it('a sprint or drill or diagnostic never counts as a mock attempt', async () => {
    ins('sprint', 2_000, 'Mathematics', 10, 10, 600_000)
    ins('drill', 3_000, 'Science', 10, 10, 700_000)
    ins('diagnostic', 4_000, 'Science', 10, 10, 800_000)
    ins('mock', 1_000, 'Mathematics', 4, 10, 500_000)
    const rows = await getListingMockBest(db)
    expect(rows).toEqual([{ listingSlug: 'upcat', bestPct: 40 }])
  })

  it('legacy rows with kind NULL keep the old inference and still count', async () => {
    ins(null, null, 'Mathematics', 7, 10, 1_000_000, 0)
    const rows = await getListingMockBest(db)
    expect(rows).toEqual([{ listingSlug: 'upcat', bestPct: 70 }])
  })
})
