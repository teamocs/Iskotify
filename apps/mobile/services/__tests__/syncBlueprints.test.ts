import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { syncOnLaunch } from '../sync'

// Logic audit B6 + B7: blueprint sections are REPLACED per blueprint when a
// pull touches that blueprint (a section the admin removed must disappear from
// devices), and the sync cursor is the time captured BEFORE the first query
// minus a safety margin (not Date.now() after a possibly slow fetch).

type Row = Record<string, any>
const tables: Record<string, Row[]> = {}
const sinceSeen: string[] = []
let failFullSections = false

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
    // content_status_feed (migration 065): no unpublished/deleted content by default.
    rpc: jest.fn(() => Promise.resolve({ data: [], error: null })),
  },
}))
jest.mock('../questionReports', () => ({ pushPendingReports: jest.fn().mockResolvedValue(undefined) }))

const rangesSeen: [number, number][] = []
/** PostgREST's default max-rows: an un-ranged select silently stops at this many rows. */
const MAX_ROWS = 1000

/** A tiny in-memory PostgREST: select / eq / gt(updated_at) / in / order / range, thenable.
 *  Like the real thing, an un-ranged select is capped at MAX_ROWS; .range(from, to) slices. */
function fakeFrom(table: string) {
  let rows: Row[] = [...(tables[table] ?? [])]
  let isFullSectionFetch = false
  const chain: any = {
    select: () => chain,
    contains: () => chain,
    order: (col: string) => { rows = [...rows].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0)); return chain },
    eq: (col: string, v: unknown) => { rows = rows.filter(r => r[col] === v); return chain },
    gt: (col: string, v: string) => { if (col === 'updated_at') sinceSeen.push(v); rows = rows.filter(r => !r[col] || r[col] > v); return chain },
    in: (col: string, vs: unknown[]) => { isFullSectionFetch = table === 'exam_blueprint_sections'; rows = rows.filter(r => vs.includes(r[col])); return chain },
    range: (from: number, to: number) => {
      if (isFullSectionFetch) rangesSeen.push([from, to])
      return Promise.resolve(isFullSectionFetch && failFullSections
        ? { data: null, error: { message: 'boom' } }
        : { data: rows.slice(from, to + 1), error: null })
    },
    then: (res: any, rej: any) =>
      Promise.resolve(isFullSectionFetch && failFullSections ? { data: null, error: { message: 'boom' } } : { data: rows.slice(0, MAX_ROWS), error: null }).then(res, rej),
  }
  return chain
}

function makeDb(lastSyncedAt: number) {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup column on re-run */ } }
  raw.prepare('INSERT INTO user_settings (id, last_synced_at, sync_rev) VALUES (1, ?, 2) ON CONFLICT(id) DO UPDATE SET last_synced_at = excluded.last_synced_at, sync_rev = 2').run(lastSyncedAt)
  const db = drizzle(raw, { schema }) as unknown as DrizzleClient
  return { raw, db }
}

