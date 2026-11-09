import { runnerReducer, isRunActive, RUNNER_INITIAL, type RunnerState, type RunnerEvent } from '../runnerReducer'

const S = {
  loading: { status: 'loading' },
  error: { status: 'error' },
  unavailable: { status: 'unavailable' },
  prestart: { status: 'prestart' },
  answering: { status: 'running', sub: 'answering' },
  reviewing: { status: 'running', sub: 'reviewing' },
  leaving: { status: 'running', sub: 'leaving' },
  submitting: { status: 'submitting' },
  results: { status: 'results' },
} satisfies Record<string, RunnerState>
type Name = keyof typeof S

const EVENTS: RunnerEvent['type'][] = [
  'LOAD', 'LOAD_FAILED', 'UNAVAILABLE', 'READY', 'START',
  'OPEN_REVIEW', 'CLOSE_REVIEW', 'CONFIRM_LEAVE', 'CANCEL_LEAVE',
  'SUBMIT', 'SUBMITTED', 'SUBMIT_FAILED',
]

// Every legal transition. Anything not listed must be a no-op (same reference back).
const LEGAL: [Name, RunnerEvent['type'], Name][] = [
  ['error', 'LOAD', 'loading'],
  ['unavailable', 'LOAD', 'loading'],
  ['prestart', 'LOAD', 'loading'],
  ['results', 'LOAD', 'loading'],
  ['loading', 'LOAD_FAILED', 'error'],
  ['loading', 'UNAVAILABLE', 'unavailable'],
  ['prestart', 'UNAVAILABLE', 'unavailable'],
  ['loading', 'READY', 'prestart'],
  ['loading', 'START', 'answering'],
  ['prestart', 'START', 'answering'],
  ['answering', 'OPEN_REVIEW', 'reviewing'],
  ['reviewing', 'CLOSE_REVIEW', 'answering'],
  ['answering', 'CONFIRM_LEAVE', 'leaving'],
  ['reviewing', 'CONFIRM_LEAVE', 'leaving'],
  ['leaving', 'CANCEL_LEAVE', 'answering'],
  ['answering', 'SUBMIT', 'submitting'],
  ['reviewing', 'SUBMIT', 'submitting'],
  ['leaving', 'SUBMIT', 'submitting'],
  ['submitting', 'SUBMITTED', 'results'],
  ['submitting', 'SUBMIT_FAILED', 'answering'],
]

describe('runnerReducer', () => {
  it('starts loading', () => {
    expect(RUNNER_INITIAL).toEqual(S.loading)
  })

  it.each(LEGAL)('%s + %s -> %s', (from, type, to) => {
    expect(runnerReducer(S[from], { type } as RunnerEvent)).toEqual(S[to])
  })

  const legal = new Set(LEGAL.map(([f, e]) => `${f}|${e}`))
  const illegal = (Object.keys(S) as Name[]).flatMap(f => EVENTS.filter(e => !legal.has(`${f}|${e}`)).map(e => [f, e] as const))
  it.each(illegal)('%s + %s is a no-op', (from, type) => {
    expect(runnerReducer(S[from], { type } as RunnerEvent)).toBe(S[from])
  })

  it('a second SUBMIT (timer + tap) is a no-op', () => {
    const once = runnerReducer(S.answering, { type: 'SUBMIT' })
    expect(runnerReducer(once, { type: 'SUBMIT' })).toBe(once)
    expect(runnerReducer(S.results, { type: 'SUBMIT' })).toBe(S.results)
  })

  it('SUBMIT_FAILED returns to answering, where SUBMIT works again', () => {
    const failed = runnerReducer(runnerReducer(S.answering, { type: 'SUBMIT' }), { type: 'SUBMIT_FAILED' })
    expect(failed).toEqual(S.answering)
    expect(runnerReducer(failed, { type: 'SUBMIT' })).toEqual(S.submitting)
  })

  it('a cancelled leave goes back to answering (the leave guard is armed again)', () => {
    const left = runnerReducer(S.answering, { type: 'CONFIRM_LEAVE' })
    expect(runnerReducer(left, { type: 'CANCEL_LEAVE' })).toEqual(S.answering)
  })

  it('submitting from the review sheet closes it: results never carry an open review', () => {
    const done = runnerReducer(runnerReducer(S.reviewing, { type: 'SUBMIT' }), { type: 'SUBMITTED' })
    expect(done).toEqual(S.results)
    expect(runnerReducer(done, { type: 'OPEN_REVIEW' })).toBe(done)
  })

  it('isRunActive covers running and submitting only', () => {
    const active = (Object.keys(S) as Name[]).filter(n => isRunActive(S[n]))
    expect(active).toEqual(['answering', 'reviewing', 'leaving', 'submitting'])
  })
})
