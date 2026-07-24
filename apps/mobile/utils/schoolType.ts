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
  if (upper.includes('PRIVATE')) return 'Private'
  return 'Other'
}
