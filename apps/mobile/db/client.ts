import { drizzle } from 'drizzle-orm/expo-sqlite'
import type { SQLiteDatabase } from 'expo-sqlite'
import * as schema from './schema'

export const CREATE_SQL = `
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

export const MIGRATIONS = [
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
  `CREATE TABLE IF NOT EXISTS coach_phrases (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    category TEXT NOT NULL,
    text TEXT NOT NULL,
    generated_at INTEGER NOT NULL,
    context_hash TEXT NOT NULL,
    consumed INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS coach_phrases_consumed_idx ON coach_phrases (consumed, generated_at)`,
  `CREATE TABLE IF NOT EXISTS user_requirements (
    listing_slug TEXT NOT NULL,
    requirement_index INTEGER NOT NULL,
    acquired_at INTEGER NOT NULL,
    PRIMARY KEY (listing_slug, requirement_index)
  )`,
  `ALTER TABLE user_settings ADD COLUMN focus_mode_enabled INTEGER NOT NULL DEFAULT 1`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    mode TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx ON chat_messages (created_at)`,
  `CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'text',
    color TEXT,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    is_trashed INTEGER NOT NULL DEFAULT 0,
    trashed_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS notes_updated_at_idx ON notes (updated_at)`,
  `CREATE INDEX IF NOT EXISTS notes_archived_idx ON notes (is_archived)`,
  `CREATE INDEX IF NOT EXISTS notes_trashed_idx ON notes (is_trashed)`,
  `CREATE TABLE IF NOT EXISTS note_labels (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS note_label_assignments (
    note_id TEXT NOT NULL,
    label_id TEXT NOT NULL,
    PRIMARY KEY (note_id, label_id)
  )`,
  `CREATE INDEX IF NOT EXISTS note_label_assignments_note_idx ON note_label_assignments (note_id)`,
  `ALTER TABLE notes ADD COLUMN reminder_at INTEGER`,

  // ── Flashcard full-text search (FTS5) for Kuya chat RAG ──────────────
  // Indexes question+answer+explanation so the chat can retrieve relevant
  // flashcards at inference time and inject them into the prompt.
  // flashcard_id + topic_id stored UNINDEXED so retrieval avoids a JOIN.
  `CREATE VIRTUAL TABLE IF NOT EXISTS flashcards_fts USING fts5(
    flashcard_id UNINDEXED,
    topic_id UNINDEXED,
    question,
    answer,
    explanation,
    tokenize = 'unicode61 remove_diacritics 2'
  )`,
  // Triggers keep flashcards_fts in sync with flashcards on insert/update/delete.
  `CREATE TRIGGER IF NOT EXISTS flashcards_fts_ai AFTER INSERT ON flashcards BEGIN
    INSERT INTO flashcards_fts (flashcard_id, topic_id, question, answer, explanation)
    VALUES (new.id, new.topic_id, new.question, new.answer, new.explanation);
  END`,
  `CREATE TRIGGER IF NOT EXISTS flashcards_fts_ad AFTER DELETE ON flashcards BEGIN
    DELETE FROM flashcards_fts WHERE flashcard_id = old.id;
  END`,
  `CREATE TRIGGER IF NOT EXISTS flashcards_fts_au AFTER UPDATE ON flashcards BEGIN
    DELETE FROM flashcards_fts WHERE flashcard_id = old.id;
    INSERT INTO flashcards_fts (flashcard_id, topic_id, question, answer, explanation)
    VALUES (new.id, new.topic_id, new.question, new.answer, new.explanation);
  END`,
  // One-time backfill for users who already have flashcards before this migration.
  // INSERT-SELECT is idempotent enough for users without prior rows; for users
  // who already populated, the unique nature of flashcard_id + the natural
  // de-dup on re-running is handled by checking row existence first.
  `INSERT INTO flashcards_fts (flashcard_id, topic_id, question, answer, explanation)
   SELECT f.id, f.topic_id, f.question, f.answer, f.explanation FROM flashcards f
   WHERE NOT EXISTS (SELECT 1 FROM flashcards_fts WHERE flashcard_id = f.id)`,
  `ALTER TABLE notes ADD COLUMN google_event_id TEXT`,
  `ALTER TABLE user_settings ADD COLUMN google_calendar_connected INTEGER NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS upcat_passages (
    set_id TEXT PRIMARY KEY NOT NULL,
    subtest TEXT NOT NULL,
    passage_text TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS upcat_questions (
    question_id TEXT PRIMARY KEY NOT NULL,
    subtest TEXT NOT NULL,
    main_subject TEXT, topic TEXT, subtopic TEXT,
    question_format TEXT, cognitive_level TEXT, difficulty TEXT, curriculum_alignment TEXT,
    question_text TEXT NOT NULL,
    options TEXT NOT NULL DEFAULT '[]',
    correct_index INTEGER NOT NULL,
    explanation TEXT NOT NULL,
    set_id TEXT, set_position INTEGER,
    has_visual INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'published',
    remote_updated_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS upcat_questions_subtest_idx ON upcat_questions (subtest)`,
  `CREATE INDEX IF NOT EXISTS upcat_questions_set_idx ON upcat_questions (set_id)`,
  `ALTER TABLE practice_sessions ADD COLUMN subtest TEXT`,
  `ALTER TABLE listings ADD COLUMN province TEXT`,
  `ALTER TABLE listings ADD COLUMN city TEXT`,
  `ALTER TABLE listings ADD COLUMN scope TEXT NOT NULL DEFAULT 'national'`,
  `ALTER TABLE listings ADD COLUMN is_verified INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE listings ADD COLUMN income_ceiling INTEGER`,
  `ALTER TABLE listings ADD COLUMN gwa_requirement INTEGER`,
  `ALTER TABLE listings ADD COLUMN monthly_stipend INTEGER`,
  `ALTER TABLE listings ADD COLUMN service_obligation_years INTEGER`,
  `ALTER TABLE listings ADD COLUMN has_entrance_exam INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE listings ADD COLUMN application_window TEXT`,
  `ALTER TABLE listings ADD COLUMN scholarship_meta TEXT NOT NULL DEFAULT '{}'`,
  `ALTER TABLE user_settings ADD COLUMN income_bracket TEXT`,
  `ALTER TABLE user_settings ADD COLUMN gwa REAL`,
  `ALTER TABLE user_settings ADD COLUMN province TEXT`,
  `ALTER TABLE user_settings ADD COLUMN city TEXT`,
  `CREATE TABLE IF NOT EXISTS upcat_facts (
    id TEXT PRIMARY KEY NOT NULL, topic TEXT NOT NULL, question TEXT NOT NULL,
    answer TEXT NOT NULL, source TEXT, valid_year INTEGER, remote_updated_at INTEGER
  )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS upcat_facts_fts USING fts5(
    fact_id UNINDEXED, topic, question, answer,
    tokenize = 'unicode61 remove_diacritics 2'
  )`,
  `CREATE TRIGGER IF NOT EXISTS upcat_facts_fts_ai AFTER INSERT ON upcat_facts BEGIN
    INSERT INTO upcat_facts_fts (fact_id, topic, question, answer) VALUES (new.id, new.topic, new.question, new.answer);
  END`,
  `CREATE TRIGGER IF NOT EXISTS upcat_facts_fts_ad AFTER DELETE ON upcat_facts BEGIN
    DELETE FROM upcat_facts_fts WHERE fact_id = old.id;
  END`,
  `CREATE TRIGGER IF NOT EXISTS upcat_facts_fts_au AFTER UPDATE ON upcat_facts BEGIN
    DELETE FROM upcat_facts_fts WHERE fact_id = old.id;
    INSERT INTO upcat_facts_fts (fact_id, topic, question, answer) VALUES (new.id, new.topic, new.question, new.answer);
  END`,
  `CREATE TABLE IF NOT EXISTS question_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )`,
  `ALTER TABLE user_settings ADD COLUMN hs_gwa_g8 REAL`,
  `ALTER TABLE user_settings ADD COLUMN hs_gwa_g9 REAL`,
  `ALTER TABLE user_settings ADD COLUMN hs_gwa_g10 REAL`,
  `ALTER TABLE user_settings ADD COLUMN hs_gwa_g11 REAL`,
  `ALTER TABLE user_settings ADD COLUMN school_type TEXT`,
  `ALTER TABLE user_settings ADD COLUMN is_indigenous INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE user_settings ADD COLUMN target_campus TEXT`,
  `ALTER TABLE user_settings ADD COLUMN score_disclaimer_ack INTEGER NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS upcat_cutoffs (
    id TEXT PRIMARY KEY NOT NULL, campus TEXT NOT NULL, program TEXT,
    cutoff REAL NOT NULL, year INTEGER, is_estimate INTEGER NOT NULL DEFAULT 1
  )`,

  // ── Epic D: Career tables ──────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS career_courses (
    course_id TEXT PRIMARY KEY NOT NULL,
    name TEXT,
    cluster TEXT,
    career_tag TEXT,
    demand TEXT,
    board_exam INTEGER NOT NULL DEFAULT 0,
    board_exam_name TEXT,
    duration_years REAL,
    top_countries TEXT NOT NULL DEFAULT '[]',
    summary TEXT,
    student_tip TEXT,
    ai_note TEXT,
    remote_updated_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS career_destinations (
    id TEXT PRIMARY KEY NOT NULL,
    course_id TEXT,
    country TEXT,
    demand_rating TEXT,
    salary_min REAL,
    salary_max REAL,
    salary_local TEXT,
    salary_type TEXT,
    visa_pathway TEXT,
    pr_pathway TEXT,
    credential TEXT,
    licensing_exam TEXT,
    language_required TEXT,
    timeline_months INTEGER,
    program_name TEXT,
    specializations TEXT NOT NULL DEFAULT '[]',
    notes TEXT,
    saturation_warning TEXT,
    source TEXT,
    remote_updated_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS career_countries (
    code TEXT PRIMARY KEY NOT NULL,
    name TEXT,
    region TEXT,
    immigration_system TEXT,
    why_demand TEXT,
    language_required TEXT,
    pr_pathway TEXT,
    notes TEXT,
    remote_updated_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS career_programs (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT,
    country_region TEXT,
    courses_covered TEXT NOT NULL DEFAULT '[]',
    managing_body TEXT,
    slots TEXT,
    requirements TEXT,
    immigration_outcome TEXT,
    website TEXT,
    notes TEXT,
    remote_updated_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS ai_career_impact (
    course_id TEXT PRIMARY KEY NOT NULL,
    course_name TEXT,
    cluster TEXT,
    board_exam INTEGER NOT NULL DEFAULT 0,
    board_exam_name TEXT,
    automation_risk_low INTEGER,
    automation_risk_high INTEGER,
    ai_safety_score INTEGER,
    ai_safety_label TEXT,
    color_code TEXT,
    what_ai_takes_over TEXT NOT NULL DEFAULT '[]',
    what_stays_human TEXT NOT NULL DEFAULT '[]',
    new_jobs_emerging TEXT NOT NULL DEFAULT '[]',
    skills_to_develop TEXT NOT NULL DEFAULT '[]',
    career_outlook_2030 TEXT,
    key_stat TEXT,
    key_source TEXT,
    key_quote TEXT,
    quote_by TEXT,
    ph_advantage TEXT,
    ph_notes TEXT,
    kuya_baw_summary TEXT,
    last_updated TEXT,
    remote_updated_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS career_facts (
    id TEXT PRIMARY KEY NOT NULL,
    course_id TEXT,
    query_type TEXT,
    course_name TEXT,
    quick_answer TEXT,
    key_caveat TEXT,
    point_to TEXT,
    remote_updated_at INTEGER
  )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS career_facts_fts USING fts5(
    fact_id UNINDEXED, course_name, quick_answer, key_caveat, tokenize='unicode61 remove_diacritics 2')`,
  `CREATE TRIGGER IF NOT EXISTS career_facts_ai AFTER INSERT ON career_facts BEGIN
    INSERT INTO career_facts_fts (fact_id, course_name, quick_answer, key_caveat) VALUES (new.id, new.course_name, new.quick_answer, new.key_caveat); END`,
  `CREATE TRIGGER IF NOT EXISTS career_facts_ad AFTER DELETE ON career_facts BEGIN
    DELETE FROM career_facts_fts WHERE fact_id = old.id; END`,
  `CREATE TRIGGER IF NOT EXISTS career_facts_au AFTER UPDATE ON career_facts BEGIN
    DELETE FROM career_facts_fts WHERE fact_id = old.id;
    INSERT INTO career_facts_fts (fact_id, course_name, quick_answer, key_caveat) VALUES (new.id, new.course_name, new.quick_answer, new.key_caveat); END`,

  // ── Epic C: University / course tables ──────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS tertiary_schools (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    acronym TEXT,
    region TEXT,
    province TEXT,
    city TEXT,
    type TEXT,
    is_suc INTEGER NOT NULL DEFAULT 0,
    is_luc INTEGER NOT NULL DEFAULT 0,
    deped_school_id INTEGER,
    rank_in_province INTEGER,
    remote_updated_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS university_profiles (
    school_id TEXT PRIMARY KEY NOT NULL,
    data_tier TEXT,
    institution_type TEXT,
    year_established TEXT,
    known_for_courses TEXT NOT NULL DEFAULT '[]',
    prc_top_courses TEXT NOT NULL DEFAULT '[]',
    ched_coe_cod TEXT,
    accreditation TEXT,
    entrance_exam_name TEXT,
    entrance_exam_acronym TEXT,
    testing_center_type TEXT,
    application_open TEXT,
    application_close TEXT,
    exam_month TEXT,
    estimated_passing_rate TEXT,
    estimated_slots TEXT,
    tuition_fee_range TEXT,
    free_tuition INTEGER,
    academic_calendar TEXT,
    courses_offered TEXT NOT NULL DEFAULT '[]',
    scholarships_offered TEXT NOT NULL DEFAULT '[]',
    website_url TEXT,
    application_portal_url TEXT,
    facebook_url TEXT,
    exam_difficulty INTEGER,
    notable_programs TEXT NOT NULL DEFAULT '[]',
    prc_strong_boards TEXT NOT NULL DEFAULT '[]',
    notes TEXT,
    data_confidence TEXT,
    remote_updated_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS course_school_rankings (
    id TEXT PRIMARY KEY NOT NULL,
    course_tab TEXT NOT NULL,
    course_name TEXT,
    rank INTEGER,
    school_name TEXT NOT NULL,
    region TEXT,
    province TEXT,
    wilson_score REAL,
    raw_pass_rate REAL,
    total_examinees INTEGER,
    total_passers INTEGER,
    years_with_data TEXT,
    exam_periods INTEGER,
    tertiary_school_id TEXT,
    remote_updated_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS course_school_rankings_tab_idx ON course_school_rankings (course_tab)`,
  `CREATE TABLE IF NOT EXISTS course_school_quality (
    id TEXT PRIMARY KEY NOT NULL,
    school_name TEXT NOT NULL,
    region TEXT,
    province TEXT,
    city TEXT,
    course_standardized TEXT,
    course_group TEXT,
    school_type TEXT,
    ched_coe_cod TEXT,
    quality_score INTEGER,
    quality_tier TEXT,
    accreditations TEXT NOT NULL DEFAULT '[]',
    has_prc_board INTEGER,
    qs_subject_rank TEXT,
    data_confidence TEXT,
    tertiary_school_id TEXT,
    remote_updated_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS bar_results (
    id TEXT PRIMARY KEY NOT NULL,
    school_name TEXT NOT NULL,
    region TEXT,
    province TEXT,
    year INTEGER,
    pass_rate REAL,
    national_avg REAL,
    sc_rank INTEGER,
    notes TEXT,
    remote_updated_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS course_taxonomy_map (
    course_tab TEXT PRIMARY KEY NOT NULL,
    career_course_id TEXT,
    label TEXT,
    kind TEXT,
    remote_updated_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS admissions_updates (
    id TEXT PRIMARY KEY NOT NULL, report_date TEXT, severity TEXT NOT NULL,
    school_slug TEXT, school_name TEXT, title TEXT NOT NULL, body TEXT NOT NULL,
    action_required TEXT, event_date TEXT, event_type TEXT,
    sources TEXT NOT NULL DEFAULT '[]', verified INTEGER NOT NULL DEFAULT 0, remote_updated_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS result_watches (
    slug TEXT PRIMARY KEY NOT NULL, added_at INTEGER NOT NULL
  )`,
  `ALTER TABLE listings ADD COLUMN results_date INTEGER`,
  // ── Onboarding: target exams / courses + school region ──────────────────────
  `ALTER TABLE user_settings ADD COLUMN target_exams TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE user_settings ADD COLUMN target_courses TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE user_settings ADD COLUMN school_region TEXT NOT NULL DEFAULT ''`,
  // Course-field eligibility for listings (cluster names or ["all"]) — connects courses to exams/scholarships.
  `ALTER TABLE listings ADD COLUMN target_courses TEXT NOT NULL DEFAULT '[]'`,
  // ── Exam Blueprints (data-driven exam mechanics) ───────────────────────────
  `ALTER TABLE upcat_questions ADD COLUMN skill_category TEXT`,
  `CREATE TABLE IF NOT EXISTS exam_skill_categories (
    name TEXT PRIMARY KEY NOT NULL,
    requires_spatial_logic INTEGER NOT NULL DEFAULT 0,
    display_order INTEGER NOT NULL DEFAULT 0,
    remote_updated_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS exam_blueprints (
    slug TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    acronym TEXT NOT NULL DEFAULT '',
    total_items INTEGER NOT NULL DEFAULT 0,
    total_time_minutes INTEGER NOT NULL DEFAULT 0,
    has_guessing_penalty INTEGER NOT NULL DEFAULT 0,
    guessing_penalty REAL NOT NULL DEFAULT 0.25,
    section_blocked INTEGER NOT NULL DEFAULT 0,
    scoring_note TEXT NOT NULL DEFAULT '',
    mechanics_note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    display_order INTEGER NOT NULL DEFAULT 0,
    remote_updated_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS exam_blueprint_sections (
    id TEXT PRIMARY KEY NOT NULL,
    blueprint_slug TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    skill_category TEXT NOT NULL DEFAULT '',
    item_count INTEGER NOT NULL DEFAULT 0,
    time_minutes INTEGER,
    requires_spatial_logic INTEGER NOT NULL DEFAULT 0,
    display_order INTEGER NOT NULL DEFAULT 0,
    remote_updated_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS exam_blueprint_sections_slug_idx ON exam_blueprint_sections (blueprint_slug)`,
  `CREATE TABLE IF NOT EXISTS exam_course_notes (
    id TEXT PRIMARY KEY NOT NULL,
    blueprint_slug TEXT NOT NULL,
    course_cluster TEXT NOT NULL DEFAULT 'all',
    note TEXT NOT NULL DEFAULT '',
    min_percentile INTEGER,
    display_order INTEGER NOT NULL DEFAULT 0,
    remote_updated_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS exam_course_notes_slug_idx ON exam_course_notes (blueprint_slug)`,
  // ── Sync heal: force a full re-pull on devices that hit the pre-pagination 1000-row cap ──
  `ALTER TABLE user_settings ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0`,
]

export function createDrizzleClient(rawDb: SQLiteDatabase) {
  rawDb.execSync(CREATE_SQL)
  for (const sql of MIGRATIONS) {
    try { rawDb.execSync(sql) } catch { /* column already exists */ }
  }
  return drizzle(rawDb, { schema })
}

export type DrizzleClient = ReturnType<typeof createDrizzleClient>
