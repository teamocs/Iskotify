/**
 * Supabase migration 065 hides unpublished questions/flashcards/topics from the
 * anon key, so the delta pull can no longer see a row being unpublished or
 * deleted. content_status_feed (ids + status only) tells the device instead;
 * these tests cover the pager, the local apply, and its place in syncOnLaunch
 * (runs on a real in-memory SQLite DB built from CREATE_SQL + MIGRATIONS).
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import {
  fetchContentStatusFeed, applyContentStatusFeed, isRpcMissingError,
  type ContentStatusRow,
} from '../contentStatusFeed'
import { syncOnLaunch } from '../sync'

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(),
  },
}))

const { supabase } = require('../supabase') as { supabase: any }

const EPOCH = '1970-01-01T00:00:00.000Z'

function feedRow(kind: ContentStatusRow['kind'], id: string, status: string, changedAt: string): ContentStatusRow {
  return { kind, id, status, changed_at: changedAt }
}

function makeDb() {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup column */ } }
  const db = drizzle(raw, { schema }) as unknown as DrizzleClient
  raw.prepare("INSERT INTO topics (id, name, subject_id, status) VALUES ('T1', 'Algebra', 'S1', 'published'), ('T2', 'Geometry', 'S1', 'published')").run()
  raw.prepare(`INSERT INTO flashcards (id, topic_id, question, answer, explanation, status)
    VALUES ('F1', 'T1', 'q1', 'a1', '', 'published'), ('F2', 'T1', 'q2', 'a2', '', 'published')`).run()
  raw.prepare(`INSERT INTO upcat_questions (question_id, subtest, question_text, options, correct_index, explanation, status)
    VALUES ('Q1', 'Mathematics', 'q', '["a","b"]', 0, 'e', 'published'), ('Q2', 'Mathematics', 'q', '["a","b"]', 0, 'e', 'published')`).run()
  return { raw, db }
}

function statuses(raw: InstanceType<typeof Database>) {
  return {
    topics: raw.prepare('SELECT id, status FROM topics ORDER BY id').all(),
    cards: raw.prepare('SELECT id, status FROM flashcards ORDER BY id').all(),
    questions: raw.prepare('SELECT question_id AS id, status FROM upcat_questions ORDER BY question_id').all(),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { jest.restoreAllMocks() })

describe('isRpcMissingError', () => {
  it('recognises PostgREST "function not found" and Postgres "undefined function"', () => {
    expect(isRpcMissingError({ code: 'PGRST202', message: 'Could not find the function' })).toBe(true)
    expect(isRpcMissingError({ code: '42883', message: 'function does not exist' })).toBe(true)
    expect(isRpcMissingError({ code: '500', message: 'boom' })).toBe(false)
    expect(isRpcMissingError(null)).toBe(false)
  })
})

describe('fetchContentStatusFeed', () => {
  it('pages with the last row as the keyset cursor until a short page', async () => {
    const t = '2026-10-01T00:00:00.123456+00:00'
    supabase.rpc
      .mockResolvedValueOnce({ data: [feedRow('flashcard', 'F1', 'draft', t), feedRow('question', 'Q1', 'draft', t)], error: null })
      .mockResolvedValueOnce({ data: [feedRow('topic', 'T1', 'deleted', t)], error: null })

    const rows = await fetchContentStatusFeed(EPOCH, 2)

    expect(rows!.map(r => r.id)).toEqual(['F1', 'Q1', 'T1'])
    expect(supabase.rpc).toHaveBeenCalledTimes(2)
    expect(supabase.rpc).toHaveBeenNthCalledWith(1, 'content_status_feed', { p_since: EPOCH, p_limit: 2 })
    // The server's microsecond timestamp is passed back verbatim (no Date round-trip).
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, 'content_status_feed',
      { p_since: t, p_limit: 2, p_after_kind: 'question', p_after_id: 'Q1' })
  })

  it('stops after an exactly-full page followed by an empty one', async () => {
    supabase.rpc
      .mockResolvedValueOnce({ data: [feedRow('question', 'Q1', 'draft', '2026-10-01T00:00:00Z')], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
    const rows = await fetchContentStatusFeed(EPOCH, 1)
    expect(rows).toHaveLength(1)
    expect(supabase.rpc).toHaveBeenCalledTimes(2)
  })

  it('returns null (feed unavailable) when the server has no such function', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.content_status_feed' } })
    await expect(fetchContentStatusFeed(EPOCH)).resolves.toBeNull()
  })

  it('throws on any other error, including on a later page', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { code: '57014', message: 'timeout' } })
    await expect(fetchContentStatusFeed(EPOCH)).rejects.toMatchObject({ code: '57014' })

    supabase.rpc
      .mockResolvedValueOnce({ data: [feedRow('question', 'Q1', 'draft', '2026-10-01T00:00:00Z')], error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '500', message: 'boom' } })
    await expect(fetchContentStatusFeed(EPOCH, 1)).rejects.toMatchObject({ code: '500' })
  })
})

