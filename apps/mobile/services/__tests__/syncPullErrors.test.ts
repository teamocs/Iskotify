import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { syncOnLaunch } from '../sync'
import { getSyncStatus, resetSyncStatus } from '../syncStatus'

// Launch audit 2026-11-24.
// F1: a catalog pull that fails must fail the sync BEFORE the cursor moves. With
//     `res.data ?? []` a failed pull read as "nothing changed", the cursor advanced,
//     and the rows changed in that window were never pulled again.
// F6: the cursor is global, so a focus added after the last sync needs its own
//     full flashcards pull (its older cards are behind the cursor).

type Row = Record<string, any>
const tables: Record<string, Row[]> = {}
const failTables = new Set<string>()
let failFullSections = false
const cardPulls: { slug: string; since: string }[] = []
const sinceSeen: string[] = []

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(() => Promise.resolve({ data: [], error: null })),
  },
}))
jest.mock('../questionReports', () => ({ pushPendingReports: jest.fn().mockResolvedValue(undefined) }))

const BOOM = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }

/** A tiny in-memory PostgREST: select / contains / gt(updated_at) / in / order / range, thenable. */
function fakeFrom(table: string) {
  let rows: Row[] = [...(tables[table] ?? [])]
  let isFullSectionFetch = false
  let slug = ''
  const result = (data: Row[]) =>
    (isFullSectionFetch ? failFullSections : failTables.has(table)) ? BOOM : { data, error: null }
  const chain: any = {
    select: () => chain,
    contains: (col: string, vs: string[]) => { slug = vs[0]!; rows = rows.filter(r => (r[col] as string[]).includes(slug)); return chain },
    order: () => chain,
    gt: (col: string, v: string) => {
      sinceSeen.push(v)
      if (table === 'flashcards') cardPulls.push({ slug, since: v })
      rows = rows.filter(r => r[col] > v)
      return chain
    },
    in: (col: string, vs: unknown[]) => { isFullSectionFetch = table === 'exam_blueprint_sections'; rows = rows.filter(r => vs.includes(r[col])); return chain },
    range: (from: number, to: number) => Promise.resolve(result(rows.slice(from, to + 1))),
    then: (res: any, rej: any) => Promise.resolve(result(rows)).then(res, rej),
  }
  return chain
}

const EPOCH = '1970-01-01T00:00:00.000Z'
const LAST = Date.parse('2026-09-01T00:00:00Z')
const LAST_ISO = new Date(LAST).toISOString()
const BEFORE = '2026-08-01T00:00:00Z'
const AFTER = '2026-09-15T00:00:00Z'

function makeDb(syncRev = 3) {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup column on re-run */ } }
  raw.prepare('INSERT INTO user_settings (id, last_synced_at, sync_rev) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET last_synced_at = excluded.last_synced_at, sync_rev = excluded.sync_rev')
    .run(LAST, syncRev)
  const db = drizzle(raw, { schema }) as unknown as DrizzleClient
  return { raw, db }
}
const settings = (raw: Database.Database) =>
  raw.prepare('SELECT last_synced_at AS cursor, sync_rev AS rev FROM user_settings WHERE id = 1').get() as { cursor: number; rev: number }
const ids = (raw: Database.Database, table: string) =>
  (raw.prepare(`SELECT id FROM ${table} ORDER BY id`).all() as { id: string }[]).map(r => r.id)
const addFocus = (raw: Database.Database, slug: string, addedAt: number) =>
  raw.prepare('INSERT INTO focus_listings (listing_slug, priority, added_at) VALUES (?, ?, ?)').run(slug, addedAt, addedAt)

const listingRow = (id: string, updated_at: string) => ({ id, slug: id, title: id, type: 'exam', status: 'active', updated_at })
const cardRow = (id: string, slug: string, updated_at: string) => ({
  id, topic_id: 't1', question: 'q', answer: 'a', explanation: 'e', listing_slugs: [slug],
  options: ['a', 'b'], correct_answer_index: 0, status: 'published', updated_at,
})
const sectionRow = (id: string, slug: string, updated_at: string) => ({
  id, blueprint_slug: slug, name: id, skill_category: 'Mathematics', item_count: 10, time_minutes: 30,
  requires_spatial_logic: false, display_order: 1, updated_at,
})

