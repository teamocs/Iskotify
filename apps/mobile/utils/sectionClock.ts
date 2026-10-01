// Pure helpers for the section-blocked mock runner (app/practice/exam/[slug].tsx).
// Kept out of the screen so the timing rules are unit-tested without timers.

const MINUTE_MS = 60_000

export type SectionClockState =
  | { finished: true }
  | { finished: false; sectionIdx: number; sectionEndTime: number }

/**
 * Advance the section clocks to `now`. Each next section's clock is CHAINED from
 * the previous section's end time (not from `now`), so a student who was away
 * (app closed, device asleep) does not get a fresh full clock for every later
 * section, and several sections that all expired while away are skipped in a
 * single pass. Returns `{ finished: true }` once the last section's clock has run
 * out (the exam is over). `minutes[i]` is section i's clock length.
 */
export function advanceSectionClocks(args: {
  sectionIdx: number
  sectionEndTime: number
  now: number
  minutes: readonly number[]
}): SectionClockState {
  let { sectionIdx, sectionEndTime } = args
  while (sectionEndTime <= args.now) {
    const next = sectionIdx + 1
    if (next >= args.minutes.length) return { finished: true }
    sectionEndTime += (args.minutes[next] ?? 0) * MINUTE_MS
    sectionIdx = next
  }
  return { finished: false, sectionIdx, sectionEndTime }
}

/** Clamp a question index into [floor, ceil). `ceil` undefined leaves the top free. */
export function clampNavIndex(i: number, floor: number, ceil: number | undefined): number {
  const upper = ceil === undefined ? Infinity : ceil - 1
  return Math.max(floor, Math.min(i, upper))
}
