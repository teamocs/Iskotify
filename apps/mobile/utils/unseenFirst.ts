// Unseen-first sampling (P4). Every new practice run should serve questions the
// student has never been shown before repeating any, and once everything has
// been shown, repeat the ones seen longest ago first. Used by the blueprint
// mock + Study Sprint (examBuilder pickUnits), the UPCAT quick drill
// (upcatExam buildExam) and the flashcard quick quiz (flashcardExam).
//
// "Seen" = any question_attempts row for that question id + source table, even
// a skipped one (a served question counts as seen). The lookup map comes from
// services/questionHistory getLastSeenByQuestionId.
//
// Trade-off: question_attempts is capped (utils/attemptRetention.ts,
// MAX_RETAINED_ATTEMPTS, oldest rows pruned first). A question whose only
// attempts were pruned looks "never seen" again. That only happens after
// thousands of newer attempts, by which point re-serving the oldest material
// is what we want anyway, so the cap is kept as is.
//
// Only NEW runs are sampled: a resumed run is rebuilt from its saved question
// ids (utils/examRunPersistence reorderByIds) and never passes through here.
// Pure: no React, no DB. The rng is injectable so tests are deterministic.

export type Rng = () => number

/** question id -> epoch ms it was last served. */
export type LastSeen = ReadonlyMap<string, number>

export interface SamplingOptions {
  /** Last-seen time per question id; absent ids are "never seen". Omitted = no history (plain shuffle). */
  seen?: LastSeen
  /** Defaults to Math.random. */
  rng?: Rng
}

/** Fisher-Yates shuffle into a new array. */
export function shuffleWith<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/**
 * When a unit (a single question, or a whole passage set) was last served: the
 * most recent sighting of any member, or null when no member was ever served.
 * A passage set with one served member is therefore "seen".
 */
export function unitLastSeen(ids: readonly string[], seen: LastSeen): number | null {
  let latest: number | null = null
  for (const id of ids) {
    const t = seen.get(id)
    if (t !== undefined && (latest === null || t > latest)) latest = t
  }
  return latest
}

/**
 * Rank whole units for sampling: never-seen units first (in random order), then
 * seen units oldest last-seen first (ties in random order). Units are never
 * split. With no history this is just a shuffle. Never mutates its input.
 */
export function rankUnseenFirst<T>(
  units: readonly T[],
  idsOf: (unit: T) => readonly string[],
  seen?: LastSeen,
  rng: Rng = Math.random,
): T[] {
  const shuffled = shuffleWith(units, rng)
  if (!seen || seen.size === 0) return shuffled
  const keyed = shuffled.map(unit => ({ unit, at: unitLastSeen(idsOf(unit), seen) }))
  // Array.prototype.sort is stable, so equal keys keep their shuffled order.
  keyed.sort((x, y) => {
    if (x.at === y.at) return 0
    if (x.at === null) return -1
    if (y.at === null) return 1
    return x.at - y.at
  })
  return keyed.map(k => k.unit)
}

/**
 * Serve order for the picked units. Ranking puts unseen units first, so with
 * history the picks are shuffled again (still whole) to keep the run's order
 * random. Without history the ranking already was a single plain shuffle, so
 * the picks are returned as they are: identical to sampling before P4.
 */
export function servedOrder<T>(picked: readonly T[], opts: SamplingOptions = {}): T[] {
  return opts.seen && opts.seen.size > 0 ? shuffleWith(picked, opts.rng ?? Math.random) : [...picked]
}

/** Test helper: a deterministic rng cycling through `values` (clamped into [0, 1)). */
export function seqRng(...values: number[]): Rng {
  const vals = (values.length ? values : [0]).map(v => Math.min(0.999999, Math.max(0, v)))
  let i = 0
  return () => vals[i++ % vals.length]!
}
