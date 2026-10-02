import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { practiceSessions, topics, flashcards } from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { getUpcatSubtestAccuracy, hasTakenDiagnostic, hasReviewContent, reviewContentSlugs } from '../practiceSignals'

function makeDb(): { raw: InstanceType<typeof Database>; db: DrizzleClient } {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup column/table on re-run */ } }
  return { raw, db: drizzle(raw, { schema }) as unknown as DrizzleClient }
}

let raw: InstanceType<typeof Database>
let db: DrizzleClient
beforeEach(() => { ({ raw, db } = makeDb()) })

function attempts(subtest: string, correct: number, wrong: number, over: { source?: string; idPrefix?: string; selected?: number | null; at?: number } = {}) {
  const stmt = raw.prepare(
    'INSERT INTO question_attempts (session_key, source_table, question_id, subtest, selected_index, correct_index, correct, answered_at) VALUES (1, ?, ?, ?, ?, 0, ?, ?)',
  )
  const at = over.at ?? 1_000
  for (let i = 0; i < correct + wrong; i++) {
    stmt.run(over.source ?? 'upcat_questions', `${over.idPrefix ?? 'Q'}${subtest}${i}`, subtest,
      over.selected === undefined ? 0 : over.selected, i < correct ? 1 : 0, at + i)
  }
}

describe('getUpcatSubtestAccuracy', () => {
  it('is empty for a student with no UPCAT answers', async () => {
    expect(await getUpcatSubtestAccuracy(db)).toEqual([])
  })

  it('reports per-subtest accuracy once the minimum number of answers is met', async () => {
    attempts('Mathematics', 4, 6) // 10 answers, 40%
    attempts('Science', 5, 3)     // 8 answers: below the minimum, absent
    expect(await getUpcatSubtestAccuracy(db)).toEqual([{ subtest: 'Mathematics', pct: 40, answered: 10 }])
  })

  it('ignores skipped answers, non-UPCAT sources, bundled diagnostic ids and non-subtest labels', async () => {
    attempts('Science', 0, 12, { selected: null })
    attempts('Science', 0, 12, { source: 'flashcards' })
    attempts('Science', 0, 12, { idPrefix: 'pre-' })
    attempts('Verbal Reasoning', 0, 12) // a blueprint section, not one of the four UPCAT subtests
    expect(await getUpcatSubtestAccuracy(db)).toEqual([])
  })
})

describe('hasTakenDiagnostic', () => {
  it('is false until a diagnostic session is recorded', async () => {
    expect(await hasTakenDiagnostic(db)).toBe(false)
    await db.insert(practiceSessions).values({ listingSlug: 'upcat', score: 3, total: 10, completedAt: 1, kind: 'drill' })
    expect(await hasTakenDiagnostic(db)).toBe(false)
    await db.insert(practiceSessions).values({ listingSlug: 'upcat', score: 3, total: 10, completedAt: 2, kind: 'diagnostic' })
    expect(await hasTakenDiagnostic(db)).toBe(true)
  })

  it("counts only the named exam's diagnostic (UPCAT records 'upcat', an exam diagnostic its own slug)", async () => {
    await db.insert(practiceSessions).values({ listingSlug: 'upcat', score: 3, total: 10, completedAt: 1, kind: 'diagnostic' })
    expect(await hasTakenDiagnostic(db, 'upcat')).toBe(true)
    expect(await hasTakenDiagnostic(db, 'dcat-dlsu')).toBe(false)
    await db.insert(practiceSessions).values({ listingSlug: 'dcat-dlsu', score: 2, total: 5, completedAt: 2, kind: 'diagnostic' })
    expect(await hasTakenDiagnostic(db, 'dcat-dlsu')).toBe(true)
  })
})

describe('hasReviewContent', () => {
  it('is true only when a published flashcard of an existing topic is tagged to the exam', async () => {
    expect(await hasReviewContent(db, 'acet')).toBe(false)
    await db.insert(topics).values({ id: 't1', name: 'Algebra', subjectId: 's', status: 'published' })
    await db.insert(flashcards).values([
      { id: 'd1', topicId: 't1', question: 'q', answer: 'a', explanation: 'e', status: 'draft', listingSlugs: JSON.stringify(['acet']) },
      { id: 'o1', topicId: 't1', question: 'q', answer: 'a', explanation: 'e', status: 'published', listingSlugs: JSON.stringify(['acet-2']) },
      { id: 'g1', topicId: 'ghost', question: 'q', answer: 'a', explanation: 'e', status: 'published', listingSlugs: JSON.stringify(['acet']) },
    ])
    expect(await hasReviewContent(db, 'acet')).toBe(false)
    await db.insert(flashcards).values({ id: 'p1', topicId: 't1', question: 'q', answer: 'a', explanation: 'e', status: 'published', listingSlugs: JSON.stringify(['upcat', 'acet']) })
    expect(await hasReviewContent(db, 'acet')).toBe(true)
  })
})

describe('reviewContentSlugs', () => {
  it('is the subset of the given exams that hasReviewContent says can be reviewed', async () => {
    expect(await reviewContentSlugs(db, ['acet', 'upcat'])).toEqual(new Set())
    await db.insert(topics).values({ id: 't1', name: 'Algebra', subjectId: 's', status: 'published' })
    await db.insert(flashcards).values({ id: 'p1', topicId: 't1', question: 'q', answer: 'a', explanation: 'e', status: 'published', listingSlugs: JSON.stringify(['acet']) })
    expect(await reviewContentSlugs(db, ['acet', 'upcat', 'acet'])).toEqual(new Set(['acet']))
    expect(await reviewContentSlugs(db, [])).toEqual(new Set())
  })
})
