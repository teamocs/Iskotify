// The run lifecycle the timed runners share (diagnostic, exam, UPCAT subtest),
// as one discriminated union instead of a phase string plus side flags. Illegal
// transitions return the SAME state object, so a caller can tell a no-op (a
// second SUBMIT from timer + tap) by identity. Timers, questions and anything
// screen-specific stay in the screens.

export type RunnerState =
  | { status: 'loading' }
  | { status: 'error' }
  /** Loaded, nothing to run (no questions, no blueprint, capped). Why is the screen's data. */
  | { status: 'unavailable' }
  /** Loaded, waiting for the student to begin (prestart card, resume prompt). */
  | { status: 'prestart' }
  /** reviewing: the review sheet is open. leaving: the student confirmed leaving. */
  | { status: 'running'; sub: 'answering' | 'reviewing' | 'leaving' }
  | { status: 'submitting' }
  | { status: 'results' }

export type RunnerEvent = {
  type:
    | 'LOAD' | 'LOAD_FAILED' | 'UNAVAILABLE' | 'READY' | 'START'
    | 'OPEN_REVIEW' | 'CLOSE_REVIEW' | 'CONFIRM_LEAVE'
    | 'SUBMIT' | 'SUBMITTED' | 'SUBMIT_FAILED'
}

export const RUNNER_INITIAL: RunnerState = { status: 'loading' }

const answering = (): RunnerState => ({ status: 'running', sub: 'answering' })

export function runnerReducer(s: RunnerState, e: RunnerEvent): RunnerState {
  const sub = s.status === 'running' ? s.sub : null
  switch (e.type) {
    case 'LOAD': return s.status === 'loading' || isRunActive(s) ? s : { status: 'loading' }
    case 'LOAD_FAILED': return s.status === 'loading' ? { status: 'error' } : s
    case 'UNAVAILABLE': return s.status === 'loading' || s.status === 'prestart' ? { status: 'unavailable' } : s
    case 'READY': return s.status === 'loading' ? { status: 'prestart' } : s
    case 'START': return s.status === 'loading' || s.status === 'prestart' ? answering() : s
    case 'OPEN_REVIEW': return sub === 'answering' ? { status: 'running', sub: 'reviewing' } : s
    case 'CLOSE_REVIEW': return sub === 'reviewing' ? answering() : s
    case 'CONFIRM_LEAVE': return sub === 'answering' || sub === 'reviewing' ? { status: 'running', sub: 'leaving' } : s
    case 'SUBMIT': return sub ? { status: 'submitting' } : s
    case 'SUBMITTED': return s.status === 'submitting' ? { status: 'results' } : s
    case 'SUBMIT_FAILED': return s.status === 'submitting' ? answering() : s
  }
}

/** The runner UI is up: answering, or a submit in flight (inputs disabled). */
export function isRunActive(s: RunnerState): boolean {
  return s.status === 'running' || s.status === 'submitting'
}
