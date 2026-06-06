export type IncomeBracket = '<=100k' | '100k-300k' | '300k-600k' | '600k-1.2M' | '>1.2M' | 'unknown'
export const INCOME_BANDS: Record<Exclude<IncomeBracket, 'unknown'>, [number, number]> = {
  '<=100k': [0, 100000],
  '100k-300k': [100001, 300000],
  '300k-600k': [300001, 600000],
  '600k-1.2M': [600001, 1200000],
  '>1.2M': [1200001, Number.POSITIVE_INFINITY],
}

const HUC = new Set(['Cebu City','Lapu-Lapu City','Mandaue City','Davao City','Iloilo City','Bacolod City','Cagayan de Oro City','Zamboanga City','General Santos City','Angeles City','Olongapo City','Baguio City','Butuan City','Iligan City','Tacloban City','Puerto Princesa City','Lucena City','Naga City','Cotabato City'])

export interface StudentProfile { gradeLevel?: number; incomeBracket?: IncomeBracket; gwa?: number; province?: string | null; city?: string | null }
export interface MatchInput {
  scope: 'national'|'regional'|'provincial'|'city'|'school'
  isVerified: boolean
  incomeCeiling: number | null
  gwaRequirement: number | null
  serviceObligationYears: number | null
  province: string | null
  city: string | null
  targetYearLevels: string[]
  hucExcluded: boolean
}
export type MatchStatus = 'eligible' | 'maybe' | 'ineligible' | 'unknown'
export interface MatchResult { status: MatchStatus; reasons: string[]; warnings: string[] }

const RANK: Record<MatchStatus, number> = { ineligible: 3, maybe: 2, eligible: 1, unknown: 0 }

export function matchScholarship(listing: MatchInput, student: StudentProfile): MatchResult {
  const reasons: string[] = []
  const warnings: string[] = []
  const states: MatchStatus[] = []
  let hadCriterion = false

  if (listing.incomeCeiling != null) {
    hadCriterion = true
    const C = listing.incomeCeiling
    if (!student.incomeBracket || student.incomeBracket === 'unknown') {
      states.push('maybe'); warnings.push(`Income-based (cap ~₱${C.toLocaleString()}/yr) — confirm you qualify.`)
    } else {
      const [lo, hi] = INCOME_BANDS[student.incomeBracket]
      if (lo > C) { states.push('ineligible'); reasons.push(`Your income likely exceeds the ₱${C.toLocaleString()}/yr ceiling.`) }
      else if (hi <= C) { states.push('eligible'); reasons.push(`Within the ₱${C.toLocaleString()}/yr income ceiling.`) }
      else { states.push('maybe'); warnings.push(`Your income is near the ₱${C.toLocaleString()}/yr ceiling — confirm.`) }
    }
  }

  if (listing.gwaRequirement != null) {
    hadCriterion = true
    const R = listing.gwaRequirement
    if (student.gwa == null) { states.push('maybe'); warnings.push(`Requires GWA ≥ ${R}% — add your GWA to check.`) }
    else if (student.gwa >= R) { states.push('eligible'); reasons.push(`Your GWA meets the ≥ ${R}% requirement.`) }
    else if (student.gwa >= R - 2) { states.push('maybe'); warnings.push(`Your GWA is close to the ${R}% cutoff.`) }
    else { states.push('ineligible'); reasons.push(`Requires GWA ≥ ${R}% (yours is ${student.gwa}%).`) }
  }

  if (listing.scope === 'provincial' || listing.scope === 'city') {
    hadCriterion = true
    if (listing.province && student.province) {
      if (student.province.trim().toLowerCase() === listing.province.trim().toLowerCase()) {
        states.push('eligible'); reasons.push(`You are a resident of ${listing.province}.`)
        if (listing.hucExcluded && student.city && HUC.has(student.city.trim())) {
          warnings.push(`${student.city} is a highly urbanized city and may be excluded from this provincial program.`)
        }
      } else { states.push('ineligible'); reasons.push(`For residents of ${listing.province}.`) }
    } else if (listing.province && !student.province) {
      states.push('maybe'); warnings.push(`For residents of ${listing.province} — set your province to confirm.`)
    }
  }

  if (listing.targetYearLevels && listing.targetYearLevels.length > 0 && student.gradeLevel != null) {
    const wantsG12 = listing.targetYearLevels.some(y => /12|freshman|graduat/i.test(y))
    if (wantsG12 && student.gradeLevel < 11) {
      warnings.push(`Usually for Grade 12 / incoming freshmen — you are in Grade ${student.gradeLevel}.`)
    }
  }

  if (listing.serviceObligationYears && listing.serviceObligationYears > 0) {
    warnings.push(`Requires ${listing.serviceObligationYears} year(s) of service after graduation.`)
  }
  if (!listing.isVerified) warnings.push('Unverified — confirm details on the official site.')

  let status: MatchStatus = 'unknown'
  if (hadCriterion) {
    status = states.reduce<MatchStatus>((acc, s) => (RANK[s] > RANK[acc] ? s : acc), 'eligible')
  }
  return { status, reasons, warnings }
}
