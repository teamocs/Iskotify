import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { loadAdmissionEstimateSnapshot } from '../useAdmissionEstimate'
import { MIN_ANSWERS } from '../../utils/subtestReadiness'

// Logic audit A2/A3: the estimator is UPCAT-specific, so it must only read
// answered UPCAT attempts. These run the real query (the mocked-chain tests in
// useAdmissionEstimate.test.ts ignore WHERE clauses).

jest.mock('../../services/settings', () => ({
  getSettings: jest.fn().mockResolvedValue({
    hsGwaG8: 90, hsGwaG9: 91, hsGwaG10: 92, hsGwaG11: 93,
    schoolType: 'public_general', isIndigenous: false,
    targetCampus: null, province: null, scoreDisclaimerAck: true,
    sensitiveConsentAt: 1_700_000_000_000,
  }),
  updateSettings: jest.fn(),
}))

function makeDb() {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup */ } }
  const db = drizzle(raw, { schema }) as unknown as DrizzleClient
  const insert = (
    subtest: string, n: number,
    over: { source?: string; listing?: string; selected?: number | null } = {},
  ) => {
    const stmt = raw.prepare(
      'INSERT INTO question_attempts (session_key, source_table, question_id, listing_slug, subtest, selected_index, correct_index, correct, answered_at) VALUES (1, ?, ?, ?, ?, ?, 0, 1, ?)',
    )
    for (let i = 0; i < n; i++) {
      stmt.run(over.source ?? 'upcat_questions', `q${subtest}${i}`, over.listing ?? 'upcat', subtest,
        over.selected === undefined ? 0 : over.selected, 1000 + i)
    }
  }
  return { db, insert }
}

const SUBTESTS = ['Mathematics', 'Reading Comprehension', 'Language Proficiency', 'Science']

describe('loadAdmissionEstimateSnapshot — which attempts count', () => {
  it('counts answered UPCAT attempts from upcat_questions', async () => {
    const { db, insert } = makeDb()
    for (const st of SUBTESTS) insert(st, MIN_ANSWERS)
    const snap = await loadAdmissionEstimateSnapshot(db)
    expect(snap.readiness?.math.answered).toBe(MIN_ANSWERS)
    expect(snap.status).toBe('ready')
  })

  it("ignores other exams' Math/Science (listing_slug != 'upcat')", async () => {
    const { db, insert } = makeDb()
    insert('Mathematics', MIN_ANSWERS, { listing: 'dost-sei' })
    insert('Science', MIN_ANSWERS, { listing: 'acet' })
    const snap = await loadAdmissionEstimateSnapshot(db)
    expect(snap.readiness?.math.answered).toBe(0)
    expect(snap.readiness?.science.answered).toBe(0)
    expect(snap.status).toBe('not-ready')
  })

  it('ignores skipped attempts (selected_index NULL) — a skip is not a wrong answer', async () => {
    const { db, insert } = makeDb()
    insert('Mathematics', MIN_ANSWERS, { selected: null })
    const snap = await loadAdmissionEstimateSnapshot(db)
    expect(snap.readiness?.math.answered).toBe(0)
  })

  it('ignores legacy bundled diagnostic answers (ids like pre-math-1, no such bank question)', async () => {
    const { db } = makeDb()
    const raw = (db as unknown as { $client: { prepare: (s: string) => { run: (...a: unknown[]) => void } } }).$client
    const stmt = raw.prepare(
      "INSERT INTO question_attempts (session_key, source_table, question_id, listing_slug, subtest, selected_index, correct_index, correct, answered_at) VALUES (1, 'upcat_questions', ?, 'upcat', 'Mathematics', 0, 0, 1, ?)",
    )
    for (let i = 0; i < MIN_ANSWERS; i++) stmt.run(`pre-math-${i}`, 2000 + i)
    const snap = await loadAdmissionEstimateSnapshot(db)
    expect(snap.readiness?.math.answered).toBe(0)
  })

  it('ignores attempts whose source is not upcat_questions (e.g. flashcards)', async () => {
    const { db, insert } = makeDb()
    insert('Mathematics', MIN_ANSWERS, { source: 'flashcards' })
    const snap = await loadAdmissionEstimateSnapshot(db)
    expect(snap.readiness?.math.answered).toBe(0)
  })
})
