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

export interface SelectRecommendedScholarshipsOpts {
  profile?: StudentProfile
  clusters?: Set<string> | null
  region?: string | null
  /** Clock for date-proximity ordering (rankForDisplay). Deterministic by default. */
  now?: number
  limit?: number
}

/**
 * selectRecommendedScholarships — open/upcoming scholarships ranked exactly like
 * the Lists screen's scholarships tab (rankForDisplay: eligibility → course-cluster
 * match → deadline proximity), each carrying its matchScholarship eligibility
 * status for the MatchPill. Capped to `limit` (default 6).
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
  return ranked.slice(0, limit).map(listing => ({
    listing,
    status: matchScholarship(toMatchInput(listing), opts.profile ?? {}).status,
  }))
}
