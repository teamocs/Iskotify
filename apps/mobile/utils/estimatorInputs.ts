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

// Province name → island group (compact map covering main PH provinces).
const PROVINCE_ISLAND: Record<string, IslandGroup> = {
  // ── Luzon ──────────────────────────────────────────────────────────────────
  // NCR / Metro Manila
  'NCR': 'luzon',
  'Metro Manila': 'luzon',
  // Ilocos Region
  'Ilocos Norte': 'luzon',
  'Ilocos Sur': 'luzon',
  'La Union': 'luzon',
  'Pangasinan': 'luzon',
  // Cagayan Valley
  'Batanes': 'luzon',
  'Cagayan': 'luzon',
  'Isabela': 'luzon',
  'Nueva Vizcaya': 'luzon',
  'Quirino': 'luzon',
  // Central Luzon
  'Aurora': 'luzon',
  'Bataan': 'luzon',
  'Bulacan': 'luzon',
  'Nueva Ecija': 'luzon',
  'Pampanga': 'luzon',
  'Tarlac': 'luzon',
  'Zambales': 'luzon',
  // CALABARZON
  'Batangas': 'luzon',
  'Cavite': 'luzon',
  'Laguna': 'luzon',
  'Quezon': 'luzon',
  'Rizal': 'luzon',
  // MIMAROPA
  'Marinduque': 'luzon',
  'Occidental Mindoro': 'luzon',
  'Oriental Mindoro': 'luzon',
  'Palawan': 'luzon',
  'Romblon': 'luzon',
  // Bicol
  'Albay': 'luzon',
  'Camarines Norte': 'luzon',
  'Camarines Sur': 'luzon',
  'Catanduanes': 'luzon',
  'Masbate': 'luzon',
  'Sorsogon': 'luzon',
  // CAR
  'Abra': 'luzon',
  'Apayao': 'luzon',
  'Benguet': 'luzon',
  'Ifugao': 'luzon',
  'Kalinga': 'luzon',
  'Mountain Province': 'luzon',
  // ── Visayas ────────────────────────────────────────────────────────────────
  // Western Visayas
  'Aklan': 'visayas',
  'Antique': 'visayas',
  'Capiz': 'visayas',
  'Guimaras': 'visayas',
  'Iloilo': 'visayas',
  'Negros Occidental': 'visayas',
  // Central Visayas
  'Bohol': 'visayas',
  'Cebu': 'visayas',
  'Negros Oriental': 'visayas',
  'Siquijor': 'visayas',
  // Eastern Visayas
  'Biliran': 'visayas',
  'Eastern Samar': 'visayas',
  'Leyte': 'visayas',
  'Northern Samar': 'visayas',
  'Samar': 'visayas',
  'Southern Leyte': 'visayas',
  // ── Mindanao ───────────────────────────────────────────────────────────────
  // Zamboanga Peninsula
  'Zamboanga del Norte': 'mindanao',
  'Zamboanga del Sur': 'mindanao',
  'Zamboanga Sibugay': 'mindanao',
  // Northern Mindanao
  'Bukidnon': 'mindanao',
  'Camiguin': 'mindanao',
  'Lanao del Norte': 'mindanao',
  'Misamis Occidental': 'mindanao',
  'Misamis Oriental': 'mindanao',
  // Davao Region
  'Davao de Oro': 'mindanao',
  'Davao del Norte': 'mindanao',
  'Davao del Sur': 'mindanao',
  'Davao Occidental': 'mindanao',
  'Davao Oriental': 'mindanao',
  // SOCCSKSARGEN
  'Cotabato': 'mindanao',
  'Sarangani': 'mindanao',
  'South Cotabato': 'mindanao',
  'Sultan Kudarat': 'mindanao',
  // Caraga
  'Agusan del Norte': 'mindanao',
  'Agusan del Sur': 'mindanao',
  'Dinagat Islands': 'mindanao',
  'Surigao del Norte': 'mindanao',
  'Surigao del Sur': 'mindanao',
  // BARMM
  'Basilan': 'mindanao',
  'Lanao del Sur': 'mindanao',
  'Maguindanao del Norte': 'mindanao',
  'Maguindanao del Sur': 'mindanao',
  'Sulu': 'mindanao',
  'Tawi-Tawi': 'mindanao',
}

function resolveRegionIsland(region: string): IslandGroup | null {
  // 1. Exact province lookup (case-insensitive key match)
  const trimmed = region.trim()
  const provinceLower = trimmed.toLowerCase()
  for (const [key, island] of Object.entries(PROVINCE_ISLAND)) {
    if (key.toLowerCase() === provinceLower) return island
  }
  // 2. Region-string / keyword patterns
  for (const [pattern, island] of REGION_PATTERNS) {
    if (pattern.test(trimmed)) return island
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
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  return Math.round(avg * 100) / 100
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
