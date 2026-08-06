/**
 * Task 1.2 — TDD repro for the sync-heal (syncRev) mechanism.
 *
 * Scenario: device has lastSyncedAt=T2, syncRev=0. A remote flashcard has
 * updated_at=T1 < T2. With the fix, the first sync requests since=epoch
 * (full pull) and persists syncRev=1. A second sync (syncRev=1) uses the
 * incremental cursor again.
 *
 * Uses the hybrid-DB pattern from sync.test.ts: mock the two initial
 * db.select() calls, delegate db.transaction() to a real better-sqlite3
 * drizzle instance so we can inspect actual SQLite writes.
 */

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import type { DrizzleClient } from '../../db/client'
import { syncOnLaunch } from '../sync'

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}))

jest.mock('drizzle-orm', () => ({
  // Spread real implementations so syncBatch's getTableColumns/sql (and any
  // other real drizzle helpers reached through sync.ts) keep working — only
  // eq/asc are stubbed for the mocked settings/focus select chains.
  ...jest.requireActual('drizzle-orm'),
  eq: jest.fn((col, val) => ({ col, val, __isEq: true })),
  asc: jest.fn(col => col),
}))

// ── Minimal SQLite schema for settings + flashcards ───────────────────────────

function makeHealDb(): InstanceType<typeof Database> {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE subjects (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL);
    CREATE TABLE topics (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, subject_id TEXT NOT NULL, status TEXT NOT NULL);
    CREATE TABLE flashcards (
      id TEXT PRIMARY KEY NOT NULL,
      topic_id TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      explanation TEXT NOT NULL,
      listing_slugs TEXT NOT NULL DEFAULT '[]',
      remote_updated_at INTEGER,
      options TEXT NOT NULL DEFAULT '[]',
      correct_answer_index INTEGER,
      ai_options TEXT,
      ai_correct_index INTEGER,
      ai_explanation TEXT,
      ai_enhanced_at INTEGER,
      status TEXT NOT NULL DEFAULT 'published'
    );
    CREATE TABLE listings (
      id TEXT PRIMARY KEY NOT NULL, slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL,
      exam_date INTEGER, region TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
      requirements TEXT NOT NULL DEFAULT '[]', coverage TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT '', external_url TEXT NOT NULL DEFAULT '',
      deadline INTEGER, grant_amount TEXT NOT NULL DEFAULT '',
      province TEXT, city TEXT, scope TEXT NOT NULL DEFAULT 'national',
      is_verified INTEGER NOT NULL DEFAULT 0, income_ceiling INTEGER,
      gwa_requirement REAL, monthly_stipend INTEGER, service_obligation_years INTEGER,
      has_entrance_exam INTEGER NOT NULL DEFAULT 0, application_window TEXT,
      scholarship_meta TEXT NOT NULL DEFAULT '{}', results_date INTEGER,
      target_courses TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE admissions_updates (
      id TEXT PRIMARY KEY NOT NULL, report_date TEXT, severity TEXT NOT NULL,
      school_slug TEXT, school_name TEXT, title TEXT NOT NULL, body TEXT NOT NULL,
      action_required TEXT, event_date TEXT, event_type TEXT,
      sources TEXT NOT NULL DEFAULT '[]', verified INTEGER NOT NULL DEFAULT 0, remote_updated_at INTEGER
    );
    CREATE TABLE result_watches (slug TEXT PRIMARY KEY NOT NULL, added_at INTEGER NOT NULL);
    CREATE TABLE user_settings (
      id INTEGER PRIMARY KEY NOT NULL,
      selected_listing_slug TEXT NOT NULL DEFAULT '',
      last_synced_at INTEGER NOT NULL DEFAULT 0,
      full_name TEXT NOT NULL DEFAULT '',
      school TEXT NOT NULL DEFAULT '',
      grade_level INTEGER,
      google_id TEXT,
      email TEXT,
      notifications_enabled INTEGER DEFAULT 1,
      theme TEXT NOT NULL DEFAULT 'system',
      focus_mode_enabled INTEGER NOT NULL DEFAULT 1,
      google_calendar_connected INTEGER NOT NULL DEFAULT 0,
      income_bracket TEXT,
      gwa REAL,
      province TEXT,
      city TEXT,
      hs_gwa_g8 REAL, hs_gwa_g9 REAL, hs_gwa_g10 REAL, hs_gwa_g11 REAL,
      school_type TEXT,
      is_indigenous INTEGER,
      target_campus TEXT,
      score_disclaimer_ack INTEGER NOT NULL DEFAULT 0,
      target_exams TEXT NOT NULL DEFAULT '[]',
      target_courses TEXT NOT NULL DEFAULT '[]',
      school_region TEXT NOT NULL DEFAULT '',
      sync_rev INTEGER NOT NULL DEFAULT 0,
      ai_provider TEXT NOT NULL DEFAULT 'local',
      daily_reminder_hour INTEGER NOT NULL DEFAULT 9,
      weekly_summary_enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE focus_listings (
      listing_slug TEXT PRIMARY KEY NOT NULL,
      priority INTEGER NOT NULL,
      added_at INTEGER NOT NULL
    );
    CREATE TABLE saved_decks (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, topic_ids TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL);
    CREATE TABLE user_progress (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, flashcard_id TEXT NOT NULL, correct INTEGER NOT NULL, answered_at INTEGER NOT NULL);
    CREATE TABLE practice_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      listing_slug TEXT NOT NULL DEFAULT '',
      topic_id TEXT NOT NULL DEFAULT '',
      deck_id TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      duration_secs INTEGER NOT NULL DEFAULT 0,
      completed_at INTEGER NOT NULL
    );
    CREATE TABLE notes (
      id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'text', color TEXT,
      is_pinned INTEGER NOT NULL DEFAULT 0, is_archived INTEGER NOT NULL DEFAULT 0,
      is_trashed INTEGER NOT NULL DEFAULT 0, trashed_at INTEGER,
      reminder_at INTEGER, google_event_id TEXT,
      created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE note_labels (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE note_label_assignments (note_id TEXT NOT NULL, label_id TEXT NOT NULL, PRIMARY KEY (note_id, label_id));
    CREATE TABLE IF NOT EXISTS upcat_passages (set_id TEXT PRIMARY KEY NOT NULL, subtest TEXT NOT NULL, passage_text TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS upcat_questions (
      question_id TEXT PRIMARY KEY NOT NULL, subtest TEXT NOT NULL,
      main_subject TEXT, topic TEXT, subtopic TEXT, question_format TEXT, cognitive_level TEXT,
      difficulty TEXT, curriculum_alignment TEXT, question_text TEXT NOT NULL,
      options TEXT NOT NULL DEFAULT '[]', correct_index INTEGER NOT NULL, explanation TEXT NOT NULL,
      set_id TEXT, set_position INTEGER, has_visual INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'published', skill_category TEXT, remote_updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS upcat_facts (
      id TEXT PRIMARY KEY NOT NULL, topic TEXT NOT NULL, question TEXT NOT NULL,
      answer TEXT NOT NULL, source TEXT, valid_year INTEGER, remote_updated_at INTEGER
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS upcat_facts_fts USING fts5(
      fact_id UNINDEXED, topic, question, answer, tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER IF NOT EXISTS upcat_facts_fts_ai AFTER INSERT ON upcat_facts BEGIN
      INSERT INTO upcat_facts_fts (fact_id, topic, question, answer) VALUES (new.id, new.topic, new.question, new.answer);
    END;
    CREATE TRIGGER IF NOT EXISTS upcat_facts_fts_ad AFTER DELETE ON upcat_facts BEGIN
      DELETE FROM upcat_facts_fts WHERE fact_id = old.id;
    END;
    CREATE TRIGGER IF NOT EXISTS upcat_facts_fts_au AFTER UPDATE ON upcat_facts BEGIN
      DELETE FROM upcat_facts_fts WHERE fact_id = old.id;
      INSERT INTO upcat_facts_fts (fact_id, topic, question, answer) VALUES (new.id, new.topic, new.question, new.answer);
    END;
    CREATE TABLE IF NOT EXISTS upcat_cutoffs (
      id TEXT PRIMARY KEY NOT NULL, campus TEXT NOT NULL, program TEXT,
      cutoff REAL NOT NULL, year INTEGER, is_estimate INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS career_courses (
      course_id TEXT PRIMARY KEY NOT NULL, name TEXT, cluster TEXT, career_tag TEXT, demand TEXT,
      board_exam INTEGER NOT NULL DEFAULT 0, board_exam_name TEXT, duration_years REAL,
      top_countries TEXT NOT NULL DEFAULT '[]', summary TEXT, student_tip TEXT, ai_note TEXT, remote_updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS career_destinations (
      id TEXT PRIMARY KEY NOT NULL, course_id TEXT, country TEXT, demand_rating TEXT,
      salary_min REAL, salary_max REAL, salary_local TEXT, salary_type TEXT,
      visa_pathway TEXT, pr_pathway TEXT, credential TEXT, licensing_exam TEXT,
      language_required TEXT, timeline_months INTEGER, program_name TEXT,
      specializations TEXT NOT NULL DEFAULT '[]', notes TEXT, saturation_warning TEXT,
      source TEXT, remote_updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS career_countries (
      code TEXT PRIMARY KEY NOT NULL, name TEXT, region TEXT, immigration_system TEXT,
      why_demand TEXT, language_required TEXT, pr_pathway TEXT, notes TEXT, remote_updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS career_programs (
      id TEXT PRIMARY KEY NOT NULL, name TEXT, country_region TEXT,
      courses_covered TEXT NOT NULL DEFAULT '[]', managing_body TEXT, slots TEXT,
      requirements TEXT, immigration_outcome TEXT, website TEXT, notes TEXT, remote_updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS ai_career_impact (
      course_id TEXT PRIMARY KEY NOT NULL, course_name TEXT, cluster TEXT,
      board_exam INTEGER NOT NULL DEFAULT 0, board_exam_name TEXT,
      automation_risk_low INTEGER, automation_risk_high INTEGER,
      ai_safety_score INTEGER, ai_safety_label TEXT, color_code TEXT,
      what_ai_takes_over TEXT NOT NULL DEFAULT '[]', what_stays_human TEXT NOT NULL DEFAULT '[]',
      new_jobs_emerging TEXT NOT NULL DEFAULT '[]', skills_to_develop TEXT NOT NULL DEFAULT '[]',
      career_outlook_2030 TEXT, key_stat TEXT, key_source TEXT, key_quote TEXT,
      quote_by TEXT, ph_advantage TEXT, ph_notes TEXT, kuya_baw_summary TEXT,
      last_updated TEXT, remote_updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS career_facts (
      id TEXT PRIMARY KEY NOT NULL, course_id TEXT, query_type TEXT, course_name TEXT,
      quick_answer TEXT, key_caveat TEXT, point_to TEXT, remote_updated_at INTEGER
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS career_facts_fts USING fts5(
      fact_id UNINDEXED, course_name, quick_answer, key_caveat, tokenize='unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER IF NOT EXISTS career_facts_ai AFTER INSERT ON career_facts BEGIN
      INSERT INTO career_facts_fts (fact_id, course_name, quick_answer, key_caveat) VALUES (new.id, new.course_name, new.quick_answer, new.key_caveat);
    END;
    CREATE TRIGGER IF NOT EXISTS career_facts_ad AFTER DELETE ON career_facts BEGIN
      DELETE FROM career_facts_fts WHERE fact_id = old.id;
    END;
    CREATE TRIGGER IF NOT EXISTS career_facts_au AFTER UPDATE ON career_facts BEGIN
      DELETE FROM career_facts_fts WHERE fact_id = old.id;
      INSERT INTO career_facts_fts (fact_id, course_name, quick_answer, key_caveat) VALUES (new.id, new.course_name, new.quick_answer, new.key_caveat);
    END;
    CREATE TABLE IF NOT EXISTS tertiary_schools (
      id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, acronym TEXT, region TEXT,
      province TEXT, city TEXT, type TEXT, is_suc INTEGER NOT NULL DEFAULT 0,
      is_luc INTEGER NOT NULL DEFAULT 0, deped_school_id INTEGER, rank_in_province INTEGER, remote_updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS university_profiles (
      school_id TEXT PRIMARY KEY NOT NULL, data_tier TEXT, institution_type TEXT,
      year_established TEXT, known_for_courses TEXT NOT NULL DEFAULT '[]',
      prc_top_courses TEXT NOT NULL DEFAULT '[]', ched_coe_cod TEXT, accreditation TEXT,
      entrance_exam_name TEXT, entrance_exam_acronym TEXT, testing_center_type TEXT,
      application_open TEXT, application_close TEXT, exam_month TEXT,
      estimated_passing_rate TEXT, estimated_slots TEXT, tuition_fee_range TEXT,
      free_tuition INTEGER, academic_calendar TEXT,
      courses_offered TEXT NOT NULL DEFAULT '[]', scholarships_offered TEXT NOT NULL DEFAULT '[]',
      website_url TEXT, application_portal_url TEXT, facebook_url TEXT,
      exam_difficulty INTEGER, notable_programs TEXT NOT NULL DEFAULT '[]',
      prc_strong_boards TEXT NOT NULL DEFAULT '[]', notes TEXT, data_confidence TEXT, remote_updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS course_school_rankings (
      id TEXT PRIMARY KEY NOT NULL, course_tab TEXT NOT NULL, course_name TEXT, rank INTEGER,
      school_name TEXT NOT NULL, region TEXT, province TEXT,
      wilson_score REAL, raw_pass_rate REAL, total_examinees INTEGER, total_passers INTEGER,
      years_with_data TEXT, exam_periods INTEGER, tertiary_school_id TEXT, remote_updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS course_school_rankings_tab_idx ON course_school_rankings (course_tab);
    CREATE TABLE IF NOT EXISTS course_school_quality (
      id TEXT PRIMARY KEY NOT NULL, school_name TEXT NOT NULL, region TEXT, province TEXT, city TEXT,
      course_standardized TEXT, course_group TEXT, school_type TEXT, ched_coe_cod TEXT,
      quality_score INTEGER, quality_tier TEXT, accreditations TEXT NOT NULL DEFAULT '[]',
      has_prc_board INTEGER, qs_subject_rank TEXT, data_confidence TEXT,
      tertiary_school_id TEXT, remote_updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS bar_results (
      id TEXT PRIMARY KEY NOT NULL, school_name TEXT NOT NULL, region TEXT, province TEXT,
      year INTEGER, pass_rate REAL, national_avg REAL, sc_rank INTEGER, notes TEXT, remote_updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS course_taxonomy_map (
      course_tab TEXT PRIMARY KEY NOT NULL, career_course_id TEXT, label TEXT, kind TEXT, remote_updated_at INTEGER
    );
  `)
  return raw
}

/**
 * Build a hybrid DB: mock the first two db.select() calls for settings+focus,
 * but let db.transaction() use a real drizzle/better-sqlite3 instance.
 */
function makeHealSyncDb(raw: InstanceType<typeof Database>, settingsRow: Record<string, unknown>): DrizzleClient {
  const realDrizzle = drizzle(raw, { schema }) as any

  const settingsChain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([settingsRow]),
  }
  const focusChain = {
    from: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockResolvedValue([]),
  }

  let selectCallCount = 0
  const db: any = {
    select: jest.fn().mockImplementation(() => {
      selectCallCount += 1
      if (selectCallCount === 1) return settingsChain
      if (selectCallCount === 2) return focusChain
      return settingsChain
    }),
    transaction: (cb: (tx: any) => void) => realDrizzle.transaction(cb),
  }
  return db as DrizzleClient
}

// Empty supabase — we only care about what `since` was sent
function makeEmptySupabase(capturedGt: { value: string | null }) {
  const { supabase } = require('../supabase')

  const emptyResolved = Promise.resolve({ data: [] })
  const emptyChain: any = {
    select: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockImplementation((_, val: string) => {
      if (capturedGt.value === null) capturedGt.value = val
      return emptyChain
    }),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockResolvedValue({ data: [] }),
    then: (resolve: any, reject: any) => emptyResolved.then(resolve, reject),
  }
  supabase.from.mockImplementation(() => emptyChain)
}

describe('syncHeal — syncRev cursor heal', () => {
  let supabaseMock: any

  beforeEach(() => {
    jest.clearAllMocks()
    supabaseMock = require('../supabase').supabase
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } })
  })

  it('uses epoch since when syncRev=0 (needs heal), and persists syncRev=2 after sync', async () => {
    const raw = makeHealDb()
    // Device state: lastSyncedAt=T2=5000ms, syncRev=0
    const T2 = 5000
    raw.prepare(
      'INSERT INTO user_settings (id, selected_listing_slug, last_synced_at, sync_rev) VALUES (1, ?, ?, 0)'
    ).run('upcat', T2)

    const settingsRow = { id: 1, selectedListingSlug: 'upcat', lastSyncedAt: T2, syncRev: 0 }
    const capturedGt: { value: string | null } = { value: null }
    makeEmptySupabase(capturedGt)

    const db = makeHealSyncDb(raw, settingsRow)
    await syncOnLaunch(db as any)

    // Must have pulled with epoch since (full re-pull) not T2
    expect(capturedGt.value).toBe('1970-01-01T00:00:00.000Z')

    // syncRev=2 must be persisted in user_settings (SYNC_REV bumped to 2)
    const row = raw.prepare('SELECT sync_rev FROM user_settings WHERE id = 1').get() as any
    expect(row).toBeTruthy()
    expect(row.sync_rev).toBe(2)
  })

  it('uses epoch since when syncRev=1 (below SYNC_REV=2, needs heal)', async () => {
    const raw = makeHealDb()
    const T2 = 5000
    raw.prepare(
      'INSERT INTO user_settings (id, selected_listing_slug, last_synced_at, sync_rev) VALUES (1, ?, ?, 1)'
    ).run('upcat', T2)

    const settingsRow = { id: 1, selectedListingSlug: 'upcat', lastSyncedAt: T2, syncRev: 1 }
    const capturedGt: { value: string | null } = { value: null }
    makeEmptySupabase(capturedGt)

    const db = makeHealSyncDb(raw, settingsRow)
    await syncOnLaunch(db as any)

    // syncRev=1 < SYNC_REV=2 → must still use epoch for full re-pull
    expect(capturedGt.value).toBe('1970-01-01T00:00:00.000Z')

    // syncRev bumped to 2
    const row = raw.prepare('SELECT sync_rev FROM user_settings WHERE id = 1').get() as any
    expect(row.sync_rev).toBe(2)
  })

  it('uses incremental cursor when syncRev=2 (already healed to current rev)', async () => {
    const raw = makeHealDb()
    const T2 = 5000
    raw.prepare(
      'INSERT INTO user_settings (id, selected_listing_slug, last_synced_at, sync_rev) VALUES (1, ?, ?, 2)'
    ).run('upcat', T2)

    const settingsRow = { id: 1, selectedListingSlug: 'upcat', lastSyncedAt: T2, syncRev: 2 }
    const capturedGt: { value: string | null } = { value: null }
    makeEmptySupabase(capturedGt)

    const db = makeHealSyncDb(raw, settingsRow)
    await syncOnLaunch(db as any)

    // Must NOT use epoch — must use the actual lastSyncedAt cursor
    expect(capturedGt.value).not.toBe('1970-01-01T00:00:00.000Z')
    expect(capturedGt.value).toBe(new Date(T2).toISOString())

    // syncRev stays 2
    const row = raw.prepare('SELECT sync_rev FROM user_settings WHERE id = 1').get() as any
    expect(row.sync_rev).toBe(2)
  })

  it('cursor write (lastSyncedAt + syncRev=2) is persisted after first sync', async () => {
    const raw = makeHealDb()
    // Fresh device: lastSyncedAt=0, syncRev=0
    raw.prepare(
      'INSERT INTO user_settings (id, selected_listing_slug, last_synced_at, sync_rev) VALUES (1, ?, 0, 0)'
    ).run('upcat')

    const settingsRow = { id: 1, selectedListingSlug: 'upcat', lastSyncedAt: 0, syncRev: 0 }
    const capturedGt: { value: string | null } = { value: null }
    makeEmptySupabase(capturedGt)

    const db = makeHealSyncDb(raw, settingsRow)
    const before = Date.now()
    await syncOnLaunch(db as any)
    const after = Date.now()

    const row = raw.prepare('SELECT last_synced_at, sync_rev FROM user_settings WHERE id = 1').get() as any
    expect(row).toBeTruthy()
    // lastSyncedAt is set to the current time during sync
    expect(row.last_synced_at).toBeGreaterThanOrEqual(before)
    expect(row.last_synced_at).toBeLessThanOrEqual(after + 100)
    // syncRev written in the LAST transaction (the cursor write)
    expect(row.sync_rev).toBe(2)
  })
})