beforeEach(() => {
  jest.restoreAllMocks()
  for (const k of Object.keys(tables)) delete tables[k]
  failTables.clear()
  failFullSections = false
  cardPulls.length = 0
  sinceSeen.length = 0
  resetSyncStatus()
  const { supabase } = require('../supabase')
  supabase.from.mockImplementation((t: string) => fakeFrom(t))
  supabase.auth.getUser.mockResolvedValue({ data: { user: null } })
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('F1: a failed catalog pull fails the sync before the cursor moves', () => {
  const UNPAGED = [
    'listings', 'flashcard_subjects', 'flashcard_topics', 'admissions_updates',
    'upcat_passages', 'upcat_facts', 'upcat_cutoffs',
    'career_courses', 'career_countries', 'career_programs', 'ai_career_impact', 'career_destinations', 'career_facts',
    'tertiary_schools', 'university_profiles', 'course_school_quality', 'bar_results', 'course_taxonomy_map',
    'exam_skill_categories', 'exam_blueprints', 'exam_blueprint_sections', 'exam_course_notes',
  ]
  const PAGED = ['upcat_questions', 'course_school_rankings', 'flashcards']

  it.each([...UNPAGED, ...PAGED])('%s: the cursor stays, nothing is written, the error is surfaced', async (table) => {
    const { raw, db } = makeDb()
    addFocus(raw, 'upcat', 1)
    tables.listings = [listingRow('changed-in-window', AFTER)]
    failTables.add(table)

    await syncOnLaunch(db)

    expect(settings(raw)).toEqual({ cursor: LAST, rev: 3 })
    expect(ids(raw, 'listings')).toEqual([])
    expect(getSyncStatus().lastError).not.toBeNull()
    expect(getSyncStatus().isSyncing).toBe(false)
  })

  it('the next sync pulls from the same cursor, so the row of the failed window arrives', async () => {
    const { raw, db } = makeDb()
    tables.listings = [listingRow('changed-in-window', AFTER)]
    failTables.add('career_facts')
    await syncOnLaunch(db)
    expect(ids(raw, 'listings')).toEqual([])

    failTables.clear()
    sinceSeen.length = 0
    await syncOnLaunch(db)

    expect(new Set(sinceSeen)).toEqual(new Set([LAST_ISO]))
    expect(ids(raw, 'listings')).toEqual(['changed-in-window'])
    expect(settings(raw).cursor).toBeGreaterThan(LAST)
    expect(getSyncStatus().lastError).toBeNull()
  })

  it('a healthy sync has no error and advances the cursor', async () => {
    const { raw, db } = makeDb()
    await syncOnLaunch(db)
    expect(getSyncStatus().lastError).toBeNull()
    expect(settings(raw).cursor).toBeGreaterThan(LAST)
  })

  it('the optional full-sections read stays tolerant, but the cursor waits for a good read', async () => {
    const { raw, db } = makeDb()
    raw.prepare('INSERT INTO exam_blueprint_sections (id, blueprint_slug, name, skill_category, item_count, time_minutes, requires_spatial_logic, display_order, remote_updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run('dost-sei:removed', 'dost-sei', 'x', 'Mathematics', 10, 30, 0, 1, 1)
    tables.exam_blueprint_sections = [sectionRow('dost-sei:1', 'dost-sei', AFTER)]
    tables.listings = [listingRow('changed-in-window', AFTER)]
    failFullSections = true

    await syncOnLaunch(db)

    // Tolerant: the rest of the catalog and the section delta are applied, local sections kept, no banner.
    expect(ids(raw, 'listings')).toEqual(['changed-in-window'])
    expect(ids(raw, 'exam_blueprint_sections')).toEqual(['dost-sei:1', 'dost-sei:removed'])
    expect(getSyncStatus().lastError).toBeNull()
    // Not advanced: the removal of 'dost-sei:removed' has not been applied yet.
    expect(settings(raw).cursor).toBe(LAST)

    failFullSections = false
    await syncOnLaunch(db)
    expect(ids(raw, 'exam_blueprint_sections')).toEqual(['dost-sei:1'])
    expect(settings(raw).cursor).toBeGreaterThan(LAST)
  })

  it('heal: a device on sync rev 2 re-pulls everything from epoch once and stores rev 3', async () => {
    const { raw, db } = makeDb(2)
    tables.listings = [listingRow('lost-in-a-failed-pull', BEFORE)]

    await syncOnLaunch(db)

    expect(new Set(sinceSeen)).toEqual(new Set([EPOCH]))
    expect(ids(raw, 'listings')).toEqual(['lost-in-a-failed-pull'])
    expect(settings(raw).rev).toBe(3)

    sinceSeen.length = 0
    await syncOnLaunch(db)
    expect(sinceSeen).not.toContain(EPOCH)
  })
})

describe('F6: a focus added after the last sync gets its older flashcards', () => {
  it('pulls the new slug from epoch and keeps the cursor for the others', async () => {
    const { raw, db } = makeDb()
    addFocus(raw, 'upcat', LAST - 86_400_000)
    addFocus(raw, 'pma', LAST + 3_600_000) // added an hour after the last sync
    tables.flashcards = [cardRow('pma-old', 'pma', BEFORE), cardRow('upcat-old', 'upcat', BEFORE), cardRow('upcat-new', 'upcat', AFTER)]

    await syncOnLaunch(db)

    expect(cardPulls).toEqual(expect.arrayContaining([{ slug: 'pma', since: EPOCH }, { slug: 'upcat', since: LAST_ISO }]))
    expect(cardPulls).toHaveLength(2)
    expect(ids(raw, 'flashcards')).toEqual(['pma-old', 'upcat-new'])
  })

  it('once that sync has succeeded the slug is back on the cursor', async () => {
    const { raw, db } = makeDb()

    addFocus(raw, 'pma', LAST + 3_600_000)
    jest.spyOn(Date, 'now').mockImplementation(() => LAST + 7_200_000)
    await syncOnLaunch(db)
    cardPulls.length = 0
    await syncOnLaunch(db)
    expect(cardPulls).toEqual([{ slug: 'pma', since: new Date(LAST + 7_200_000 - 60_000).toISOString() }])
  })

  it('a school focus added later pulls general-cet from epoch', async () => {
    const { raw, db } = makeDb()
    addFocus(raw, 'upcat', LAST - 86_400_000)
    addFocus(raw, 'school:unc-naga', LAST + 3_600_000)
    await syncOnLaunch(db)
    expect(cardPulls).toEqual(expect.arrayContaining([{ slug: 'general-cet', since: EPOCH }, { slug: 'upcat', since: LAST_ISO }]))
  })
})
