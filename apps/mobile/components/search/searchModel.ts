import { contentTokens, parseIntent, scoreListing } from '../../utils/listingSearch'
import { parseSchoolSearchIntent } from '../../utils/schoolSearchIntent'
import { passesFreeTuitionFilter } from '../../utils/freeTuitionFilter'
import { fmtShortDate } from '../explore/exploreModel'

// ---------------------------------------------------------------------------
// Federated search over the local catalog: schools, scholarships and entrance
// exams. Pure and synchronous: it reads rows the screen already loaded from
// the on-device database, so it answers on every keystroke and offline.
// ---------------------------------------------------------------------------

export interface SearchListing {
  id: string
  slug: string
  title: string
  type: string // 'exam' | 'scholarship'
  region: string | null
  provider: string | null
  province: string | null
  incomeCeiling: number | null
  isVerified: boolean | null
  examDate: number | null
  deadline: number | null
  /** The listing's official site, as synced. Empty when the catalog has none. */
  externalUrl: string | null
}

export interface SearchSchool {
  id: string
  name: string
  acronym: string | null
  region: string | null
  province: string | null
  isSuc: boolean
  isLuc: boolean
  freeTuition: boolean | null
}

export interface SearchResults {
  schools: SearchSchool[]
  scholarships: SearchListing[]
  exams: SearchListing[]
}

export const RESULT_LIMIT = { schools: 8, scholarships: 10, exams: 6 } as const

export const EMPTY_RESULTS: SearchResults = { schools: [], scholarships: [], exams: [] }

export function resultCount(r: SearchResults): number {
  return r.schools.length + r.scholarships.length + r.exams.length
}

/**
 * Listings that actually match: a positive score when the query has content
 * words, or an intent-only query ("free scholarships") ranked by intent.
 * Unlike Explore's searchListings, an unmatched query returns nothing rather
 * than the whole catalog, so the screen can say so.
 */
function matchListings(listings: SearchListing[], query: string, userRegion: string): SearchListing[] {
  const intent = parseIntent(query)
  const tks = contentTokens(query)
  // With content words, a listing must contain one of them: region and
  // verified bonuses alone never make a match.
  const hasWord = (l: SearchListing) => {
    if (tks.length === 0) return true
    const hay = [l.title, l.provider, l.region, l.province].filter(Boolean).join(' ').toLowerCase()
    return tks.some(tk => hay.includes(tk))
  }
  const scored = listings
    .filter(hasWord)
    .map(l => ({ l, score: scoreListing(l, tks, intent, userRegion) }))
    .filter(x => x.score > 0)
  return scored.sort((a, b) => b.score - a.score).map(x => x.l)
}

function matchSchools(schools: SearchSchool[], query: string): SearchSchool[] {
  const intent = parseSchoolSearchIntent(query)
  const nameQ = intent.nameQuery
  // A query with no school words at all ("scholarship") names no school.
  if (!nameQ && !intent.region && !intent.freeTuitionOnly) return []
  const out = schools.filter(s => {
    if (nameQ && !(s.name.toLowerCase().includes(nameQ) || (s.acronym ?? '').toLowerCase().includes(nameQ))) return false
    if (intent.region && s.region !== intent.region) return false
    if (intent.freeTuitionOnly && !passesFreeTuitionFilter(s, s.freeTuition)) return false
    return true
  })
  // Name-starts and acronym hits first, then shorter names.
  const rank = (s: SearchSchool) => {
    if (!nameQ) return 1
    if ((s.acronym ?? '').toLowerCase() === nameQ) return 0
    return s.name.toLowerCase().startsWith(nameQ) ? 0 : 1
  }
  return out.sort((a, b) => rank(a) - rank(b) || a.name.length - b.name.length)
}

/** Every matching school, scholarship and exam for `query`, capped per group. */
export function searchCatalog(
  query: string,
  data: { schools: SearchSchool[]; listings: SearchListing[] },
  userRegion = '',
): SearchResults {
  const q = query.trim()
  if (q.length < 2) return EMPTY_RESULTS
  const listings = matchListings(data.listings.filter(l => l.slug !== 'general-cet'), q, userRegion)
  return {
    schools: matchSchools(data.schools, q).slice(0, RESULT_LIMIT.schools),
    scholarships: listings.filter(l => l.type === 'scholarship').slice(0, RESULT_LIMIT.scholarships),
    exams: listings.filter(l => l.type === 'exam').slice(0, RESULT_LIMIT.exams),
  }
}

/**
 * The official source to name on a result: the hostname of the synced
 * external URL ("ched.gov.ph"). Null when there is no URL or it does not
 * parse; a source is never guessed from the title or provider.
 */
export function officialSource(url: string | null | undefined): string | null {
  const raw = (url ?? '').trim()
  if (!/^https?:\/\//i.test(raw)) return null
  const m = /^https?:\/\/([^/?#:]+)/i.exec(raw)
  const host = m?.[1]?.toLowerCase().replace(/^www\./, '') ?? ''
  return host.includes('.') ? host : null
}

/** One line of facts for a scholarship or exam result: date(s) · source. */
export function listingMeta(l: SearchListing): string {
  const parts: string[] = []
  if (l.type === 'exam') parts.push(l.examDate ? `Exam ${fmtShortDate(l.examDate)}` : 'Exam date TBA')
  if (l.deadline) parts.push(`Apply by ${fmtShortDate(l.deadline)}`)
  const source = officialSource(l.externalUrl)
  if (source) parts.push(`Official site: ${source}`)
  return parts.join(' · ')
}

export function schoolMeta(s: SearchSchool): string {
  return [s.acronym, s.province ?? s.region].filter(Boolean).join(' · ')
}

/**
 * Suggestions while the field is empty: the next few dated listings
 * (deadline or exam date still ahead), soonest first.
 */
export function upcomingListings(listings: SearchListing[], now: number = Date.now(), limit = 3): SearchListing[] {
  const when = (l: SearchListing) => {
    const dates = [l.deadline, l.type === 'exam' ? l.examDate : null].filter((d): d is number => d != null && d >= now)
    return dates.length ? Math.min(...dates) : null
  }
  return listings
    .filter(l => l.slug !== 'general-cet')
    .map(l => ({ l, at: when(l) }))
    .filter((x): x is { l: SearchListing; at: number } => x.at != null)
    .sort((a, b) => a.at - b.at)
    .slice(0, limit)
    .map(x => x.l)
}
