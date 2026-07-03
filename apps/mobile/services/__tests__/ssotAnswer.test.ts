import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import type { DrizzleClient } from '../../db/client'
import type { HomeStats } from '../../hooks/useHomeStats'
import {
  classifyDataIntent,
  answerFromData,
  ssotNotFoundMessage,
  looksFactual,
  stripTag,
  type DataIntent,
} from '../ssotAnswer'
import { _clearForTests } from '../queryCache'

// ── classifyDataIntent: pure, rule-based, no AI ───────────────────────────────

describe('classifyDataIntent', () => {
  describe('profile intent (first-person about own study)', () => {
    const cases = [
      'How am I doing this week?',
      'Am I ready for UPCAT?',
      'What should I focus on today?',
      'What should I study next?',
      'Am I on track?',
      'Show me my progress',
      'whats my streak',
      'how is my accuracy',
      'what are my weak topics',
      'Anong dapat kong i-focus today?',
      'kaya ko ba ito',
      // config / settings / focus (Task 3)
      'what are my settings',
      'what are my focused exams',
      'show my focused exams',
      'what is my plan',
      'what are my preferences',
      'what am i studying',
    ]
    it.each(cases)('classifies %p as profile', (q) => {
      expect(classifyDataIntent(q)).toBe('profile')
    })
  })

  describe('subjects intent (list subjects / review topics)', () => {
    const cases = [
      'what subjects are there',
      'what subjects are offered',
      'which subjects are available',
      'which topics are available',
      'list the review topics',
      'show me all subjects',
      'what topics can I study',
    ]
    it.each(cases)('classifies %p as subjects', (q) => {
      expect(classifyDataIntent(q)).toBe('subjects')
    })

    it('does NOT match grammar uses of "subject"/"topic" (guard on "sentence")', () => {
      expect(classifyDataIntent('what is the subject of the sentence')).toBeNull()
      expect(classifyDataIntent('what is the topic sentence')).toBeNull()
    })
  })

  describe('schools intent (pass rates / rankings / where to study)', () => {
    const cases = [
      'What are the top schools for nursing?',
      'best university for engineering',
      'best schools for nursing',
      'best universities for medicine',
      'which schools have the highest board pass rate',
      'which school has the highest pass rate',
      'show me the board exam pass rates',
      'nursing school ranking',
      'where should I study nursing',
      'best college for accountancy',
    ]
    it.each(cases)('classifies %p as schools', (q) => {
      expect(classifyDataIntent(q)).toBe('schools')
    })
  })

  describe('destinations intent (abroad / visa / PR)', () => {
    const cases = [
      'Where can a nursing grad work abroad?',
      'nursing jobs overseas',
      'which country pays nurses the most',
      'what visa do I need as a nurse', // "i need" is not a profile subject signal
      'best destination for engineers',
      'can I migrate as an OFW nurse',
    ]
    it.each(cases)('classifies %p as destinations', (q) => {
      expect(classifyDataIntent(q)).toBe('destinations')
    })
  })

  describe('courses intent (programs / demand / AI impact)', () => {
    const cases = [
      'Is nursing a good course?',
      'what degree should lead to a stable career path',
      'which programs are in demand',
      'is computer science AI-proof',
      'will automation affect accounting',
      'tell me about the nursing program',
    ]
    it.each(cases)('classifies %p as courses', (q) => {
      expect(classifyDataIntent(q)).toBe('courses')
    })
  })

  describe('listings intent (scholarships / exams / deadlines)', () => {
    const cases = [
      'What scholarships can you show me?',
      'when is the UPCAT',
      'DOST grant deadline',
      'ACET application requirements',
      'tell me about the entrance exam',
      'when is the USTET',
      'PUPCET deadline please',
    ]
    it.each(cases)('classifies %p as listings', (q) => {
      expect(classifyDataIntent(q)).toBe('listings')
    })
  })

  describe('null for pure reasoning / math / definition / greeting questions', () => {
    const cases = [
      'what is photosynthesis',
      'define mitosis',
      'explain Newton\'s first law',
      'how does gravity work',
      'what is the meaning of democracy',
      'of course that works',
      'what is PR',
      'when is the next solar eclipse',
      'explain the program counter in CPU',
      'application of derivatives',
      'solve 2x + 5 = 11',
      'calculate 12 times 8',
      'what is 7 plus 5',
      'simplify 3/9',
      'hi',
      'hello kuya',
      'thanks!',
      '',
      '   ',
    ]
    it.each(cases)('classifies %p as null (reasoning → LLM)', (q) => {
      expect(classifyDataIntent(q)).toBeNull()
    })
  })

  describe('precedence (most-specific-first)', () => {
    it('routes "best school for nursing" to schools, not courses', () => {
      expect(classifyDataIntent('best school for nursing course')).toBe('schools')
    })
    it('routes "am I ready for the UPCAT exam" to profile, not listings', () => {
      expect(classifyDataIntent('am I ready for the UPCAT exam?')).toBe('profile')
    })
    it('routes "where can nurses work abroad" to destinations, not courses', () => {
      expect(classifyDataIntent('where can nurses work abroad with this course')).toBe('destinations')
    })
  })

  describe('strong listing signals beat the math guard', () => {
    it('routes a strong listing signal to listings even if a digit/operator is present', () => {
      // UPCAT acronym is a strong listing signal; must not be stolen by the math guard.
      expect(classifyDataIntent('is the UPCAT 2026 exam +2 weeks delayed?')).toBe('listings')
    })
    it('still returns null for a pure math question', () => {
      expect(classifyDataIntent('solve 2x + 6 = 14')).toBe(null)
    })
  })
})

