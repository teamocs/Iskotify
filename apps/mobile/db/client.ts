import { drizzle } from 'drizzle-orm/expo-sqlite'
import type { SQLiteDatabase } from 'expo-sqlite'
import * as schema from './schema'

const CREATE_SQL = `
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  status TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS topics_subject_id_idx ON topics (subject_id);
CREATE TABLE IF NOT EXISTS flashcards (
  id TEXT PRIMARY KEY NOT NULL,
  topic_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  explanation TEXT NOT NULL,
  listing_slugs TEXT NOT NULL DEFAULT '[]',
  remote_updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS flashcards_topic_id_idx ON flashcards (topic_id);
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  exam_date INTEGER
);
CREATE INDEX IF NOT EXISTS listings_slug_idx ON listings (slug);
CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY NOT NULL,
  selected_listing_slug TEXT NOT NULL DEFAULT '',
  last_synced_at INTEGER NOT NULL DEFAULT 0,
  full_name TEXT NOT NULL DEFAULT '',
  school TEXT NOT NULL DEFAULT '',
  grade_level INTEGER,
  google_id TEXT,
  email TEXT
);
CREATE TABLE IF NOT EXISTS user_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  flashcard_id TEXT NOT NULL,
  correct INTEGER NOT NULL,
  answered_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS user_progress_flashcard_id_idx ON user_progress (flashcard_id);
CREATE TABLE IF NOT EXISTS saved_decks (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  topic_ids TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS saved_listings (
  id TEXT PRIMARY KEY NOT NULL,
  saved_at INTEGER NOT NULL
);
`

const MIGRATIONS = [
  `ALTER TABLE user_settings ADD COLUMN full_name TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE user_settings ADD COLUMN school TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE user_settings ADD COLUMN grade_level INTEGER`,
  `ALTER TABLE user_settings ADD COLUMN google_id TEXT`,
  `ALTER TABLE user_settings ADD COLUMN email TEXT`,
  `ALTER TABLE listings ADD COLUMN region TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE listings ADD COLUMN description TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE listings ADD COLUMN requirements TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE listings ADD COLUMN coverage TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE listings ADD COLUMN provider TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE listings ADD COLUMN external_url TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE listings ADD COLUMN deadline INTEGER`,
  `ALTER TABLE listings ADD COLUMN grant_amount TEXT NOT NULL DEFAULT ''`,
  `CREATE TABLE IF NOT EXISTS focus_listings (
    listing_slug TEXT PRIMARY KEY NOT NULL,
    priority INTEGER NOT NULL,
    added_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS practice_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    listing_slug TEXT NOT NULL DEFAULT '',
    topic_id TEXT NOT NULL DEFAULT '',
    deck_id TEXT NOT NULL DEFAULT '',
    score INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    duration_secs INTEGER NOT NULL DEFAULT 0,
    completed_at INTEGER NOT NULL
  )`,
  `INSERT OR IGNORE INTO focus_listings (listing_slug, priority, added_at)
   SELECT selected_listing_slug, 1, (strftime('%s','now') * 1000)
   FROM user_settings WHERE id = 1 AND selected_listing_slug != ''`,
  `ALTER TABLE user_settings ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE user_settings ADD COLUMN theme TEXT NOT NULL DEFAULT 'system'`,
  `ALTER TABLE flashcards ADD COLUMN options TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE flashcards ADD COLUMN correct_answer_index INTEGER`,
  `ALTER TABLE flashcards ADD COLUMN ai_options TEXT`,
  `ALTER TABLE flashcards ADD COLUMN ai_correct_index INTEGER`,
  `ALTER TABLE flashcards ADD COLUMN ai_explanation TEXT`,
  `ALTER TABLE flashcards ADD COLUMN ai_enhanced_at INTEGER`,
]

export function createDrizzleClient(rawDb: SQLiteDatabase) {
  rawDb.execSync(CREATE_SQL)
  for (const sql of MIGRATIONS) {
    try { rawDb.execSync(sql) } catch { /* column already exists */ }
  }
  return drizzle(rawDb, { schema })
}

export type DrizzleClient = ReturnType<typeof createDrizzleClient>
