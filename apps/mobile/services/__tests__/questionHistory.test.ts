/**
 * P4: what the student has already seen (unseen-first sampling) and which
 * UPCAT questions are still open mistakes (Mistakes mode). Real SQLite
 * (CREATE_SQL + MIGRATIONS).
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { getLastSeenByQuestionId, lastSeenOrEmpty, getOpenMistakeIds, countOpenMistakes, SEEN_CHUNK_SIZE } from '../questionHistory'

function makeDb() {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup */ } }
  return { raw, db: drizzle(raw, { schema }) as unknown as DrizzleClient }
}

function attempt(
  db: DrizzleClient,
  questionId: string,
  answeredAt: number,
  selectedIndex: number | null,
  correct: boolean,
  sourceTable = 'upcat_questions',
) {
  return db.insert(schema.questionAttempts).values({
    sessionKey: answeredAt, sourceTable, questionId, listingSlug: 'upcat', subtest: 'Mathematics', topic: null,
    selectedIndex, correctIndex: 0, correct, elapsedMs: 1000, answeredAt,
  })
}

function question(db: DrizzleClient, questionId: string, status = 'published') {
  return db.insert(schema.upcatQuestions).values({
    questionId, subtest: 'Mathematics', questionText: questionId, options: '["a","b","c","d"]',
    correctIndex: 0, explanation: '', status,
  })
}

describe('question_attempts (source_table, question_id) index', () => {
  it('exists after CREATE_SQL + MIGRATIONS and is used by the last-seen lookup', () => {
    const { raw } = makeDb()
    const names = (raw.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'question_attempts'`).all() as { name: string }[]).map(r => r.name)
    expect(names).toContain('question_attempts_source_question_idx')
    const plan = raw.prepare(
      `EXPLAIN QUERY PLAN SELECT question_id, MAX(answered_at) FROM question_attempts WHERE source_table = ? AND question_id IN (?, ?) GROUP BY question_id`,
    ).all('upcat_questions', 'a', 'b') as { detail: string }[]
    expect(plan.map(p => p.detail).join(' ')).toMatch(/question_attempts_source_question_idx/)
  })
})

describe('getLastSeenByQuestionId', () => {
  it('maps each id to its most recent attempt for the matching source (a skipped/served question counts as seen)', async () => {
    const { db } = makeDb()
    await attempt(db, 'a', 100, 1, false)
    await attempt(db, 'a', 300, 0, true)
    await attempt(db, 'b', 200, null, false) // served but skipped
    await attempt(db, 'c', 999, 0, true, 'flashcards') // other source: ignored
    const seen = await getLastSeenByQuestionId(db, 'upcat_questions', ['a', 'b', 'c', 'never'])
    expect(seen).toEqual(new Map([['a', 300], ['b', 200]]))
  })

  it('returns an empty map for no ids without querying', async () => {
    const { db } = makeDb()
    expect(await getLastSeenByQuestionId(db, 'upcat_questions', [])).toEqual(new Map())
  })

  it(`chunks long id lists (IN lists of at most ${SEEN_CHUNK_SIZE})`, async () => {
    const { db } = makeDb()
    expect(SEEN_CHUNK_SIZE).toBeLessThanOrEqual(500)
    const ids = Array.from({ length: SEEN_CHUNK_SIZE * 2 + 7 }, (_, i) => `q${i}`)
    await attempt(db, 'q0', 1, 0, true)
    await attempt(db, `q${SEEN_CHUNK_SIZE + 3}`, 2, 0, true)
    await attempt(db, `q${SEEN_CHUNK_SIZE * 2 + 6}`, 3, 0, true)
    const seen = await getLastSeenByQuestionId(db, 'upcat_questions', ids)
    expect(seen.size).toBe(3)
    expect(seen.get(`q${SEEN_CHUNK_SIZE * 2 + 6}`)).toBe(3)
  })
})

describe('lastSeenOrEmpty', () => {
  it('returns the history when the read works', async () => {
    const { db } = makeDb()
    await attempt(db, 'a', 5, 0, true)
    expect(await lastSeenOrEmpty(db, 'upcat_questions', ['a'])).toEqual(new Map([['a', 5]]))
  })

  it('never blocks a run: a failed read samples as if nothing was seen', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const broken = { select: () => { throw new Error('db closed') } } as unknown as DrizzleClient
    expect(await lastSeenOrEmpty(broken, 'upcat_questions', ['a'])).toEqual(new Map())
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('getOpenMistakeIds / countOpenMistakes', () => {
  it('lists published UPCAT questions whose latest answered attempt is wrong, newest first', async () => {
    const { db } = makeDb()
    for (const id of ['q1', 'q2', 'q3', 'q4', 'pre-assess-1']) await question(db, id)
    await question(db, 'draft', 'draft')
    await attempt(db, 'q1', 100, 2, false)
    await attempt(db, 'q2', 300, 1, false)
    await attempt(db, 'q3', 200, 1, false)
    await attempt(db, 'q3', 250, 0, true) // answered correctly since: not a mistake
    await attempt(db, 'q4', 400, null, false) // skipped, never answered: not a mistake
    await attempt(db, 'pre-assess-1', 500, 1, false) // onboarding check: excluded
    await attempt(db, 'draft', 600, 1, false) // unpublished: excluded
    await attempt(db, 'q1', 700, 1, false, 'flashcards') // other source: ignored
    expect(await getOpenMistakeIds(db)).toEqual(['q2', 'q1'])
    expect(await countOpenMistakes(db)).toBe(2)
  })

  it('a skipped attempt after a wrong one does not clear the mistake', async () => {
    const { db } = makeDb()
    await question(db, 'q1')
    await attempt(db, 'q1', 100, 2, false)
    await attempt(db, 'q1', 200, null, false)
    expect(await getOpenMistakeIds(db)).toEqual(['q1'])
  })

  it('is empty for a new student', async () => {
    const { db } = makeDb()
    expect(await getOpenMistakeIds(db)).toEqual([])
    expect(await countOpenMistakes(db)).toBe(0)
  })
})
