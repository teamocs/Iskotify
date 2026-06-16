// Destination-country aggregation for the website Listings page.
//
// Ported verbatim from the mobile app (apps/mobile/utils/careerSlug.ts +
// destinationCountries.ts) so the web "Destinations" tab matches the app's
// "Lists" screen exactly. career_destinations.country carries qualifiers
// ("Canada (PNP/EE)", "Australia (Skilled)", "UAE / Gulf …") that all collapse
// to one career_countries.code — grouping on the raw string would fragment one
// country into several mis-counted cards.

/**
 * Convert a career_destinations.country value to the base-country slug used in
 * career_countries.code. "Australia (Skilled)" → "australia",
 * "Canada (PNP/EE)" → "canada", "Saudi Arabia" → "saudi-arabia".
 */
export function countryCodeFromName(name: string): string {
  const base = (name ?? '').split('(')[0] ?? ''
  const trimmed = base.split('/')[0] ?? ''
  return trimmed
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

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

/**
 * LEFT-joins countries with destinations by countryCodeFromName(dest.country) ===
 * country.code, counting DISTINCT courseIds per country. Orders non-zero counts
 * desc (then name asc); zero-count countries last. Destinations whose code
 * matches no country are ignored.
 */
export function aggregateDestinationCountries(
  countries: CountryInput[],
  destinations: DestinationInput[],
): CountryWithCount[] {
  const courseSets = new Map<string, Set<string>>()
  for (const dest of destinations) {
    if (!dest.country || !dest.courseId) continue
    const code = countryCodeFromName(dest.country)
    if (!code) continue
    let s = courseSets.get(code)
    if (!s) { s = new Set<string>(); courseSets.set(code, s) }
    s.add(dest.courseId)
  }

  const result: CountryWithCount[] = countries.map(c => ({
    code: c.code,
    name: c.name,
    region: c.region,
    courseCount: courseSets.get(c.code)?.size ?? 0,
  }))

  result.sort((a, b) => {
    const aZero = a.courseCount === 0
    const bZero = b.courseCount === 0
    if (aZero !== bZero) return aZero ? 1 : -1
    if (a.courseCount !== b.courseCount) return b.courseCount - a.courseCount
    return a.name.localeCompare(b.name)
  })

  return result
}
