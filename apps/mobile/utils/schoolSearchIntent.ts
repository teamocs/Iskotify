// Light intent parse for the schools/universities search box. On top of the
// plain name/acronym substring search, the box should also understand a
// handful of common query shapes:
//   "free tuition universities in bicol"  → region=Bicol, freeTuitionOnly=true
//   "nursing schools in bicol"            → region=Bicol, nameQuery="nursing"
//   "Mapua"                               → nameQuery="mapua" (plain name search)
//
// Pure + dependency-light so it is easy to unit-test (see
// __tests__/schoolSearchIntent.test.ts).

import { findRegionMatch } from './region'

export interface SchoolSearchIntent {
  /** Canonical region detected in the query, or null when none is mentioned. */
  region: string | null
  /** True when the query mentions "free" / "free tuition" / "libre". */
  freeTuitionOnly: boolean
  /** Leftover query text (lowercased, space-joined) for name/acronym substring
   *  matching, with the detected region words and generic filler/intent words
   *  (university, school, free, tuition, in, ...) stripped out. Empty when
   *  nothing discriminating remains — callers should skip the name filter
   *  entirely in that case rather than matching against an empty string. */
  nameQuery: string
}

// Generic words that carry search *intent* (or are pure filler) rather than
// being part of a specific school's name/acronym. Stripping these before the
// name/acronym substring match keeps a query like "free tuition universities
// in bicol" from requiring the literal (never-matching) substring "universities
// in" against every school name.
const FILLER = new Set([
  'the', 'a', 'an', 'for', 'of', 'in', 'on', 'at', 'near', 'me', 'my', 'to',
  'and', 'or', 'show', 'find', 'list', 'with', 'that', 'is', 'are', 'please',
  'universities', 'university', 'college', 'colleges', 'school', 'schools',
  'free', 'tuition', 'libre',
])

function tokenize(s: string): string[] {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
}

export function parseSchoolSearchIntent(query: string): SchoolSearchIntent {
  const raw = (query ?? '').trim()
  if (!raw) return { region: null, freeTuitionOnly: false, nameQuery: '' }

  const lower = raw.toLowerCase()
  const freeTuitionOnly = /\bfree\b/.test(lower) || /\blibre\b/.test(lower)

  const match = findRegionMatch(raw)
  const region = match?.region ?? null
  const aliasWords = match ? tokenize(match.alias) : []

  const exclude = new Set([...FILLER, ...aliasWords])
  const nameQuery = tokenize(raw).filter(tk => !exclude.has(tk)).join(' ')

  return { region, freeTuitionOnly, nameQuery }
}
