/**
 * Convert a career_destinations.country value (which may carry qualifiers
 * like "Australia (Skilled)" or "Canada (PNP/EE)") to the base-country slug
 * used in career_countries.code.
 *
 * Examples:
 *   "Australia (Skilled)" → "australia"
 *   "Canada (PNP/EE)"    → "canada"
 *   "UAE"                → "uae"
 *   "Saudi Arabia"       → "saudi-arabia"
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
