// Canonicalize the many free-text Philippine region spellings found across the
// schools / tertiary_schools tables into one label, so the user's school region
// can be compared against each university's region. Mirrors the admin importer's
// canonicalizeRegion (apps/admin/lib/csv/cleaners.ts).

const REGION_MAP: Record<string, string> = {}
function reg(canon: string, ...aliases: string[]) {
  REGION_MAP[canon.toLowerCase()] = canon
  for (const a of aliases) REGION_MAP[a.toLowerCase()] = canon
}

reg('NCR', 'National Capital Region', 'Metro Manila', 'Metropolitan Manila')
reg('CAR', 'Cordillera Administrative Region')
reg('Region I (Ilocos)', 'Region I', 'Ilocos', 'Ilocos Region', 'I')
reg('Region II (Cagayan Valley)', 'Region II', 'Cagayan Valley', 'II')
reg('Region III (Central Luzon)', 'Region III', 'Central Luzon', 'III')
reg('Region IV-A (CALABARZON)', 'Region IV-A', 'CALABARZON', 'IV-A', '4A', 'Region 4-A', 'IVA')
reg('Region IV-B (MIMAROPA)', 'Region IV-B', 'MIMAROPA', 'IV-B', '4B', 'IVB')
reg('Region V (Bicol)', 'Region V', 'Bicol', 'Bicol Region', 'V')
reg('Region VI (Western Visayas)', 'Region VI', 'Western Visayas', 'VI')
reg('Region VII (Central Visayas)', 'Region VII', 'Central Visayas', 'VII')
reg('Region VIII (Eastern Visayas)', 'Region VIII', 'Eastern Visayas', 'VIII')
reg('Region IX (Zamboanga Peninsula)', 'Region IX', 'Zamboanga Peninsula', 'IX')
reg('Region X (Northern Mindanao)', 'Region X', 'Northern Mindanao', 'X')
reg('Region XI (Davao)', 'Region XI', 'Davao Region', 'Davao', 'XI')
reg('Region XII (SOCCSKSARGEN)', 'Region XII', 'SOCCSKSARGEN', 'XII')
reg('Region XIII (Caraga)', 'Region XIII', 'Caraga', 'XIII')
reg('BARMM', 'Bangsamoro', 'Bangsamoro Autonomous Region in Muslim Mindanao', 'ARMM')

export function canonicalizeRegion(raw: string | null | undefined): string {
  const key = (raw ?? '').trim().toLowerCase()
  if (!key) return ''
  return REGION_MAP[key] ?? (raw ?? '').trim()
}

/** True when the region canonicalizes to the National Capital Region. */
export function isNcr(raw: string | null | undefined): boolean {
  return canonicalizeRegion(raw) === 'NCR'
}
