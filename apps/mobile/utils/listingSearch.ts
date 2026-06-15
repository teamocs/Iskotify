// Offline "smart-ish" keyword + intent search over exam/scholarship listings.
// This is the always-on base layer of the hybrid search: it runs instantly on every
// keystroke and is the fallback when the AI layers (Gemini / on-device LLM) are
// unavailable. Pure + dependency-light so it is easy to unit-test.

import { canonicalizeRegion } from './region'
import { matchScholarship, type MatchInput, type MatchStatus, type StudentProfile } from './scholarshipMatch'

export interface SearchableListing {
  id: string
  slug: string
  title: string
  type: string // 'exam' | 'scholarship'
  region?: string | null
  provider?: string | null
  province?: string | null
  incomeCeiling?: number | null
  isVerified?: boolean | null
}

export interface SearchIntent {
  wantsExam: boolean
  wantsScholarship: boolean
  nearMe: boolean
  lowIncome: boolean
  verifiedOnly: boolean
}

const STOP = new Set([
  'the', 'a', 'an', 'for', 'of', 'in', 'on', 'at', 'near', 'me', 'my', 'i', 'to', 'and',
  'or', 'show', 'find', 'want', 'looking', 'list', 'give', 'please', 'with', 'that', 'is',
  'are', 'can', 'about', 'any', 'all', 'some', 'best', 'top', 'good', 'this',
])

// Words that signal intent but shouldn't also count as title-match tokens.
const INTENT_WORDS = new Set([
  'exam', 'exams', 'entrance', 'test', 'tests', 'admission', 'cet', 'college',
  'scholarship', 'scholarships', 'grant', 'grants', 'financial', 'aid', 'tuition',
  'free', 'libre', 'cheap', 'affordable', 'lowincome', 'low', 'income', 'poor',
  'verified', 'legit',
])

export function tokenize(s: string): string[] {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
}

export function parseIntent(query: string): SearchIntent {
  const q = ` ${query.toLowerCase()} `
  const has = (...words: string[]) => words.some(w => q.includes(w))
  return {
    wantsExam: has('exam', 'entrance', 'admission', 'cet', ' test'),
    wantsScholarship: has('scholar', 'grant', 'financial aid', 'tuition', 'iskolar'),
    nearMe: has('near me', 'malapit', 'near my', 'in my region', 'sa amin'),
    lowIncome: has('free', 'libre', 'cheap', 'affordable', 'low income', 'low-income', 'poor', 'no fee'),
    verifiedOnly: has('verified', 'legit', 'official'),
  }
}

/** Content tokens = query tokens minus stopwords and pure intent words. */
function contentTokens(query: string): string[] {
  return tokenize(query).filter(tk => !STOP.has(tk) && !INTENT_WORDS.has(tk))
}

export function scoreListing(
  l: SearchableListing,
  contentTks: string[],
  intent: SearchIntent,
  userRegion: string | null | undefined,
): number {
  let score = 0
  const title = (l.title ?? '').toLowerCase()
  const provider = (l.provider ?? '').toLowerCase()
  const region = (l.region ?? '').toLowerCase()
  const province = (l.province ?? '').toLowerCase()
  const uReg = canonicalizeRegion(userRegion ?? '').toLowerCase()
  const lReg = canonicalizeRegion(l.region ?? '').toLowerCase()

  // Token matches (title weighted highest)
  for (const tk of contentTks) {
    if (title.includes(tk)) score += title.startsWith(tk) ? 6 : 4
    if (provider.includes(tk)) score += 3
    if (region.includes(tk) || province.includes(tk)) score += 3
  }

  // Type intent
  if (intent.wantsScholarship && l.type === 'scholarship') score += 5
  if (intent.wantsExam && l.type === 'exam') score += 5
  // Penalize the opposite type only when the intent is explicit
  if (intent.wantsScholarship && !intent.wantsExam && l.type === 'exam') score -= 4
  if (intent.wantsExam && !intent.wantsScholarship && l.type === 'scholarship') score -= 4

  // Region intent
  if (intent.nearMe && uReg && lReg && uReg === lReg) score += 6

  // Cost intent (scholarships only) — lower/no income ceiling = more inclusive = higher.
  if (intent.lowIncome && l.type === 'scholarship') {
    score += 3
    if (l.incomeCeiling == null || l.incomeCeiling <= 150000) score += 4
    else if (l.incomeCeiling <= 300000) score += 2
    else score += 1
  }

  // Verified intent
  if (intent.verifiedOnly) {
    if (l.isVerified) score += 4
    else score -= 5
  } else if (l.isVerified) {
    score += 0.5 // gentle tiebreak toward verified
  }

  return score
}

/**
 * Rank listings for a natural-language query. Returns all listings (unfiltered) when
 * the query is blank; otherwise the matching listings sorted by relevance.
 */
export function searchListings(
  listings: SearchableListing[],
  query: string,
  userRegion?: string | null,
): SearchableListing[] {
  const q = (query ?? '').trim()
  if (!q) return listings
  const intent = parseIntent(q)
  const tks = contentTokens(q)
  // If the query is purely intent words (e.g. "free scholarships"), there are no
  // content tokens — rank by intent alone over the whole set.
  const scored = listings.map(l => ({ l, score: scoreListing(l, tks, intent, userRegion) }))
  const anyPositive = scored.some(x => x.score > 0)
  return scored
    .filter(x => (anyPositive ? x.score > 0 : true))
    .sort((a, b) => b.score - a.score)
    .map(x => x.l)
}

