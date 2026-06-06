type IslandGroup = 'luzon' | 'visayas' | 'mindanao'

const CAMPUS_ISLAND: Record<string, IslandGroup> = {
  'UP Diliman': 'luzon',
  'UP Manila': 'luzon',
  'UP Los Baños': 'luzon',
  'UP Baguio': 'luzon',
  'UP Open University': 'luzon',
  'UP Visayas': 'visayas',
  'UP Cebu': 'visayas',
  'UP Mindanao': 'mindanao',
}

// Region strings → island group. Matched via substring keywords (case-insensitive).
const REGION_PATTERNS: Array<[RegExp, IslandGroup]> = [
  [/NCR|Metro Manila|Region\s*I\b|Region\s*II\b|Region\s*III\b|Region\s*IV|Region\s*V\b|Ilocos|Cagayan|Central Luzon|CALABARZON|MIMAROPA|Bicol|CAR|Cordillera/i, 'luzon'],
  [/Region\s*VI\b|Region\s*VII\b|Region\s*VIII\b|Western Visayas|Central Visayas|Eastern Visayas/i, 'visayas'],
  [/Region\s*IX\b|Region\s*X\b|Region\s*XI\b|Region\s*XII\b|Region\s*XIII\b|Zamboanga|Northern Mindanao|Davao|SOCCSKSARGEN|Caraga|BARMM/i, 'mindanao'],
]

function resolveRegionIsland(region: string): IslandGroup | null {
  for (const [pattern, island] of REGION_PATTERNS) {
    if (pattern.test(region)) return island
  }
  return null
}

// --- computeHsGwa ---
export function computeHsGwa(
  grades: { g8?: number | null; g9?: number | null; g10?: number | null; g11?: number | null },
): number | null {
  const values = [grades.g8, grades.g9, grades.g10, grades.g11].filter(
    (v): v is number => v != null && isFinite(v),
  )
  if (values.length === 0) return null
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

// --- validateGwa ---
export function validateGwa(n: number): number | null {
  if (!isFinite(n) || n < 0 || n > 100) return null
  return n
}

// --- isTargetCampusFar ---
export function isTargetCampusFar(campus?: string, region?: string): boolean {
  if (!campus || !region) return false
  const campusIsland = CAMPUS_ISLAND[campus] ?? null
  const regionIsland = resolveRegionIsland(region)
  if (!campusIsland || !regionIsland) return false
  return campusIsland !== regionIsland
}
