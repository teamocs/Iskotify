import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { listFocusExamSlugs } from '../diagnosticSource'

function makeDb(): DrizzleClient {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup column/table on re-run */ } }
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

describe('listFocusExamSlugs', () => {
  it('returns the focus exams in priority order and leaves out school-level focus entries', async () => {
    const db = makeDb()
    await db.insert(schema.focusListings).values([
      { listingSlug: 'ustet', priority: 3, addedAt: 1 },
      { listingSlug: 'school:12', priority: 1, addedAt: 1 },
      { listingSlug: 'acet', priority: 2, addedAt: 1 },
    ])
    expect(await listFocusExamSlugs(db)).toEqual(['acet', 'ustet'])
  })

  it('is empty when nothing is in focus', async () => {
    expect(await listFocusExamSlugs(makeDb())).toEqual([])
  })
})
