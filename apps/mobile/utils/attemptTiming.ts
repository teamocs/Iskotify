// Pure per-question timing accumulator shared by all four practice engines
// (exam/[slug].tsx, upcat/[subtest].tsx, diagnostic/index.tsx, FlashcardExam).
// No React/DB — callers own a TimingState in a ref and drive it from an
// idx-change effect, then read the final per-question elapsed map at submit().
//
// Revisits add up: going back to a previously-viewed question and later
// leaving it again accumulates onto that question's existing total rather
// than overwriting it, since onIdxChange always ADDS the just-elapsed delta.

export interface TimingState {
  /** Accumulated milliseconds spent on each question index so far. */
  elapsedByIdx: Record<number, number>
  /** The index currently being timed. */
  currentIdx: number
  /** Timestamp (ms) when timing on currentIdx began (or was last resumed). */
  sinceTs: number
}

/** Starts a fresh timing state, timing `initialIdx` beginning at `now`. */
export function createTimingState(initialIdx: number, now: number): TimingState {
  return { elapsedByIdx: {}, currentIdx: initialIdx, sinceTs: now }
}

/**
 * Call whenever the visible question index changes. Adds the time spent on
 * the OUTGOING index to its running total, then starts timing `newIdx` from
 * `now`. A no-op (returns the same reference) when `newIdx` matches the
 * state's current index, so it's safe to call from an effect that also fires
 * on initial mount.
 */
export function onIdxChange(state: TimingState, newIdx: number, now: number): TimingState {
  if (newIdx === state.currentIdx) return state
  const delta = Math.max(0, now - state.sinceTs)
  return {
    elapsedByIdx: {
      ...state.elapsedByIdx,
      [state.currentIdx]: (state.elapsedByIdx[state.currentIdx] ?? 0) + delta,
    },
    currentIdx: newIdx,
    sinceTs: now,
  }
}

/**
 * Call once at submit() time to fold in the time spent on the
 * currently-displayed question (which never got an onIdxChange call since
 * nothing came after it) and return the final elapsed-per-index map. Pure —
 * does not mutate `state`.
 */
export function finalizeTiming(state: TimingState, now: number): Record<number, number> {
  const delta = Math.max(0, now - state.sinceTs)
  return {
    ...state.elapsedByIdx,
    [state.currentIdx]: (state.elapsedByIdx[state.currentIdx] ?? 0) + delta,
  }
}
