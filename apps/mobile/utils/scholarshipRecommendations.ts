// Pure helper for Home's RecommendedScholarships section.
// No React, no DB — fully unit-testable.

import { rankForDisplay, type RankableListing } from './listingSearch'
import { matchScholarship, type MatchInput, type MatchStatus, type StudentProfile } from './scholarshipMatch'

export interface ScholarshipListingLike extends RankableListing {
  id: string
  status: string
}

export interface RecommendedScholarship<T> {
  listing: T
  status: MatchStatus
}

export const RECOMMENDED_SCHOLARSHIPS_LIMIT = 6

/** "Open or upcoming only" per the brief — excludes 'closed' (or any other non-live status). */
export function isOpenOrUpcoming(status: string | null | undefined): boolean {
  return status === 'active' || status === 'upcoming'
}

function toMatchInput(l: ScholarshipListingLike): MatchInput {
  let meta: Record<string, unknown> = {}
  try { meta = JSON.parse(l.scholarshipMeta || '{}') } catch { /* ignore */ }
  return {
    scope: (l.scope as MatchInput['scope']) || 'national',
    isVerified: !!l.isVerified,
    incomeCeiling: l.incomeCeiling ?? null,
    gwaRequirement: l.gwaRequirement ?? null,
    serviceObligationYears: l.serviceObligationYears ?? null,
    province: l.province ?? null,
    city: l.city ?? null,
    targetYearLevels: [],
    hucExcluded: !!meta.huc_excluded,
  }
}

/** Minimal shape of a student's focused listing — mirrors hooks/useHomeStats.ts's FocusedListing. */
export interface FocusedListingRef {
  slug: string
  type: string
  priority: number
}

export interface SelectRecommendedScholarshipsOpts {
  profile?: StudentProfile
  clusters?: Set<string> | null
  region?: string | null
  /** Clock for date-proximity ordering (rankForDisplay). Deterministic by default. */
  now?: number
  limit?: number
  /** Scholarships the student has explicitly focused — pinned to the front (in
   *  focus-priority order) so they never silently drop off Home. Entries whose
   *  type isn't 'scholarship', or whose slug isn't among the open/upcoming
   *  candidates (e.g. it since closed), are ignored. */
  focusedListings?: FocusedListingRef[]
}

/**
 * selectRecommendedScholarships — open/upcoming scholarships ranked exactly like
 * the Lists screen's scholarships tab (rankForDisplay: eligibility → course-cluster
 * match → deadline proximity), each carrying its matchScholarship eligibility
 * status for the MatchPill. Capped to `limit` (default 6).
 *
 * Focused scholarships (opts.focusedListings) are pinned first, in focus-priority
 * order, so a scholarship the student explicitly focused always surfaces on Home
 * instead of only appearing when it happens to rank in the top `limit`.
 */
export function selectRecommendedScholarships<T extends ScholarshipListingLike>(
  listings: T[],
  opts: SelectRecommendedScholarshipsOpts = {},
): Array<RecommendedScholarship<T>> {
  const open = listings.filter(l => l.type === 'scholarship' && isOpenOrUpcoming(l.status))
  const ranked = rankForDisplay(open, {
    tab: 'scholarships',
    profile: opts.profile,
    clusters: opts.clusters,
    region: opts.region,
    now: opts.now ?? 0,
  })
  const limit = opts.limit ?? RECOMMENDED_SCHOLARSHIPS_LIMIT

  const bySlug = new Map(open.map(l => [l.slug, l]))
  const pinnedSlugs = (opts.focusedListings ?? [])
    .filter(f => f.type === 'scholarship' && bySlug.has(f.slug))
    .sort((a, b) => a.priority - b.priority)
    .map(f => f.slug)

  const seen = new Set<string>()
  const pinned: T[] = []
  for (const slug of pinnedSlugs) {
    if (seen.has(slug)) continue // dedup: a focused slug listed twice
    seen.add(slug)
    pinned.push(bySlug.get(slug)!)
  }

  const rest = ranked.filter(l => !seen.has(l.slug))
  const finalList = [...pinned, ...rest].slice(0, limit)

  return finalList.map(listing => ({
    listing,
    status: matchScholarship(toMatchInput(listing), opts.profile ?? {}).status,
  }))
}
