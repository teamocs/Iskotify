import type { BadgeSpec } from '../explore/exploreModel'

/**
 * Pure rules shared by the schools directory and the school sheet. No React,
 * no theme.
 */

/**
 * The items of a JSON text[] column. Some source rows (courses_offered and
 * scholarships_offered) store MANY items as ONE separator-joined string
 * (["BS Nursing, BS Biology"]): split on comma, semicolon, newline and pipe,
 * trim, drop empties and de-dupe (case-insensitive). '/' is intentionally not
 * a separator ("UniFAST / RA 10931" is one name).
 */
export function splitListField(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    const out: string[] = []
    for (const entry of parsed.map(String)) {
      for (const part of entry.split(/[,;\n|]+/)) {
        const item = part.trim()
        if (!item) continue
        const key = item.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(item)
      }
    }
    return out
  } catch {
    return []
  }
}

/** Data confidence as a labelled badge (honest about uncertainty). */
export function confidenceBadge(level: string | null | undefined): BadgeSpec | null {
  switch ((level ?? '').toUpperCase()) {
    case 'HIGH': return { label: 'High confidence', tone: 'success' }
    case 'MEDIUM': return { label: 'Medium confidence', tone: 'warning' }
    case 'LOW':
    case 'VERY LOW': return { label: 'Low confidence', tone: 'neutral' }
    default: return null
  }
}

export interface SchoolRowFacts {
  city?: string | null
  province?: string | null
  region?: string | null
  entranceExamAcronym?: string | null
  coursesOffered?: string | null
}

/**
 * A directory row's subtitle, from what the catalog holds: the city (else the
 * province, else the region), the entrance exam, the number of courses. Parts
 * the data lacks are left out, never guessed.
 */
export function schoolRowSubtitle(s: SchoolRowFacts): string {
  const place = s.city || s.province || s.region || null
  const courses = splitListField(s.coursesOffered).length
  return [
    place,
    s.entranceExamAcronym || null,
    courses > 0 ? `${courses} course${courses === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ')
}

/** The school filters a student can set (the sheet behind Explore's Filters button). */
export interface SchoolFilters {
  freeTuitionOnly: boolean
  type: string | null
  region: string | null
}

export const NO_SCHOOL_FILTERS: SchoolFilters = { freeTuitionOnly: false, type: null, region: null }

/** How many filters are on (for the button's spoken name and the summary row). */
export function activeFilterCount(f: SchoolFilters): number {
  return (f.freeTuitionOnly ? 1 : 0) + (f.type ? 1 : 0) + (f.region ? 1 : 0)
}

/** The filters that are on, in words: "Free tuition · SUC · NCR". */
export function filterSummary(f: SchoolFilters): string {
  return [f.freeTuitionOnly ? 'Free tuition' : null, f.type, f.region].filter(Boolean).join(' · ')
}
