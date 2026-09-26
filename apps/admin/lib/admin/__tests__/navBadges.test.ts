import { describe, it, expect, vi } from 'vitest'

// React.cache only memoizes inside a server render; spy on it to prove the
// request loader is wrapped, and control the server client.
const cacheSpy = vi.hoisted(() => vi.fn(<T,>(fn: T) => fn))
vi.mock('react', async orig => ({ ...(await orig<typeof import('react')>()), cache: cacheSpy }))
const createServerClient = vi.hoisted(() => vi.fn())
vi.mock('@iskotify/utils', () => ({ createServerClient }))

import { getNavBadges, loadNavBadges, NAV_BADGE_QUERIES, type NavBadgesDb } from '../navBadges'
import { allNavHrefs } from '@/lib/nav/adminNav'

type Filter = { table: string; col?: string; val?: unknown }

// A fake PostgREST builder: records the filter, resolves a head count per table.
function fakeDb(counts: Record<string, number | 'error' | 'throw'>): NavBadgesDb & { calls: Filter[] } {
  const calls: Filter[] = []
  const db = {
    calls,
    from(table: string) {
      const f: Filter = { table }
      calls.push(f)
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => { f.col = col; f.val = val; return builder },
        then: (resolve: (r: unknown) => void, reject: (e: unknown) => void) => {
          const c = counts[table]
          if (c === 'throw') return reject(new Error('boom'))
          return resolve(c === 'error' || c === undefined ? { count: null, error: { message: 'x' } } : { count: c, error: null })
        },
      }
      return builder
    },
  }
  return db as unknown as NavBadgesDb & { calls: Filter[] }
}

describe('getNavBadges', () => {
  it('only badges destinations that exist in the sidebar', () => {
    const hrefs = new Set(allNavHrefs())
    for (const q of NAV_BADGE_QUERIES) expect(hrefs.has(q.href)).toBe(true)
  })

  it('uses only cheap head counts (no row scans like the distractor review queue)', () => {
    expect(NAV_BADGE_QUERIES.map(q => q.href)).not.toContain('/admin/upcat/review-queue')
  })

  it('maps each open queue to its sidebar item', async () => {
    const db = fakeDb({ question_reports: 3, app_bug_reports: 0, app_feedback: 12, listing_date_contributions: 1, flashcard_topics: 4 })
    const badges = await getNavBadges(db)
    expect(badges).toEqual({
      '/admin/reports': 3,
      '/admin/app-reports': 0,
      '/admin/feedback': 12,
      '/admin/date-contributions': 1,
      '/admin/flashcards/drafts': 4,
    })
    expect(db.calls).toContainEqual({ table: 'question_reports', col: 'status', val: 'new' })
    expect(db.calls).toContainEqual({ table: 'listing_date_contributions', col: 'status', val: 'pending' })
    expect(db.calls).toContainEqual({ table: 'flashcard_topics', col: 'status', val: 'draft' })
  })

  it('drops a count that failed instead of showing a false zero', async () => {
    const badges = await getNavBadges(fakeDb({ question_reports: 'error', app_feedback: 'throw', app_bug_reports: 2 }))
    expect(badges).not.toHaveProperty('/admin/reports')
    expect(badges).not.toHaveProperty('/admin/feedback')
    expect(badges['/admin/app-reports']).toBe(2)
  })

  it('returns no badges without a database', async () => {
    expect(await getNavBadges(null)).toEqual({})
  })
})

describe('loadNavBadges (per-request loader)', () => {
  it('is wrapped in React cache(), so the five head counts run once per request', () => {
    expect(cacheSpy).toHaveBeenCalledWith(loadNavBadges)
  })

  it('returns no badges when the server client cannot be created', async () => {
    createServerClient.mockImplementationOnce(() => { throw new Error('missing env') })
    expect(await loadNavBadges()).toEqual({})
  })

  it('counts with the server client', async () => {
    createServerClient.mockReturnValueOnce(fakeDb({ app_feedback: 2 }))
    expect((await loadNavBadges())['/admin/feedback']).toBe(2)
  })
})
