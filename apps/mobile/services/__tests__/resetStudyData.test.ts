/**
 * Phone "Reset App Data" clears ALL of a student's study data and keeps their
 * notes. Runs the REAL CREATE_SQL + MIGRATIONS against better-sqlite3, seeds one
 * row in every table, resets, and checks what is left.
 *
 * The drift guard at the bottom makes every table in db/schema.ts declare which
 * bucket it is in, so a new study table can't be forgotten by the reset.
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { getTableName, is } from 'drizzle-orm'
import { SQLiteTable } from 'drizzle-orm/sqlite-core'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { resetStudyData, STUDY_TABLES } from '../resetStudyData'

/** The student's study data: every one of these must be empty after a reset. */
const CLEARED = [
  'user_progress', 'practice_sessions', 'question_attempts', 'flashcard_srs',
  'study_plan_items', 'focus_listings', 'saved_decks', 'user_settings',
  'user_requirements', 'coach_phrases', 'exam_runs', 'result_watches',
] as const

/** Kept on purpose: the student's notes, and the queue of question reports they already sent. */
const KEPT = ['notes', 'note_labels', 'note_label_assignments', 'question_feedback'] as const

/** Shared catalog content synced from the server: not personal, never touched by a reset. */
const CATALOG = [
  'subjects', 'topics', 'flashcards', 'listings', 'upcat_passages', 'upcat_questions', 'upcat_facts',
  'upcat_cutoffs', 'career_courses', 'career_destinations', 'career_countries', 'career_programs',
  'ai_career_impact', 'career_facts', 'tertiary_schools', 'university_profiles', 'course_school_rankings',
  'course_school_quality', 'bar_results', 'course_taxonomy_map', 'admissions_updates',
  'exam_skill_categories', 'exam_blueprints', 'exam_blueprint_sections', 'exam_course_notes',
]

function makeDb() {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup column/table on re-run */ } }
  return { raw, db: drizzle(raw, { schema }) as unknown as DrizzleClient }
}

function seed(raw: InstanceType<typeof Database>) {
  const now = Date.now()
  raw.exec(`
    INSERT INTO user_progress (flashcard_id, correct, answered_at) VALUES ('f1', 1, ${now});
    INSERT INTO practice_sessions (listing_slug, score, total, completed_at) VALUES ('upcat', 3, 5, ${now});
    INSERT INTO question_attempts (session_key, source_table, question_id, correct_index, correct, answered_at)
      VALUES (1, 'upcat_questions', 'q1', 0, 1, ${now});
    INSERT INTO flashcard_srs (flashcard_id, due_at) VALUES ('f1', ${now});
    INSERT INTO study_plan_items (plan_date, kind, created_at) VALUES ('2026-09-26', 'srs_review', ${now});
    INSERT INTO focus_listings (listing_slug, priority, added_at) VALUES ('upcat', 1, ${now});
    INSERT INTO saved_decks (id, name, created_at) VALUES ('d1', 'Deck', ${now});
    INSERT INTO user_settings (id, full_name) VALUES (1, 'Juan');
    INSERT INTO user_requirements (listing_slug, requirement_index, acquired_at) VALUES ('dost', 0, ${now});
    INSERT INTO coach_phrases (category, text, generated_at, context_hash) VALUES ('c', 't', ${now}, 'h');
    INSERT INTO exam_runs (run_key, kind, started_at, updated_at) VALUES ('exam:upcat', 'exam', ${now}, ${now});
    INSERT INTO result_watches (slug, added_at) VALUES ('upcat', ${now});
    INSERT INTO notes (id, title, content, created_at, updated_at) VALUES ('n1', 'My note', 'Keep me', ${now}, ${now});
    INSERT INTO note_labels (id, name, created_at) VALUES ('l1', 'Math', ${now});
    INSERT INTO note_label_assignments (note_id, label_id) VALUES ('n1', 'l1');
    INSERT INTO question_feedback (card_id, reason, created_at) VALUES ('q1', 'Wrong answer', ${now});
  `)
}

const count = (raw: InstanceType<typeof Database>, table: string) =>
  (raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n

describe('resetStudyData', () => {
  it('clears every study table', async () => {
    const { raw, db } = makeDb()
    seed(raw)
    for (const t of CLEARED) expect([t, count(raw, t)]).toEqual([t, 1])

    await resetStudyData(db)

    for (const t of CLEARED) expect([t, count(raw, t)]).toEqual([t, 0])
  })

  it('keeps notes, their labels and the sent-report queue', async () => {
    const { raw, db } = makeDb()
    seed(raw)

    await resetStudyData(db)

    for (const t of KEPT) expect([t, count(raw, t)]).toEqual([t, 1])
    expect(raw.prepare('SELECT content FROM notes WHERE id = ?').get('n1')).toEqual({ content: 'Keep me' })
  })

  it('STUDY_TABLES is exactly the cleared set', () => {
    expect(STUDY_TABLES.map(t => getTableName(t)).sort()).toEqual([...CLEARED].sort())
  })
})

describe('every local table is classified (drift guard)', () => {
  it('each table in db/schema.ts is cleared, kept, or catalog', () => {
    const all = Object.values(schema).filter(v => is(v, SQLiteTable)).map(t => getTableName(t as SQLiteTable)).sort()
    const classified = [...CLEARED, ...KEPT, ...CATALOG].sort()
    expect(all).toEqual(classified)
  })
})
