/**
 * utils/destinationCountries.ts
 *
 * Pure aggregation helper for the Destinations tab.
 *
 * aggregateDestinationCountries:
 *   - LEFT-joins careerCountries with careerDestinations by countryCodeFromName(dest.country) === country.code
 *   - Counts DISTINCT courseIds per country (a single course in two destination rows = 1)
 *   - Orders: non-zero courseCount desc → then name asc; zero-count countries LAST (still listed, name asc)
 *   - Unknown dest.country values (countryCodeFromName returns a code that matches nothing) are silently ignored
 */

import { countryCodeFromName } from './careerSlug'

export interface CountryInput {
  code: string
  name: string
  region: string
}

export interface DestinationInput {
  courseId: string
  country: string
}

export interface CountryWithCount {
  code: string
  name: string
  region: string
  courseCount: number
}

export function aggregateDestinationCountries(
  countries: CountryInput[],
  destinations: DestinationInput[],
): CountryWithCount[] {
  // Build a Map<countryCode, Set<courseId>> from destinations
  const courseSets = new Map<string, Set<string>>()
  for (const dest of destinations) {
    if (!dest.country || !dest.courseId) continue
    const code = countryCodeFromName(dest.country)
    if (!code) continue
    let s = courseSets.get(code)
    if (!s) { s = new Set<string>(); courseSets.set(code, s) }
    s.add(dest.courseId)
  }

  // Map countries to CountryWithCount
  const result: CountryWithCount[] = countries.map(c => ({
    code: c.code,
    name: c.name,
    region: c.region,
    courseCount: courseSets.get(c.code)?.size ?? 0,
  }))

  // Sort: non-zero courseCount desc, then name asc; zero-count LAST (also name asc within zeros)
  result.sort((a, b) => {
    const aZero = a.courseCount === 0
    const bZero = b.courseCount === 0
    if (aZero !== bZero) return aZero ? 1 : -1   // zeros last
    if (a.courseCount !== b.courseCount) return b.courseCount - a.courseCount  // desc by count
    return a.name.localeCompare(b.name)
  })

  return result
}
