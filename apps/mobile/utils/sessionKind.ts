// What a practice_sessions row IS (mock / sprint / drill / …) and which sitting
// it belongs to. Pure so home, analytics and the study plan share one rule.

/**
 * Sitting classification written by hooks/useRecordSession. NULL on rows that
 * predate the column.
 */
export type SessionKind = 'mock' | 'sprint' | 'diagnostic' | 'drill' | 'flashcard' | 'onboarding'

export interface SessionKindFields {
  kind?: string | null
  topicId: string
  subtest: string | null
}

/**
 * Is this row part of a full mock? An explicit kind wins; legacy rows (no
 * kind) keep the old inference — empty topicId + a subtest tag — so existing
 * users don't lose their mock history.
 */
export function isMockSession(row: SessionKindFields): boolean {
  if (row.kind) return row.kind === 'mock'
  return row.topicId === '' && !!row.subtest
}

/**
 * Key shared by every row of one sitting. New rows carry attemptKey (ms);
 * legacy rows derive the sitting start from completedAt - duration, to the
 * second (the old behaviour). Only compare keys from the same era: callers
 * group by this alone, and a legacy seconds key can't collide with a ms key
 * in practice.
 */
export function sittingKey(row: { attemptKey?: number | null; completedAt: number; durationSecs: number }): number {
  if (row.attemptKey != null) return row.attemptKey
  return Math.floor((row.completedAt - row.durationSecs * 1000) / 1000)
}

/**
 * Overall accuracy of a set of sessions as sum(score)/sum(total) — a 1-question
 * 100% row must not weigh the same as a 100-question 60% row. Rows with
 * total <= 0 are ignored; null when nothing is left.
 */
export function weightedAccuracy(rows: { score: number; total: number }[]): number | null {
  let score = 0
  let total = 0
  for (const r of rows) {
    if (r.total > 0) { score += r.score; total += r.total }
  }
  return total > 0 ? Math.round((score / total) * 100) : null
}

/** Distinct sittings among rows (one mock = N section rows = 1 sitting). */
export function countSittings(rows: { attemptKey?: number | null; completedAt: number; durationSecs?: number }[]): number {
  const keys = new Set<string>()
  for (const r of rows) {
    // Era prefix: a new-row ms key must never collide with a legacy seconds key.
    keys.add(`${r.attemptKey != null ? 'a' : 'l'}:${sittingKey({ ...r, durationSecs: r.durationSecs ?? 0 })}`)
  }
  return keys.size
}

const PRE_ASSESS_PREFIX = 'pre-assess-'

/**
 * Should this row feed Progress counts/averages/mastery? The onboarding quick
 * check is a 20-question warm-up, not study: it still counts for streak days
 * (getPracticeDayIndices is untouched) but not for stats.
 */
export function isProgressSession(row: { kind?: string | null; topicId: string }): boolean {
  if (row.kind === 'onboarding') return false
  return !row.topicId.startsWith(PRE_ASSESS_PREFIX)
}

/**
 * Kind for a session from app/practice/upcat/[subtest].tsx. Only the 'all'
 * route in full mode is the timed four-subtest mock (the screen itself calls it
 * "the full mock"); a single-subtest or quick run is a drill and must not feed
 * the mock Best / history / weekly-mock plan item.
 */
export function upcatDrillKind(subtestParam: string | undefined, mode: string | undefined): SessionKind {
  return subtestParam === 'all' && mode !== 'quick' ? 'mock' : 'drill'
}
