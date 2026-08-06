import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { getDueFlashcards, getDueCounts } from '../srsAggregates'

// Real CREATE_SQL + MIGRATIONS (same harness as db/__tests__/*.repro.test.ts)
// so flashcards + flashcard_srs match production shape exactly.
function makeDb(): { raw: InstanceType<typeof Database>; db: DrizzleClient } {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup column/table on re-run */ } }
  const db = drizzle(raw, { schema }) as unknown as DrizzleClient
  return { raw, db }
}

const DAY = 86_400_000
const NOW = 1_700_000_000_000

let db: DrizzleClient
let raw: InstanceType<typeof Database>

beforeEach(() => {
  const pair = makeDb()
  db = pair.db
  raw = pair.raw

  // Two topics, three flashcards each.
  raw.exec(`
    INSERT INTO subjects (id, name) VALUES ('s1','Math');
    INSERT INTO topics (id, name, subject_id, status) VALUES ('t1','Algebra','s1','published');
    INSERT INTO topics (id, name, subject_id, status) VALUES ('t2','Biology','s1','published');
    INSERT INTO flashcards (id, topic_id, question, answer, explanation, status)
      VALUES ('fc1','t1','q1','a1','e1','published');
    INSERT INTO flashcards (id, topic_id, question, answer, explanation, status)
      VALUES ('fc2','t1','q2','a2','e2','published');
    INSERT INTO flashcards (id, topic_id, question, answer, explanation, status)
      VALUES ('fc3','t2','q3','a3','e3','published');
    INSERT INTO flashcards (id, topic_id, question, answer, explanation, status)
      VALUES ('fc4','t2','q4','a4','e4','published');
    -- Unpublished card, otherwise due — must never surface.
    INSERT INTO flashcards (id, topic_id, question, answer, explanation, status)
      VALUES ('fc5','t2','q5','a5','e5','draft');
  `)
})

describe('getDueFlashcards', () => {
  it('returns only rows with 0 < dueAt <= now, joined to their topic', async () => {
    raw.exec(`
      INSERT INTO flashcard_srs (flashcard_id, due_at) VALUES ('fc1', ${NOW - DAY});   -- overdue
      INSERT INTO flashcard_srs (flashcard_id, due_at) VALUES ('fc2', ${NOW});          -- due exactly now
      INSERT INTO flashcard_srs (flashcard_id, due_at) VALUES ('fc3', ${NOW + DAY});    -- not yet due
      INSERT INTO flashcard_srs (flashcard_id, due_at) VALUES ('fc5', ${NOW - DAY});    -- draft card, excluded
    `)

    const rows = await getDueFlashcards(db, NOW)
    expect(rows.map(r => r.flashcardId).sort()).toEqual(['fc1', 'fc2'])
    expect(rows.find(r => r.flashcardId === 'fc1')?.topicId).toBe('t1')
  })

  it('never-reviewed cards (no flashcard_srs row) are not due', async () => {
    const rows = await getDueFlashcards(db, NOW)
    expect(rows).toEqual([])
  })

  it('dueAt=0 (default / not-yet-scheduled) is never due', async () => {
    raw.exec(`INSERT INTO flashcard_srs (flashcard_id, due_at) VALUES ('fc1', 0);`)
    const rows = await getDueFlashcards(db, NOW)
    expect(rows).toEqual([])
  })

  it('scopes to an ids filter when provided', async () => {
    raw.exec(`
      INSERT INTO flashcard_srs (flashcard_id, due_at) VALUES ('fc1', ${NOW - DAY});
      INSERT INTO flashcard_srs (flashcard_id, due_at) VALUES ('fc2', ${NOW - DAY});
    `)
    const rows = await getDueFlashcards(db, NOW, ['fc1'])
    expect(rows.map(r => r.flashcardId)).toEqual(['fc1'])
  })

  it('an explicit empty ids array returns [] without hitting "all due"', async () => {
    raw.exec(`INSERT INTO flashcard_srs (flashcard_id, due_at) VALUES ('fc1', ${NOW - DAY});`)
    const rows = await getDueFlashcards(db, NOW, [])
    expect(rows).toEqual([])
  })
})

describe('getDueCounts', () => {
  it('aggregates total + per-topic due counts', async () => {
    raw.exec(`
      INSERT INTO flashcard_srs (flashcard_id, due_at) VALUES ('fc1', ${NOW - DAY});  -- t1
      INSERT INTO flashcard_srs (flashcard_id, due_at) VALUES ('fc2', ${NOW - DAY});  -- t1
      INSERT INTO flashcard_srs (flashcard_id, due_at) VALUES ('fc3', ${NOW - DAY});  -- t2
      INSERT INTO flashcard_srs (flashcard_id, due_at) VALUES ('fc4', ${NOW + DAY});  -- t2, not due
    `)

    const counts = await getDueCounts(db, NOW)
    expect(counts.total).toBe(3)
    expect(counts.byTopic).toEqual({ t1: 2, t2: 1 })
  })

  it('returns total 0 and an empty byTopic map when nothing is due', async () => {
    const counts = await getDueCounts(db, NOW)
    expect(counts.total).toBe(0)
    expect(counts.byTopic).toEqual({})
  })
})