describe('applyContentStatusFeed', () => {
  it('marks draft and deleted rows not published, keeps the rows, leaves others alone', () => {
    const { raw, db } = makeDb()
    db.transaction((tx) => applyContentStatusFeed(tx, [
      feedRow('question', 'Q1', 'draft', 't'),
      feedRow('flashcard', 'F2', 'deleted', 't'),
      feedRow('topic', 'T1', 'deleted', 't'),
      feedRow('question', 'NOT-ON-DEVICE', 'deleted', 't'),
    ]))
    expect(statuses(raw)).toEqual({
      topics: [{ id: 'T1', status: 'draft' }, { id: 'T2', status: 'published' }],
      cards: [{ id: 'F1', status: 'published' }, { id: 'F2', status: 'draft' }],
      questions: [{ id: 'Q1', status: 'draft' }, { id: 'Q2', status: 'published' }],
    })
  })

  it('handles more ids than one SQLite statement can bind', () => {
    const { raw, db } = makeDb()
    const many = Array.from({ length: 1200 }, (_, i) => feedRow('question', `X${i}`, 'deleted', 't'))
    db.transaction((tx) => applyContentStatusFeed(tx, [...many, feedRow('question', 'Q2', 'draft', 't')]))
    expect(statuses(raw).questions).toEqual([{ id: 'Q1', status: 'published' }, { id: 'Q2', status: 'draft' }])
  })
})

describe('syncOnLaunch + content status feed', () => {
  const LAST_SYNCED = Date.parse('2026-09-30T00:00:00.000Z')

  function setup() {
    const ctx = makeDb()
    ctx.raw.prepare('INSERT INTO user_settings (id, selected_listing_slug, last_synced_at, sync_rev) VALUES (1, ?, ?, 2)')
      .run('upcat', LAST_SYNCED)
    // Every catalog pull returns nothing: the feed is the only source of change.
    const empty = Promise.resolve({ data: [], error: null })
    const chain: any = {
      select: jest.fn().mockReturnThis(), contains: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(), gt: jest.fn().mockReturnThis(), in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(), range: jest.fn().mockResolvedValue({ data: [], error: null }),
      then: (res: any, rej: any) => empty.then(res, rej),
    }
    supabase.from.mockImplementation(() => chain)
    supabase.auth.getUser.mockResolvedValue({ data: { user: null } })
    const cursor = () => (ctx.raw.prepare('SELECT last_synced_at FROM user_settings WHERE id = 1').get() as any).last_synced_at
    return { ...ctx, cursor }
  }

  it('propagates unpublished and deleted content using the pull cursor', async () => {
    const { raw, db, cursor } = setup()
    supabase.rpc.mockResolvedValueOnce({ data: [
      feedRow('question', 'Q1', 'draft', '2026-09-30T01:00:00Z'),
      feedRow('flashcard', 'F1', 'deleted', '2026-09-30T02:00:00Z'),
      feedRow('topic', 'T2', 'draft', '2026-09-30T03:00:00Z'),
    ], error: null })

    await syncOnLaunch(db)

    expect(supabase.rpc).toHaveBeenCalledWith('content_status_feed',
      expect.objectContaining({ p_since: new Date(LAST_SYNCED).toISOString() }))
    expect(statuses(raw)).toEqual({
      topics: [{ id: 'T1', status: 'published' }, { id: 'T2', status: 'draft' }],
      cards: [{ id: 'F1', status: 'draft' }, { id: 'F2', status: 'published' }],
      questions: [{ id: 'Q1', status: 'draft' }, { id: 'Q2', status: 'published' }],
    })
    expect(cursor()).toBeGreaterThan(LAST_SYNCED)
  })

  it('asks for the whole feed from epoch on a heal', async () => {
    const { raw, db } = setup()
    raw.prepare('UPDATE user_settings SET sync_rev = 0').run()
    supabase.rpc.mockResolvedValueOnce({ data: [], error: null })
    await syncOnLaunch(db)
    expect(supabase.rpc).toHaveBeenCalledWith('content_status_feed', expect.objectContaining({ p_since: EPOCH }))
  })

  it('tolerates a server without the feed: sync completes and the cursor advances', async () => {
    const { raw, db, cursor } = setup()
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })

    await syncOnLaunch(db)

    expect(cursor()).toBeGreaterThan(LAST_SYNCED)
    expect(statuses(raw).questions).toEqual([{ id: 'Q1', status: 'published' }, { id: 'Q2', status: 'published' }])
    expect(console.error).not.toHaveBeenCalled()
  })

  it('a failed feed page does not advance the cursor or apply a partial feed', async () => {
    const { raw, db, cursor } = setup()
    supabase.rpc
      .mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, i) => feedRow('question', i === 0 ? 'Q1' : `X${i}`, 'draft', '2026-09-30T01:00:00Z')), error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '500', message: 'boom' } })

    await syncOnLaunch(db)

    expect(cursor()).toBe(LAST_SYNCED)
    expect(statuses(raw).questions).toEqual([{ id: 'Q1', status: 'published' }, { id: 'Q2', status: 'published' }])
  })
})