// ── Profile-first display ranking ──────────────────────────────────────────────
// Applied by the screen to the FINAL displayed array (AI-ranked OR keyword) so the
// same personalization holds regardless of which search tier produced the rows.
// PURE + deterministic: the caller injects `now` (the screen passes Date.now()); the
// incoming array order is treated as the relevance signal and is the final, stable
// tiebreaker — so an AI's semantic order is preserved within equal personalization
// buckets.

/** A listing carrying the optional fields the display ranker reads. Everything is
 *  optional so existing scoreListing/searchListings callers stay source-compatible. */
export interface RankableListing extends SearchableListing {
  examDate?: number | null
  deadline?: number | null
  targetCourses?: string[] | null
  city?: string | null
  scope?: string | null
  gwaRequirement?: number | null
  serviceObligationYears?: number | null
  scholarshipMeta?: string | null
}

export interface RankForDisplayOpts {
  tab: string // 'universities' | 'scholarships' (others returned unchanged)
  query?: string
  profile?: StudentProfile
  clusters?: Set<string> | null
  region?: string | null
  /** Clock for date-proximity ordering. Deterministic by default; the screen passes Date.now(). */
  now?: number
}

const ELIGIBILITY_RANK: Record<MatchStatus, number> = { eligible: 0, maybe: 1, unknown: 2, ineligible: 3 }

/** True when the listing targets one of the student's course clusters (or is open to all). */
function matchesClusters(targetCourses: string[] | null | undefined, clusters: Set<string> | null | undefined): boolean {
  const tc = targetCourses ?? []
  if (tc.some(c => c.toLowerCase() === 'all')) return true
  if (!clusters || clusters.size === 0) return false
  return tc.some(c => clusters.has(c))
}

/** A sortable key for date proximity: soonest *future* date first (smallest key),
 *  then later future dates, then past/none last. Lower = earlier in the list. */
function dateProximityKey(ts: number | null | undefined, now: number): number {
  if (ts == null) return Number.POSITIVE_INFINITY // none → last
  if (ts >= now) return ts - now                  // future → ascending by how soon
  return Number.MAX_VALUE                          // past → after every future date, before none (Infinity)
}

function toMatchInput(l: RankableListing): MatchInput {
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

/**
 * Produce the final display order for the Universities / Scholarships tabs.
 * Returns a new array (input is never mutated). Non uni/scholarship tabs are
 * returned unchanged. Comparison is a stable sort whose absolute final tiebreaker
 * is the incoming index, so the relevance order already encoded by the AI/keyword
 * layer is respected within equal buckets.
 */
export function rankForDisplay<T extends RankableListing>(rows: T[], opts: RankForDisplayOpts): T[] {
  const { tab, profile, clusters, region, now = 0 } = opts
  if (tab !== 'universities' && tab !== 'scholarships') return rows

  // Decorate with the precomputed keys + original index (stable tiebreak).
  const decorated = rows.map((l, index) => {
    const courseMatch = matchesClusters(l.targetCourses, clusters) ? 0 : 1
    if (tab === 'scholarships') {
      const status = matchScholarship(toMatchInput(l), profile ?? {}).status
      return {
        l, index,
        eligibility: ELIGIBILITY_RANK[status],
        courseMatch,
        dateKey: dateProximityKey(l.deadline, now),
      }
    }
    // universities
    const uReg = canonicalizeRegion(region ?? '').toLowerCase()
    const lReg = canonicalizeRegion(l.region ?? '').toLowerCase()
    const regionMatch = uReg && lReg && uReg === lReg ? 0 : 1
    const verified = l.isVerified ? 0 : 1
    return {
      l, index,
      eligibility: 0, // unused for universities
      courseMatch,
      regionMatch,
      dateKey: dateProximityKey(l.examDate, now),
      verified,
    }
  })

  decorated.sort((a, b) => {
    if (tab === 'scholarships') {
      if (a.eligibility !== b.eligibility) return a.eligibility - b.eligibility
      if (a.courseMatch !== b.courseMatch) return a.courseMatch - b.courseMatch
      if (a.dateKey !== b.dateKey) return a.dateKey - b.dateKey
      return a.index - b.index
    }
    // universities
    const au = a as typeof a & { regionMatch: number; verified: number }
    const bu = b as typeof b & { regionMatch: number; verified: number }
    if (au.courseMatch !== bu.courseMatch) return au.courseMatch - bu.courseMatch
    if (au.regionMatch !== bu.regionMatch) return au.regionMatch - bu.regionMatch
    if (au.dateKey !== bu.dateKey) return au.dateKey - bu.dateKey
    if (au.verified !== bu.verified) return au.verified - bu.verified
    return au.index - bu.index
  })

  return decorated.map(d => d.l)
}

/** Reorder a listing array to match an ordered list of ids (from an AI ranker). */
export function reorderByIds<T extends { id: string }>(listings: T[], orderedIds: string[]): T[] {
  const byId = new Map(listings.map(l => [l.id, l]))
  const out: T[] = []
  const seen = new Set<string>()
  for (const id of orderedIds) {
    const l = byId.get(id)
    if (l && !seen.has(id)) { out.push(l); seen.add(id) }
  }
  return out
}
