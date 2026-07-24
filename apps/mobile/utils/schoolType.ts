// Normalizes the free-text `tertiary_schools.type` column (52+ distinct raw
// strings in production — 'State College (SUC)', 'Private HEI (Jesuit)',
// 'Local Government College', 'Public / State University', ...) into a small
// fixed set of buckets so the schools directory can build sane filter chips
// instead of one chip per raw string.
//
// Pure + dependency-light so it is easy to unit-test (see __tests__/schoolType.test.ts).

export type SchoolTypeBucket = 'SUC' | 'LUC' | 'Private' | 'State College' | 'Other'

export function normalizeSchoolType(raw: string | null | undefined): SchoolTypeBucket {
  const s = (raw ?? '').trim()
  if (!s) return 'Other'
  const upper = s.toUpperCase()

  // "SUC" marker anywhere (parenthetical or not) always wins first.
  if (upper.includes('SUC')) return 'SUC'
  // Bare "State University ..." (no explicit SUC marker) is still a state
  // university, i.e. an SUC — checked before the "State College" bucket below.
  if (upper.startsWith('STATE UNIVERSITY')) return 'SUC'
  // "LUC" marker (local university/college).
  if (upper.includes('LUC')) return 'LUC'
  // "State College" without an SUC marker gets its own bucket (ambiguous —
  // could be state-run or not, kept distinct from SUC per data conventions).
  if (upper.includes('STATE COLLEGE')) return 'State College'
  // Bare "State" (exact match after trim/uppercase) is shorthand for a state
  // university in the seed data (66 rows, all is_suc=true) — bucket as SUC.
  // Exact match only so compound words like "Statewide Academy" don't
  // false-positive.
  if (upper === 'STATE') return 'SUC'
  // Anything starting with "Local" ('Local', 'Local University', 'Local
  // Government', 'Local Government College', ...) is a local university/
  // college. Note: some rows (e.g. 'Local Government College') carry both
  // is_suc and is_luc true in the source data — this text bucketing can only
  // pick one, so we bucket these as LUC since "Local" is the more specific
  // signal in the raw string.
  if (upper.startsWith('LOCAL')) return 'LUC'
  if (upper.includes('PRIVATE')) return 'Private'
  return 'Other'
}
