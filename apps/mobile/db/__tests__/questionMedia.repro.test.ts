import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../schema'
import { upcatQuestions, flashcards } from '../schema'
import { CREATE_SQL, MIGRATIONS } from '../client'

// Reproduces a device that already had `upcat_questions`/`flashcards` BEFORE the
// question-media columns (image_url/image_alt/image_width/image_height) were
// added. Both tables are CREATE TABLE IF NOT EXISTS in CREATE_SQL — a no-op
// once the table exists — so on such a device the only way the new columns
// get added is the ALTER TABLE entries in MIGRATIONS. Mirrors the
// questionExplanations.repro.test.ts pattern: simulate the legacy (pre-image)
// shape, run the *current* MIGRATIONS against it, and assert the columns exist.
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
      remote_updated_at INTEGER,
      option_explanations TEXT NOT NULL DEFAULT '[]',
      strategy_tip TEXT NOT NULL DEFAULT ''
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
      status TEXT NOT NULL DEFAULT 'published',
      option_explanations TEXT NOT NULL DEFAULT '[]',
      strategy_tip TEXT NOT NULL DEFAULT ''
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

describe('question media columns — legacy tables + real MIGRATIONS (drift guard)', () => {
  it('adds all four image columns to upcat_questions even when the table pre-dates them', () => {
    const raw = makeLegacyRaw()
    const cols = (raw.prepare(`PRAGMA table_info(upcat_questions)`).all() as { name: string }[]).map(c => c.name)
    expect(cols).toContain('image_url')
    expect(cols).toContain('image_alt')
    expect(cols).toContain('image_width')
    expect(cols).toContain('image_height')
  })

  it('adds all four image columns to flashcards even when the table pre-dates them', () => {
    const raw = makeLegacyRaw()
    const cols = (raw.prepare(`PRAGMA table_info(flashcards)`).all() as { name: string }[]).map(c => c.name)
    expect(cols).toContain('image_url')
    expect(cols).toContain('image_alt')
    expect(cols).toContain('image_width')
    expect(cols).toContain('image_height')
  })

  it('defaults all four image columns to NULL for a pre-existing row with no explicit value', () => {
    const raw = makeLegacyRaw()
    raw.prepare(`
      INSERT INTO upcat_questions (question_id, subtest, question_text, correct_index, explanation)
      VALUES ('q-1', 'Mathematics', 'stem', 0, 'exp')
    `).run()
    raw.prepare(`
      INSERT INTO flashcards (id, topic_id, question, answer, explanation)
      VALUES ('c-1', 't-1', 'q', 'a', 'exp')
    `).run()

    const q = raw.prepare(`SELECT image_url, image_alt, image_width, image_height FROM upcat_questions WHERE question_id = 'q-1'`).get() as any
    expect(q.image_url).toBeNull()
    expect(q.image_alt).toBeNull()
    expect(q.image_width).toBeNull()
    expect(q.image_height).toBeNull()

    const c = raw.prepare(`SELECT image_url, image_alt, image_width, image_height FROM flashcards WHERE id = 'c-1'`).get() as any
    expect(c.image_url).toBeNull()
    expect(c.image_alt).toBeNull()
    expect(c.image_width).toBeNull()
    expect(c.image_height).toBeNull()
  })

  it('reads/writes the image fields through drizzle after the migration sequence', async () => {
    const raw = makeLegacyRaw()
    const db = drizzle(raw, { schema })

    await db.insert(upcatQuestions).values({
      questionId: 'q-2', subtest: 'Science', questionText: 'stem', correctIndex: 1, explanation: 'exp',
      hasVisual: true,
      imageUrl: 'https://x.supabase.co/storage/v1/object/public/question-media/q-2.png',
      imageAlt: 'Circuit diagram with two resistors in series',
      imageWidth: 800,
      imageHeight: 600,
    })
    const qRows = await db.select().from(upcatQuestions).where(eq(upcatQuestions.questionId, 'q-2'))
    expect(qRows[0]?.imageUrl).toBe('https://x.supabase.co/storage/v1/object/public/question-media/q-2.png')
    expect(qRows[0]?.imageAlt).toBe('Circuit diagram with two resistors in series')
    expect(qRows[0]?.imageWidth).toBe(800)
    expect(qRows[0]?.imageHeight).toBe(600)

    await db.insert(flashcards).values({
      id: 'c-2', topicId: 't-1', question: 'q', answer: 'a', explanation: 'exp',
      imageUrl: 'https://x.supabase.co/storage/v1/object/public/question-media/c-2.png',
      imageAlt: 'Comic panel sequence',
      imageWidth: 1024,
      imageHeight: 768,
    })
    const cRows = await db.select().from(flashcards).where(eq(flashcards.id, 'c-2'))
    expect(cRows[0]?.imageUrl).toBe('https://x.supabase.co/storage/v1/object/public/question-media/c-2.png')
    expect(cRows[0]?.imageAlt).toBe('Comic panel sequence')
    expect(cRows[0]?.imageWidth).toBe(1024)
    expect(cRows[0]?.imageHeight).toBe(768)
  })
})