// ── looksFactual: exported factual-lookup guard (Task 6 shared helper) ─────────

describe('looksFactual', () => {
  it('flags factual-lookup questions', () => {
    expect(looksFactual('what exams are available')).toBe(true)
    expect(looksFactual('list the scholarships')).toBe(true)
    expect(looksFactual('what subjects can I review')).toBe(true)
  })
  it('does not flag reasoning questions', () => {
    expect(looksFactual('what is photosynthesis')).toBe(false)
    expect(looksFactual('solve 2x + 6 = 14')).toBe(false)
  })
  it('returns false for empty input', () => {
    expect(looksFactual('')).toBe(false)
    expect(looksFactual('   ')).toBe(false)
  })
})

// ── stripTag: exported header-stripping helper (Task 6 shared helper) ──────────

describe('stripTag', () => {
  it('removes a leading "[TAG]\\n" bracket header', () => {
    expect(stripTag('[LISTINGS]\n- UPCAT 2026 (exam)')).toBe('- UPCAT 2026 (exam)')
  })
  it('leaves untagged text unchanged (trimmed)', () => {
    expect(stripTag('  plain body  ')).toBe('plain body')
  })
})

// ── answerFromData: deterministic, DB-grounded, no LLM ────────────────────────

const STATS_BASE: HomeStats = {
  listing: { title: 'UPCAT 2026', examDate: Date.now() + 30 * 86400000 },
  daysLeft: 30,
  todayAccuracy: 75,
  streakDays: 5,
  weakTopics: [
    { topicId: 't1', topicName: 'Algebra', accuracy: 32 },
    { topicId: 't2', topicName: 'Biology', accuracy: 45 },
  ],
  firstTopicId: 't1',
  fullName: 'Juan',
  importantDayIndices: [],
  practiceDayIndices: [],
  focusedListings: [],
  noteReminders: [],
  listingAccuracy: {},
  refresh: async () => {},
}

function makeUserSettingsTable(raw: InstanceType<typeof Database>): void {
  raw.exec(`
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
      hs_gwa_g8 REAL,
      hs_gwa_g9 REAL,
      hs_gwa_g10 REAL,
      hs_gwa_g11 REAL,
      school_type TEXT,
      is_indigenous INTEGER DEFAULT 0,
      target_campus TEXT,
      score_disclaimer_ack INTEGER NOT NULL DEFAULT 0,
      target_exams TEXT NOT NULL DEFAULT '[]',
      target_courses TEXT NOT NULL DEFAULT '[]',
      school_region TEXT NOT NULL DEFAULT '',
      sync_rev INTEGER NOT NULL DEFAULT 0,
      ai_provider TEXT NOT NULL DEFAULT 'local'
    );
  `)
}

