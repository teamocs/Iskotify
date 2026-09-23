// Pure "before vs after" comparison for the post-session Estimated Admission
// Score delta ("2.35 → 2.31, lower is better"). Only shown when the student
// was already ready (four subtests unlocked) both before and after the
// session — otherwise there is no prior estimate to compare against.

export interface EstimateSnapshot {
  status: 'loading' | 'disclaimer' | 'no-grades' | 'not-ready' | 'ready' | 'error'
  result: { point: number; low: number; high: number } | null
}

export function estimateDeltaMessage(
  before: EstimateSnapshot | null,
  after: EstimateSnapshot | null,
): string | null {
  if (!before || before.status !== 'ready' || !before.result) return null
  if (!after || after.status !== 'ready' || !after.result) return null
  if (before.result.point === after.result.point) return null
  return `Estimated Admission Score ${before.result.point.toFixed(2)} → ${after.result.point.toFixed(2)}, lower is better`
}
