import { createTimingState, onIdxChange, finalizeTiming } from '../attemptTiming'

describe('attemptTiming', () => {
  describe('createTimingState', () => {
    it('starts with an empty elapsed map, timing the given initial index', () => {
      const state = createTimingState(0, 1000)
      expect(state).toEqual({ elapsedByIdx: {}, currentIdx: 0, sinceTs: 1000 })
    })

    it('can start timing a non-zero initial index (e.g. a section-blocked exam)', () => {
      const state = createTimingState(5, 2000)
      expect(state.currentIdx).toBe(5)
    })
  })

  describe('onIdxChange', () => {
    it('adds the outgoing index\'s elapsed time and starts timing the new index', () => {
      const start = createTimingState(0, 1000)
      const next = onIdxChange(start, 1, 1500)
      expect(next.elapsedByIdx).toEqual({ 0: 500 })
      expect(next.currentIdx).toBe(1)
      expect(next.sinceTs).toBe(1500)
    })

    it('is a no-op (same reference) when newIdx matches the current index', () => {
      const start = createTimingState(0, 1000)
      const next = onIdxChange(start, 0, 5000)
      expect(next).toBe(start)
    })

    it('accumulates onto an index\'s existing total on revisit rather than overwriting it', () => {
      // Q0 (0→300ms) -> Q1 (300→800ms) -> back to Q0 (800→1100ms) -> Q1 again
      let state = createTimingState(0, 0)
      state = onIdxChange(state, 1, 300)   // Q0 got 300ms
      state = onIdxChange(state, 0, 800)   // Q1 got 500ms
      state = onIdxChange(state, 1, 1100)  // Q0 gets +300ms = 600ms total
      expect(state.elapsedByIdx).toEqual({ 0: 600, 1: 500 })
    })

    it('clamps negative deltas (clock skew) to zero rather than going negative', () => {
      const start = createTimingState(0, 5000)
      const next = onIdxChange(start, 1, 4000) // "now" before "sinceTs"
      expect(next.elapsedByIdx).toEqual({ 0: 0 })
    })
  })

  describe('finalizeTiming', () => {
    it('folds in time spent on the still-current index without mutating the input state', () => {
      const state = createTimingState(0, 1000)
      const before = JSON.stringify(state)
      const result = finalizeTiming(state, 1400)
      expect(result).toEqual({ 0: 400 })
      expect(JSON.stringify(state)).toBe(before) // pure — original untouched
    })

    it('adds onto an index that already has accumulated time from prior visits', () => {
      let state = createTimingState(0, 0)
      state = onIdxChange(state, 1, 300) // Q0: 300ms
      state = onIdxChange(state, 0, 800) // Q1: 500ms
      const result = finalizeTiming(state, 1000) // Q0 gets +200ms more = 500ms
      expect(result).toEqual({ 0: 500, 1: 500 })
    })

    it('returns a map with just the current index when nothing has elapsed yet', () => {
      const state = createTimingState(2, 1000)
      expect(finalizeTiming(state, 1000)).toEqual({ 2: 0 })
    })
  })
})
