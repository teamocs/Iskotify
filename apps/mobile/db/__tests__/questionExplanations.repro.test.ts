import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../schema'
import { upcatQuestions, flashcards } from '../schema'
import { CREATE_SQL, MIGRATIONS } from '../client'

// Reproduces a device that already had `upcat_questions`/`flashcards` BEFORE
// Task E's option_explanations/strategy_tip columns (migration 049). Both
// tables are CREATE TABLE IF NOT EXISTS in CREATE_SQL — a no-op once the
// table exists — so on such a device the only way the new columns get added
// is the ALTER TABLE entries in MIGRATIONS. Mirrors the
// universityReqsQuals.repro.test.ts / questionAttempts.repro.test.ts pattern:
// simulate the legacy (pre-Task-E) shape, run the *current* MIGRATIONS
// against it, and assert both columns exist with the expected defaults.
function makeLegacyRaw() {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE IF NOT EXISTS upcat_questions (
      question_id TEXT PRIMARY KEY NOT NULL,
      subtest TEXT NOT NULL,
      main_subject TEXT,
      topic TEXT,
      subtopic TEXT,
      question_format TEXT,
      cognitive_level TEXT,
      difficulty TEXT,
      curriculum_alignment TEXT,
      question_text TEXT NOT NULL,
      options TEXT NOT NULL DEFAULT '[]',
      correct_index INTEGER NOT NULL,
      explanation TEXT NOT NULL,
      set_id TEXT,
      set_position INTEGER,
      has_visual INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'published',
      skill_category TEXT,
      remote_updated_at INTEGER
    )
  `)
  raw.exec(`
    CREATE TABLE IF NOT EXISTS flashcards (
      id TEXT PRIMARY KEY NOT NULL,
      topic_id TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      explanation TEXT NOT NULL,
      listing_slugs TEXT NOT NULL DEFAULT '[]',
      options TEXT NOT NULL DEFAULT '[]',
      correct_answer_index INTEGER,
      remote_updated_at INTEGER,
      ai_options TEXT,
      ai_correct_index INTEGER,
      ai_explanation TEXT,
      ai_enhanced_at INTEGER,
      status TEXT NOT NULL DEFAULT 'published'
    )
  `)
  // Run the *current* CREATE_SQL too (CREATE TABLE IF NOT EXISTS is a no-op
  // against the legacy tables above, matching real device behavior) followed
  // by the real MIGRATIONS sequence — same shape as the device boot path.
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) {
    try { raw.exec(sql) } catch { /* duplicate column on re-run — matches device try/catch */ }
  }
  return raw
}

describe('option_explanations/strategy_tip — legacy tables + real MIGRATIONS (drift guard)', () => {
  it('adds both columns to upcat_questions even when the table pre-dates them', () => {
    const raw = makeLegacyRaw()
    const cols = (raw.prepare(`PRAGMA table_info(upcat_questions)`).all() as { name: string }[]).map(c => c.name)
    expect(cols).toContain('option_explanations')
    expect(cols).toContain('strategy_tip')
  })

  it('adds both columns to flashcards even when the table pre-dates them', () => {
    const raw = makeLegacyRaw()
    const cols = (raw.prepare(`PRAGMA table_info(flashcards)`).all() as { name: string }[]).map(c => c.name)
    expect(cols).toContain('option_explanations')
    expect(cols).toContain('strategy_tip')
  })

  it('defaults both columns for a pre-existing row with no explicit value', () => {
    const raw = makeLegacyRaw()
    raw.prepare(`
      INSERT INTO upcat_questions (question_id, subtest, question_text, correct_index, explanation)
      VALUES ('q-1', 'Mathematics', 'stem', 0, 'exp')
    `).run()
    raw.prepare(`
      INSERT INTO flashcards (id, topic_id, question, answer, explanation)
      VALUES ('c-1', 't-1', 'q', 'a', 'exp')
    `).run()

    const q = raw.prepare(`SELECT option_explanations, strategy_tip FROM upcat_questions WHERE question_id = 'q-1'`)
      .get() as { option_explanations: string; strategy_tip: string }
    expect(q.option_explanations).toBe('[]')
    expect(q.strategy_tip).toBe('')

    const c = raw.prepare(`SELECT option_explanations, strategy_tip FROM flashcards WHERE id = 'c-1'`)
      .get() as { option_explanations: string; strategy_tip: string }
    expect(c.option_explanations).toBe('[]')
    expect(c.strategy_tip).toBe('')
  })

  it('reads/writes optionExplanations/strategyTip through drizzle after the migration sequence', async () => {
    const raw = makeLegacyRaw()
    const db = drizzle(raw, { schema })

    await db.insert(upcatQuestions).values({
      questionId: 'q-2', subtest: 'Science', questionText: 'stem', correctIndex: 1, explanation: 'exp',
      optionExplanations: JSON.stringify([null, null, 'Common mixup: confuses mass with weight.', null]),
      strategyTip: 'Always check units before comparing.',
    })
    const qRows = await db.select().from(upcatQuestions).where(eq(upcatQuestions.questionId, 'q-2'))
    expect(JSON.parse(qRows[0]?.optionExplanations ?? '[]')).toEqual([null, null, 'Common mixup: confuses mass with weight.', null])
    expect(qRows[0]?.strategyTip).toBe('Always check units before comparing.')

    await db.insert(flashcards).values({
      id: 'c-2', topicId: 't-1', question: 'q', answer: 'a', explanation: 'exp',
      optionExplanations: JSON.stringify(['Wrong: off-by-one.', null, 'Wrong: sign error.', null]),
      strategyTip: 'Plug the answer back in to verify.',
    })
    const cRows = await db.select().from(flashcards).where(eq(flashcards.id, 'c-2'))
    expect(JSON.parse(cRows[0]?.optionExplanations ?? '[]')).toEqual(['Wrong: off-by-one.', null, 'Wrong: sign error.', null])
    expect(cRows[0]?.strategyTip).toBe('Plug the answer back in to verify.')
  })
})
