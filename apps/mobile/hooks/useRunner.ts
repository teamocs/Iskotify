import { useCallback, useRef, useState } from 'react'
import { runnerReducer, RUNNER_INITIAL, type RunnerState, type RunnerEvent } from '../utils/runnerReducer'

/**
 * The run lifecycle (utils/runnerReducer.ts) for a timed runner screen. runRef is
 * the synchronous copy, so a second SUBMIT in the same tick (timer + tap) is
 * refused before React re-renders.
 */
export function useRunner() {
  const [run, setRun] = useState<RunnerState>(RUNNER_INITIAL)
  const runRef = useRef(run)
  /** Applies an event; false when it was not legal from the current state (a no-op). */
  const send = useCallback((type: RunnerEvent['type']): boolean => {
    const next = runnerReducer(runRef.current, { type })
    if (next === runRef.current) return false
    runRef.current = next
    setRun(next)
    return true
  }, [])
  return { run, runRef, send }
}
