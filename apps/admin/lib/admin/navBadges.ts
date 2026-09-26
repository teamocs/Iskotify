/**
 * Open-queue counts for the sidebar: href -> count. Head-only exact counts, so
 * each is one indexed COUNT with no rows returned. The distractor review queue
 * is left out on purpose: its count needs a 2,000-row scan (see inboxCounts),
 * which is fine once on Home but not on every admin page load.
 *
 * A failed count is omitted rather than reported as 0: no badge is honest, a
 * false "0" is not.
 */

import { cache } from 'react'
import { createServerClient } from '@iskotify/utils'

export type NavBadges = Record<string, number>

interface CountResult { count?: number | null; error?: { message: string } | null }
interface Builder extends PromiseLike<CountResult> {
  select(columns: string, opts: { count: 'exact'; head: true }): Builder
  eq(column: string, value: unknown): Builder
}
export interface NavBadgesDb { from(table: string): Builder }

export const NAV_BADGE_QUERIES: { href: string; table: string; status: string }[] = [
  { href: '/admin/flashcards/drafts', table: 'flashcard_topics', status: 'draft' },
  { href: '/admin/reports', table: 'question_reports', status: 'new' },
  { href: '/admin/app-reports', table: 'app_bug_reports', status: 'new' },
  { href: '/admin/feedback', table: 'app_feedback', status: 'new' },
  { href: '/admin/date-contributions', table: 'listing_date_contributions', status: 'pending' },
]

export async function getNavBadges(db: NavBadgesDb | null): Promise<NavBadges> {
  if (!db) return {}
  const results = await Promise.all(
    NAV_BADGE_QUERIES.map(async q => {
      try {
        const { count, error } = await db.from(q.table).select('*', { count: 'exact', head: true }).eq('status', q.status)
        return error || typeof count !== 'number' ? null : ([q.href, count] as const)
      } catch {
        return null
      }
    }),
  )
  return Object.fromEntries(results.filter((r): r is readonly [string, number] => r !== null))
}

/**
 * The layout's per-request loader. React cache() dedupes it within one server
 * render, so any number of callers share one set of five head counts.
 * Never rejects: a missing server env means no badges, not a broken shell.
 */
export const loadNavBadges = cache(async function loadNavBadges(): Promise<NavBadges> {
  let db: NavBadgesDb
  try {
    db = createServerClient() as unknown as NavBadgesDb
  } catch {
    return {}
  }
  return getNavBadges(db)
})