function makeListingsTable(raw: InstanceType<typeof Database>): void {
  raw.exec(`
    CREATE TABLE listings (
      id TEXT PRIMARY KEY NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'published',
      exam_date INTEGER,
      region TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      requirements TEXT NOT NULL DEFAULT '[]',
      coverage TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT '',
      external_url TEXT NOT NULL DEFAULT '',
      deadline INTEGER,
      grant_amount TEXT NOT NULL DEFAULT '',
      province TEXT,
      city TEXT,
      scope TEXT NOT NULL DEFAULT 'national',
      is_verified INTEGER NOT NULL DEFAULT 0,
      income_ceiling INTEGER,
      gwa_requirement INTEGER,
      monthly_stipend INTEGER,
      service_obligation_years INTEGER,
      has_entrance_exam INTEGER NOT NULL DEFAULT 0,
      application_window TEXT,
      scholarship_meta TEXT NOT NULL DEFAULT '{}',
      results_date INTEGER,
      target_courses TEXT NOT NULL DEFAULT '[]'
    );
  `)
}

describe('answerFromData', () => {
  beforeEach(() => { _clearForTests() })

  describe('listings', () => {
    function makeDb(): DrizzleClient {
      const raw = new Database(':memory:')
      makeListingsTable(raw)
      raw.exec(`
        INSERT INTO listings (id, slug, title, type, status, deadline, grant_amount, provider)
        VALUES ('L2', 'dost-sei', 'DOST-SEI Merit Scholarship', 'scholarship', 'published', 1748736000000, '₱40,000/year', 'DOST');
      `)
      return drizzle(raw, { schema }) as unknown as DrizzleClient
    }

    it('returns a friendly "From your Lists:" message with the listing (no bracket tag)', async () => {
      const db = makeDb()
      const out = await answerFromData(db, 'when is the DOST scholarship deadline?', 'listings', STATS_BASE)
      expect(out).not.toBeNull()
      expect(out).toContain('From your Lists:')
      expect(out).toContain('DOST-SEI Merit Scholarship')
      // The raw [LISTINGS] tag is stripped from the user-facing message.
      expect(out).not.toContain('[LISTINGS]')
      // Each listing item renders as its own "- " bullet line, with the intro
      // ("From your Lists:") on its own line above the bullets.
      const lines = (out as string).split('\n')
      expect(lines[0]).toBe('From your Lists:')
      expect(lines.some(l => l.startsWith('- '))).toBe(true)
    })

    it('falls back to enumeration (non-null) when no SPECIFIC listing matches but the table is non-empty', async () => {
      // Previously this returned the not-found message; the SSoT fix now
      // enumerates the catalog so a general listing question is answered.
      const db = makeDb()
      const out = await answerFromData(db, 'when is the BUCET?', 'listings', STATS_BASE)
      expect(out).not.toBeNull()
      expect(out).toContain('From your Lists:')
      expect(out).toContain('DOST-SEI Merit Scholarship')
    })
  })

  describe('schools', () => {
    function makeDb(): DrizzleClient {
      const raw = new Database(':memory:')
      raw.exec(`
        CREATE TABLE career_courses (
          course_id TEXT PRIMARY KEY NOT NULL,
          name TEXT, cluster TEXT, career_tag TEXT, demand TEXT,
          board_exam INTEGER NOT NULL DEFAULT 0, board_exam_name TEXT,
          duration_years REAL, top_countries TEXT NOT NULL DEFAULT '[]',
          summary TEXT, student_tip TEXT, ai_note TEXT, remote_updated_at INTEGER
        );
        CREATE TABLE course_school_rankings (
          id TEXT PRIMARY KEY NOT NULL,
          course_tab TEXT NOT NULL, course_name TEXT, rank INTEGER,
          school_name TEXT NOT NULL, region TEXT, province TEXT,
          wilson_score REAL, raw_pass_rate REAL, total_examinees INTEGER,
          total_passers INTEGER, years_with_data TEXT, exam_periods INTEGER,
          tertiary_school_id TEXT, remote_updated_at INTEGER
        );
      `)
      raw.exec(`
        INSERT INTO career_courses (course_id, name, cluster, demand, board_exam, board_exam_name)
        VALUES ('C1', 'Nursing', 'Health Sciences', 'High', 1, 'Nursing Licensure Exam');
        INSERT INTO course_school_rankings
          (id, course_tab, course_name, rank, school_name, region, raw_pass_rate, total_examinees, total_passers)
        VALUES
          ('R1', 'Nursing', 'Nursing', 1, 'Cavite State University', 'Region IV-A', 99.7, 362, 361),
          ('R2', 'Nursing', 'Nursing', 2, 'University of Santo Tomas', 'NCR', 98.2, 500, 491);
      `)
      return drizzle(raw, { schema }) as unknown as DrizzleClient
    }

    it('returns a "Top schools by PRC board pass rate:" message with the verify-yearly caveat', async () => {
      const db = makeDb()
      const out = await answerFromData(db, 'what are the top schools for nursing?', 'schools', STATS_BASE)
      expect(out).not.toBeNull()
      expect(out).toContain('Top schools by PRC board pass rate:')
      expect(out).toContain('Cavite State University')
      expect(out).toContain('99.7')
      expect(out).toContain('figures change yearly')
      expect(out).not.toContain('[TOP SCHOOLS]')
      // Intro on its own line; the ranking renders as a "- " bullet line.
      const lines = (out as string).split('\n')
      expect(lines[0]).toBe('Top schools by PRC board pass rate:')
      expect(lines.some(l => l.startsWith('- '))).toBe(true)
    })

    it('returns null when no course matches', async () => {
      const db = makeDb()
      const out = await answerFromData(db, 'top schools for underwater basket weaving', 'schools', STATS_BASE)
      expect(out).toBeNull()
    })
  })

  describe('profile (always returns something sensible)', () => {
    function makeDb(): DrizzleClient {
      const raw = new Database(':memory:')
      makeUserSettingsTable(raw)
      return drizzle(raw, { schema }) as unknown as DrizzleClient
    }

    it('returns a progress snapshot grounded in stats (non-null even with no settings row)', async () => {
      const db = makeDb()
      const out = await answerFromData(db, 'how am I doing?', 'profile', STATS_BASE)
      expect(out).not.toBeNull()
      expect(out).toContain('UPCAT 2026')
      expect(out).toContain('5-day streak')
      expect(out).toContain('Algebra (32%)')
    })

    it('renders multiple weak topics as a "- " bullet list under a "Weak topics:" header', async () => {
      const db = makeDb()
      // STATS_BASE has two weak topics (Algebra, Biology) → bulleted.
      const out = await answerFromData(db, 'how am I doing?', 'profile', STATS_BASE)
      expect(out).not.toBeNull()
      const text = out as string
      // Header on its own line, each weak topic on its own "- " line.
      expect(text).toContain('Weak topics:\n- Algebra (32%)')
      expect(text).toContain('- Biology (45%)')
      // The comma-joined inline form must NOT survive.
      expect(text).not.toContain('Algebra (32%), Biology (45%)')
    })

    it('keeps a single weak topic inline (no one-item bullet list)', async () => {
      const db = makeDb()
      const oneWeak: HomeStats = {
        ...STATS_BASE,
        weakTopics: [{ topicId: 't1', topicName: 'Algebra', accuracy: 32 }],
      }
      const out = await answerFromData(db, 'how am I doing?', 'profile', oneWeak)
      expect(out).not.toBeNull()
      const text = out as string
      expect(text).toContain('Weak topics: Algebra (32%).')
      expect(text).not.toContain('Weak topics:\n- Algebra')
    })
  })

  describe('subjects', () => {
    function makeDb(): DrizzleClient {
      const raw = new Database(':memory:')
      raw.exec(`
        CREATE TABLE subjects (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL);
        CREATE TABLE topics (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, subject_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'published');
        INSERT INTO subjects (id, name) VALUES ('SU1', 'Mathematics'), ('SU2', 'Science');
        INSERT INTO topics (id, name, subject_id) VALUES ('T1', 'Algebra', 'SU1'), ('T2', 'Biology', 'SU2');
      `)
      return drizzle(raw, { schema }) as unknown as DrizzleClient
    }

    it('returns a "Here are your review subjects:" message with per-subject topic counts (no bracket tag)', async () => {
      const db = makeDb()
      const out = await answerFromData(db, 'what subjects are there?', 'subjects', STATS_BASE)
      expect(out).not.toBeNull()
      expect(out).toContain('Here are your review subjects:')
      expect(out).toContain('- Mathematics (1 topics)')
      expect(out).toContain('- Science (1 topics)')
      expect(out).not.toContain('[SUBJECTS]')
    })

    it('returns null when no subjects are synced', async () => {
      const raw = new Database(':memory:')
      raw.exec(`
        CREATE TABLE subjects (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL);
        CREATE TABLE topics (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, subject_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'published');
      `)
      const db = drizzle(raw, { schema }) as unknown as DrizzleClient
      const out = await answerFromData(db, 'what subjects are there?', 'subjects', STATS_BASE)
      expect(out).toBeNull()
    })
  })

  describe('listings (enumeration fallback)', () => {
    function makeDb(): DrizzleClient {
      const raw = new Database(':memory:')
      makeListingsTable(raw)
      raw.exec(`
        INSERT INTO listings (id, slug, title, type, status, exam_date) VALUES
          ('E1', 'upcat-2026', 'UPCAT 2026', 'exam', 'active', 1751328000000),
          ('E2', 'acet-2026', 'ACET 2026', 'exam', 'active', NULL);
        INSERT INTO listings (id, slug, title, type, status) VALUES
          ('S1', 'dost-sei', 'DOST-SEI Scholarship', 'scholarship', 'active');
      `)
      return drizzle(raw, { schema }) as unknown as DrizzleClient
    }

    it('falls back to enumeration for a general "what exams can I take" question (no specific match)', async () => {
      const db = makeDb()
      const out = await answerFromData(db, 'what exams can I take?', 'listings', STATS_BASE)
      expect(out).not.toBeNull()
      expect(out).toContain('From your Lists:')
      expect(out).toContain('UPCAT 2026 (exam)')
      expect(out).toContain('ACET 2026 (exam)')
      expect(out).not.toContain('(scholarship)')  // exam-side filter
      expect(out).not.toContain('[LISTINGS]')
    })

    it('still prefers a specific named match over enumeration', async () => {
      const db = makeDb()
      const out = await answerFromData(db, 'when is the UPCAT?', 'listings', STATS_BASE)
      expect(out).not.toBeNull()
      expect(out).toContain('UPCAT 2026')
      // Specific match returns a single listing (not the full ACET enumeration).
      expect(out).not.toContain('ACET 2026')
    })

    it('returns null only when the listings table is empty', async () => {
      const raw = new Database(':memory:')
      makeListingsTable(raw)
      const db = drizzle(raw, { schema }) as unknown as DrizzleClient
      const out = await answerFromData(db, 'what exams can I take?', 'listings', STATS_BASE)
      expect(out).toBeNull()
    })
  })
})

// ── ssotNotFoundMessage ───────────────────────────────────────────────────────

describe('ssotNotFoundMessage', () => {
  const intents: DataIntent[] = ['profile', 'subjects', 'schools', 'destinations', 'courses', 'listings']
  it.each(intents)('returns a non-empty friendly sentence for %s', (intent) => {
    const msg = ssotNotFoundMessage(intent)
    expect(typeof msg).toBe('string')
    expect(msg.length).toBeGreaterThan(0)
  })
  it('points listings/courses users to the Lists tab', () => {
    expect(ssotNotFoundMessage('listings')).toContain('Lists tab')
    expect(ssotNotFoundMessage('courses')).toContain('Lists tab')
  })
  it('points subjects users to the Exams/Review tab', () => {
    expect(ssotNotFoundMessage('subjects')).toContain('Review')
  })
})
