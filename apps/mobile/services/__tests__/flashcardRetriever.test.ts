import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import type { DrizzleClient } from '../../db/client'
import { buildFtsQuery, searchFlashcards } from '../flashcardRetriever'

function makeDbWithFts(): DrizzleClient {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE flashcards (
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
      ai_enhanced_at INTEGER
    );
    CREATE VIRTUAL TABLE flashcards_fts USING fts5(
      flashcard_id UNINDEXED,
      topic_id UNINDEXED,
      question,
      answer,
      explanation,
      tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER flashcards_fts_ai AFTER INSERT ON flashcards BEGIN
      INSERT INTO flashcards_fts (flashcard_id, topic_id, question, answer, explanation)
      VALUES (new.id, new.topic_id, new.question, new.answer, new.explanation);
    END;
    CREATE TRIGGER flashcards_fts_ad AFTER DELETE ON flashcards BEGIN
      DELETE FROM flashcards_fts WHERE flashcard_id = old.id;
    END;
    CREATE TRIGGER flashcards_fts_au AFTER UPDATE ON flashcards BEGIN
      DELETE FROM flashcards_fts WHERE flashcard_id = old.id;
      INSERT INTO flashcards_fts (flashcard_id, topic_id, question, answer, explanation)
      VALUES (new.id, new.topic_id, new.question, new.answer, new.explanation);
    END;
  `)
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

async function seed(db: DrizzleClient, rows: Array<{
  id: string; topicId: string; question: string; answer: string; explanation: string
}>): Promise<void> {
  for (const r of rows) {
    await db.insert(schema.flashcards).values({
      id: r.id,
      topicId: r.topicId,
      question: r.question,
      answer: r.answer,
      explanation: r.explanation,
    })
  }
}

describe('buildFtsQuery', () => {
  it('returns empty string for empty/whitespace input', () => {
    expect(buildFtsQuery('')).toBe('')
    expect(buildFtsQuery('   ')).toBe('')
  })

  it('drops stop-words and short tokens', () => {
    expect(buildFtsQuery('what is the')).toBe('')
    expect(buildFtsQuery('a an of')).toBe('')
  })

  it('produces a prefix-search OR expression for content words', () => {
    expect(buildFtsQuery('photosynthesis')).toBe('photosynthesis*')
    expect(buildFtsQuery('what is photosynthesis')).toBe('photosynthesis*')
  })

  it('joins multiple content words with OR (prefix on each)', () => {
    expect(buildFtsQuery('rizal noli me tangere')).toBe('rizal* OR noli* OR tangere*')
  })

  it('lowercases and strips punctuation safely (no FTS5 syntax injection)', () => {
    expect(buildFtsQuery('What is photosynthesis?')).toBe('photosynthesis*')
    expect(buildFtsQuery('Rizal"; DROP TABLE--')).toBe('rizal* OR drop* OR table*')
  })

  it('caps the expression at 8 tokens to keep MATCH bounded', () => {
    const longQuery = 'algebra biology calculus chemistry geometry history language literature physics statistics'
    const out = buildFtsQuery(longQuery)
    expect(out.split(' OR ')).toHaveLength(8)
  })
})

describe('searchFlashcards (FTS5 integration)', () => {
  it('returns [] when the query has no usable tokens', async () => {
    const db = makeDbWithFts()
    await seed(db, [
      { id: 'f1', topicId: 't1', question: 'Photo', answer: 'X', explanation: 'Y' },
    ])
    expect(await searchFlashcards(db, 'what is the')).toEqual([])
  })

  it('returns [] when nothing matches', async () => {
    const db = makeDbWithFts()
    await seed(db, [
      { id: 'f1', topicId: 't1', question: 'Photosynthesis', answer: 'Plant food', explanation: 'Sunlight' },
    ])
    expect(await searchFlashcards(db, 'pythagorean')).toEqual([])
  })

  it('matches single keyword via FTS5 prefix search', async () => {
    const db = makeDbWithFts()
    await seed(db, [
      { id: 'f1', topicId: 't1', question: 'What is photosynthesis?', answer: 'Plants make food', explanation: 'Sunlight + chlorophyll' },
      { id: 'f2', topicId: 't2', question: 'Who wrote Noli Me Tangere?', answer: 'Jose Rizal', explanation: 'Filipino novelist' },
    ])
    const results = await searchFlashcards(db, 'photosynthesis')
    expect(results).toHaveLength(1)
    expect(results[0].flashcardId).toBe('f1')
    expect(results[0].question).toContain('photosynthesis')
  })

  it('ranks more-relevant flashcards higher (BM25)', async () => {
    const db = makeDbWithFts()
    await seed(db, [
      { id: 'f1', topicId: 't1', question: 'Random unrelated card', answer: 'noli', explanation: '' },
      { id: 'f2', topicId: 't2', question: 'Who wrote Noli Me Tangere?', answer: 'Jose Rizal', explanation: 'Noli is his novel about colonial Spain' },
    ])
    const results = await searchFlashcards(db, 'noli me tangere', 5)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].flashcardId).toBe('f2')
  })

  it('respects the limit parameter', async () => {
    const db = makeDbWithFts()
    await seed(db, [
      { id: 'f1', topicId: 't1', question: 'Algebra basics', answer: 'a', explanation: '' },
      { id: 'f2', topicId: 't1', question: 'Algebra advanced', answer: 'b', explanation: '' },
      { id: 'f3', topicId: 't1', question: 'Algebra equations', answer: 'c', explanation: '' },
      { id: 'f4', topicId: 't1', question: 'Algebra word problems', answer: 'd', explanation: '' },
    ])
    expect(await searchFlashcards(db, 'algebra', 2)).toHaveLength(2)
    expect(await searchFlashcards(db, 'algebra', 4)).toHaveLength(4)
  })

  it('matches across question, answer, AND explanation fields', async () => {
    const db = makeDbWithFts()
    await seed(db, [
      { id: 'f1', topicId: 't1', question: 'Random q', answer: 'Random a', explanation: 'mentions photosynthesis' },
    ])
    const results = await searchFlashcards(db, 'photosynthesis')
    expect(results).toHaveLength(1)
    expect(results[0].flashcardId).toBe('f1')
  })

  it('returns the full RetrievedFlashcard shape', async () => {
    const db = makeDbWithFts()
    await seed(db, [
      { id: 'f1', topicId: 't42', question: 'question text', answer: 'answer text', explanation: 'explanation text' },
    ])
    const [r] = await searchFlashcards(db, 'question')
    expect(r).toEqual(expect.objectContaining({
      flashcardId: 'f1',
      topicId: 't42',
      question: 'question text',
      answer: 'answer text',
      explanation: 'explanation text',
    }))
    expect(typeof r.score).toBe('number')
  })

  it('does not throw and returns [] when the FTS table is missing', async () => {
    const raw = new Database(':memory:')
    raw.exec(`CREATE TABLE flashcards (id TEXT PRIMARY KEY, topic_id TEXT, question TEXT, answer TEXT, explanation TEXT, listing_slugs TEXT, options TEXT, correct_answer_index INTEGER, remote_updated_at INTEGER, ai_options TEXT, ai_correct_index INTEGER, ai_explanation TEXT, ai_enhanced_at INTEGER)`)
    const db = drizzle(raw, { schema }) as unknown as DrizzleClient
    expect(await searchFlashcards(db, 'anything')).toEqual([])
  })
})