const sectionRow = (id: string, slug: string, updated_at: string, over: Row = {}) => ({
  id, blueprint_slug: slug, name: id, skill_category: 'Mathematics', item_count: 10, time_minutes: 30,
  requires_spatial_logic: false, display_order: 1, updated_at, ...over,
})
const blueprintRow = (slug: string, updated_at: string) => ({
  slug, name: slug, acronym: slug, total_items: 20, total_time_minutes: 60, has_guessing_penalty: false,
  guessing_penalty: 0.25, section_blocked: true, scoring_note: '', mechanics_note: '', status: 'published', display_order: 1, updated_at,
})
function seedLocalSections(raw: Database.Database, slug: string, ids: string[]) {
  for (const id of ids) {
    raw.prepare('INSERT INTO exam_blueprint_sections (id, blueprint_slug, name, skill_category, item_count, time_minutes, requires_spatial_logic, display_order, remote_updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, slug, id, 'Mathematics', 10, 30, 0, 1, 1)
  }
}
const localIds = (raw: Database.Database, slug: string) =>
  (raw.prepare('SELECT id FROM exam_blueprint_sections WHERE blueprint_slug = ? ORDER BY id').all(slug) as { id: string }[]).map(r => r.id)

const LAST = Date.parse('2026-09-01T00:00:00Z')
const AFTER = '2026-09-15T00:00:00Z'

beforeEach(() => {
  jest.restoreAllMocks()
  for (const k of Object.keys(tables)) delete tables[k]
  sinceSeen.length = 0
  rangesSeen.length = 0
  failFullSections = false
  const { supabase } = require('../supabase')
  supabase.from.mockImplementation((t: string) => fakeFrom(t))
  supabase.auth.getUser.mockResolvedValue({ data: { user: null } })
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

describe('B6: blueprint sections are replaced per blueprint', () => {
  it('a section the admin removed disappears from the device', async () => {
    const { raw, db } = makeDb(LAST)
    seedLocalSections(raw, 'dost-sei', ['dost-sei:1', 'dost-sei:2', 'dost-sei:3'])
    // Admin re-saved the blueprint with only two sections.
    tables.exam_blueprints = [blueprintRow('dost-sei', AFTER)]
    tables.exam_blueprint_sections = [sectionRow('dost-sei:1', 'dost-sei', AFTER), sectionRow('dost-sei:2', 'dost-sei', AFTER)]
    await syncOnLaunch(db)
    expect(localIds(raw, 'dost-sei')).toEqual(['dost-sei:1', 'dost-sei:2'])
  })

  it('a partial delta never deletes the untouched sections of that blueprint', async () => {
    const { raw, db } = makeDb(LAST)
    seedLocalSections(raw, 'upcat', ['upcat:1', 'upcat:2', 'upcat:3'])
    // Only section 2 changed since the cursor; 1 and 3 are older but still exist remotely.
    tables.exam_blueprint_sections = [
      sectionRow('upcat:1', 'upcat', '2026-08-01T00:00:00Z'),
      sectionRow('upcat:2', 'upcat', AFTER, { item_count: 99 }),
      sectionRow('upcat:3', 'upcat', '2026-08-01T00:00:00Z'),
    ]
    await syncOnLaunch(db)
    expect(localIds(raw, 'upcat')).toEqual(['upcat:1', 'upcat:2', 'upcat:3'])
    expect((raw.prepare('SELECT item_count FROM exam_blueprint_sections WHERE id = ?').get('upcat:2') as any).item_count).toBe(99)
  })

  it('an EMPTY full fetch keeps the local sections (it can be the admin non-atomic delete-then-insert window)', async () => {
    const { raw, db } = makeDb(LAST)
    seedLocalSections(raw, 'acet', ['acet:1', 'acet:2'])
    tables.exam_blueprints = [blueprintRow('acet', AFTER)]
    tables.exam_blueprint_sections = []
    await syncOnLaunch(db)
    expect(localIds(raw, 'acet')).toEqual(['acet:1', 'acet:2'])
  })

  it('only the slug whose full fetch came back empty is spared; another changed slug is still replaced', async () => {
    const { raw, db } = makeDb(LAST)
    seedLocalSections(raw, 'acet', ['acet:1'])
    seedLocalSections(raw, 'dost-sei', ['dost-sei:1', 'dost-sei:2'])
    tables.exam_blueprints = [blueprintRow('acet', AFTER), blueprintRow('dost-sei', AFTER)]
    tables.exam_blueprint_sections = [sectionRow('dost-sei:1', 'dost-sei', AFTER)]
    await syncOnLaunch(db)
    expect(localIds(raw, 'acet')).toEqual(['acet:1'])
    expect(localIds(raw, 'dost-sei')).toEqual(['dost-sei:1'])
  })

  it('pages the full fetch so a truncated read cannot delete sections', async () => {
    const { raw, db } = makeDb(LAST)
    const ids = Array.from({ length: 1200 }, (_, i) => `big:${String(i).padStart(4, '0')}`)
    seedLocalSections(raw, 'big', [...ids, 'big:stale'])
    tables.exam_blueprints = [blueprintRow('big', AFTER)]
    tables.exam_blueprint_sections = ids.map(id => sectionRow(id, 'big', '2026-08-01T00:00:00Z'))
    await syncOnLaunch(db)
    expect(rangesSeen).toEqual([[0, 999], [1000, 1999]])
    expect(localIds(raw, 'big')).toEqual(ids) // all 1200 kept, only the removed one gone
  })

  it('leaves every other blueprint untouched', async () => {
    const { raw, db } = makeDb(LAST)
    seedLocalSections(raw, 'acet', ['acet:1'])
    seedLocalSections(raw, 'dost-sei', ['dost-sei:1', 'dost-sei:2'])
    tables.exam_blueprints = [blueprintRow('dost-sei', AFTER)]
    tables.exam_blueprint_sections = [sectionRow('dost-sei:1', 'dost-sei', AFTER)]
    await syncOnLaunch(db)
    expect(localIds(raw, 'acet')).toEqual(['acet:1'])
    expect(localIds(raw, 'dost-sei')).toEqual(['dost-sei:1'])
  })

  it('if the full per-blueprint fetch fails, local sections are kept (never delete on an unreliable read)', async () => {
    const { raw, db } = makeDb(LAST)
    seedLocalSections(raw, 'dost-sei', ['dost-sei:1', 'dost-sei:2', 'dost-sei:3'])
    failFullSections = true
    tables.exam_blueprints = [blueprintRow('dost-sei', AFTER)]
    tables.exam_blueprint_sections = [sectionRow('dost-sei:1', 'dost-sei', AFTER)]
    await syncOnLaunch(db)
    expect(localIds(raw, 'dost-sei')).toEqual(['dost-sei:1', 'dost-sei:2', 'dost-sei:3'])
  })
})

describe('B7: the sync cursor is captured before the fetch, minus a safety margin', () => {
  it('stores (start - 60s), not the clock after a slow fetch', async () => {
    const { raw, db } = makeDb(LAST)
    let now = Date.parse('2026-10-01T10:00:00Z')
    const start = now
    jest.spyOn(Date, 'now').mockImplementation(() => now)
    const { supabase } = require('../supabase')
    supabase.from.mockImplementation((t: string) => {
      now += 5_000 // every query takes 5s: the fetch window is long
      return fakeFrom(t)
    })
    await syncOnLaunch(db)
    const stored = (raw.prepare('SELECT last_synced_at FROM user_settings WHERE id = 1').get() as any).last_synced_at
    expect(stored).toBe(start - 60_000)
    expect(stored).toBeLessThan(now)
  })

  it('a row that changed while the pull was in flight is still ahead of the stored cursor', async () => {
    const { raw, db } = makeDb(LAST)
    let now = Date.parse('2026-10-01T10:00:00Z')
    jest.spyOn(Date, 'now').mockImplementation(() => now)
    const { supabase } = require('../supabase')
    supabase.from.mockImplementation((t: string) => { now += 20_000; return fakeFrom(t) })
    await syncOnLaunch(db)
    const stored = (raw.prepare('SELECT last_synced_at FROM user_settings WHERE id = 1').get() as any).last_synced_at
    const changedMidPull = Date.parse('2026-10-01T10:00:10Z') // edited 10s into the pull
    expect(changedMidPull).toBeGreaterThan(stored)
  })
})
