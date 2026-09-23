import { renderHook, waitFor, act } from '@testing-library/react-native'
import { useAdmissionEstimate, loadAdmissionEstimateSnapshot } from '../useAdmissionEstimate'
import { MIN_ANSWERS } from '../../utils/subtestReadiness'
import { cachedQuery, invalidate, _clearForTests } from '../../services/queryCache'

// ── settings ─────────────────────────────────────────────────────────────────
const mockGetSettings = jest.fn()
const mockUpdateSettings = jest.fn()
jest.mock('../../services/settings', () => ({
  getSettings: (...args: any[]) => mockGetSettings(...args),
  updateSettings: (...args: any[]) => mockUpdateSettings(...args),
}))

// ── expo-router (Finding 1: reload on focus) ──────────────────────────────────
// Mirrors sibling hooks (useHomeCatalog/useStudyPlan/useHomeStats): the effect
// runs once on mount (so existing "loads and settles" tests still pass) AND
// the latest callback is captured so a test can simulate the screen/tab
// regaining focus later, distinct from the initial mount.
let latestFocusEffect: (() => void) | null = null
jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return {
    useFocusEffect: (cb: () => void) => {
      latestFocusEffect = cb
      useEffect(cb, [])
    },
  }
})

// ── useDb ────────────────────────────────────────────────────────────────────
// The factory below is hoisted above any `let` declared later in this file
// (babel-plugin-jest-hoist only allow-lists `mock`-prefixed identifiers), so
// all mutable state it needs lives in a sibling virtual module it can
// `require()` at call time instead of closing over an outer binding.
jest.mock('../useDb', () => {
  const actualSchema = require('../../db/schema')
  const db = {
    select: (fields?: Record<string, unknown>) => {
      const state = require('./useAdmissionEstimateTestState')
      state.mockSelectFieldsCalls.push(fields)
      return {
        from: (table: unknown) => {
          if (table === actualSchema.questionAttempts) return state.makeChain(state.mockAttemptsRows)
          if (table === actualSchema.upcatCutoffs) return state.makeChain(state.mockCutoffRows)
          return state.makeChain([])
        },
      }
    },
  }
  return { useDb: () => db }
})

// Shared mutable state module the mock reads from (see note above on the
// jest.mock hoisting trap — a factory can't close over outer `let` bindings
// declared later in the file, but it CAN `require()` a sibling module whose
// exports are reassigned at test-run time).
jest.mock('./useAdmissionEstimateTestState', () => {
  let mockAttemptsRows: any[] = []
  let mockCutoffRows: any[] = []
  const mockSelectFieldsCalls: any[] = []
  const mockLimitCalls: number[] = []
  function makeChain(initialRows: any[]) {
    let rows = initialRows
    const api: any = {
      where: () => api,
      orderBy: () => { rows = [...rows].sort((a: any, b: any) => b.answeredAt - a.answeredAt); return api },
      limit: (n: number) => { mockLimitCalls.push(n); rows = rows.slice(0, n); return api },
      then: (resolve: any, reject?: any) => Promise.resolve(rows).then(resolve, reject),
    }
    return api
  }
  return {
    get mockAttemptsRows() { return mockAttemptsRows },
    set mockAttemptsRows(v) { mockAttemptsRows = v },
    get mockCutoffRows() { return mockCutoffRows },
    set mockCutoffRows(v) { mockCutoffRows = v },
    mockSelectFieldsCalls,
    mockLimitCalls,
    reset() { mockSelectFieldsCalls.length = 0; mockLimitCalls.length = 0 },
    makeChain,
  }
}, { virtual: true })

const BASE_SETTINGS = {
  hsGwaG8: 90, hsGwaG9: 91, hsGwaG10: 92, hsGwaG11: 93,
  schoolType: 'public_general', isIndigenous: false,
  targetCampus: null, province: null,
  scoreDisclaimerAck: true,
}

function readyAttempt(subtest: string, i: number) {
  return { subtest, correct: i % 2 === 0, answeredAt: 1000 + i }
}

const READY_ATTEMPTS = [
  ...Array.from({ length: MIN_ANSWERS }, (_, i) => readyAttempt('Mathematics', i)),
  ...Array.from({ length: MIN_ANSWERS }, (_, i) => readyAttempt('Reading Comprehension', i)),
  ...Array.from({ length: MIN_ANSWERS }, (_, i) => readyAttempt('Language Proficiency', i)),
  ...Array.from({ length: MIN_ANSWERS }, (_, i) => readyAttempt('Science', i)),
]

const CUTOFFS = [{ campus: 'UP Diliman', program: null, cutoff: 2.5, year: 2019, isEstimate: true }]

function setAttempts(rows: any[]) {
  require('./useAdmissionEstimateTestState').mockAttemptsRows = rows
}
function setCutoffs(rows: any[]) {
  require('./useAdmissionEstimateTestState').mockCutoffRows = rows
}

describe('useAdmissionEstimate', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    require('./useAdmissionEstimateTestState').reset()
    setAttempts([])
    setCutoffs([])
    latestFocusEffect = null
    mockGetSettings.mockResolvedValue(BASE_SETTINGS)
  })

  it('reports disclaimer status when the disclaimer has not been acknowledged', async () => {
    mockGetSettings.mockResolvedValue({ ...BASE_SETTINGS, scoreDisclaimerAck: false })
    const { result } = renderHook(() => useAdmissionEstimate())
    await waitFor(() => expect(result.current.status).toBe('disclaimer'))
  })

  it('reports no-grades status when no GWA has been entered', async () => {
    mockGetSettings.mockResolvedValue({ ...BASE_SETTINGS, hsGwaG8: null, hsGwaG9: null, hsGwaG10: null, hsGwaG11: null })
    const { result } = renderHook(() => useAdmissionEstimate())
    await waitFor(() => expect(result.current.status).toBe('no-grades'))
  })

  it('reports not-ready status with per-subtest readiness when subtests are unpracticed', async () => {
    setCutoffs(CUTOFFS)
    const { result } = renderHook(() => useAdmissionEstimate())
    await waitFor(() => expect(result.current.status).toBe('not-ready'))
    expect(result.current.readiness?.math.needed).toBe(MIN_ANSWERS)
  })

  it('computes the on-device estimate once all four subtests are ready', async () => {
    setAttempts(READY_ATTEMPTS)
    setCutoffs(CUTOFFS)
    const { result } = renderHook(() => useAdmissionEstimate())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.result?.point).toBeGreaterThanOrEqual(1)
    expect(result.current.result?.campuses[0]?.campus).toBe('UP Diliman')
  })

  it('acknowledgeDisclaimer persists the flag and reloads', async () => {
    mockGetSettings.mockResolvedValueOnce({ ...BASE_SETTINGS, scoreDisclaimerAck: false })
    const { result } = renderHook(() => useAdmissionEstimate())
    await waitFor(() => expect(result.current.status).toBe('disclaimer'))

    mockGetSettings.mockResolvedValue(BASE_SETTINGS)
    await act(async () => { await result.current.acknowledgeDisclaimer() })

    expect(mockUpdateSettings).toHaveBeenCalledWith(expect.anything(), { scoreDisclaimerAck: true })
    // BASE_SETTINGS has grades but the default empty attempts/cutoffs mean the
    // subtests are unpracticed — the next stop after the disclaimer.
    await waitFor(() => expect(result.current.status).toBe('not-ready'))
  })

  // ── Finding 1 (HIGH): stale estimate on tabs that stay mounted ────────────
  describe('reload on focus / cache invalidation (Finding 1)', () => {
    it('reloads when the route/tab regains focus', async () => {
      setCutoffs(CUTOFFS)
      const { result } = renderHook(() => useAdmissionEstimate())
      await waitFor(() => expect(result.current.status).toBe('not-ready'))

      // Student practices elsewhere (another tab/screen), then this one
      // regains focus — it must pick up the new attempts without remounting.
      setAttempts(READY_ATTEMPTS)
      await act(async () => { latestFocusEffect?.() })

      await waitFor(() => expect(result.current.status).toBe('ready'))
    })

    it('reloads when a completed session invalidates the shared query cache (home:/practice:)', async () => {
      _clearForTests()
      setCutoffs(CUTOFFS)
      // Seeds a fetcher under the 'home:' prefix, the same as useHomeStats /
      // useHomeCatalog do in the real app — invalidate('home:') (fired by
      // hooks/useRecordSession.ts after every practice session) only notifies
      // subscribers for prefixes that have at least one registered key.
      await cachedQuery('home:dummy', 999_999, async () => 'seed')

      const { result } = renderHook(() => useAdmissionEstimate())
      await waitFor(() => expect(result.current.status).toBe('not-ready'))

      setAttempts(READY_ATTEMPTS)
      await act(async () => { invalidate('home:') })

      await waitFor(() => expect(result.current.status).toBe('ready'))
    })
  })

  // ── Finding 2 (PERF): bounded, projected attempts query ───────────────────
  describe('attempts query is projected and capped (Finding 2)', () => {
    // A single global row cap would let heavy practice in one subtest push the
    // others' answers out of the window and wrongly re-lock the estimate.
    it('keeps every subtest\'s answers even when recent practice is all one subtest', async () => {
      setCutoffs(CUTOFFS)
      const now = 1_000_000
      const mathBurst = Array.from({ length: 600 }, (_, i) => ({ subtest: 'Mathematics', correct: true, answeredAt: now + i }))
      const older = ['Science', 'Language Proficiency', 'Reading Comprehension'].flatMap(subtest =>
        Array.from({ length: 30 }, (_, i) => ({ subtest, correct: i % 2 === 0, answeredAt: i })))
      setAttempts([...mathBurst, ...older])
      const { result } = renderHook(() => useAdmissionEstimate())
      await waitFor(() => expect(result.current.status).toBe('ready'))
      const state = require('./useAdmissionEstimateTestState')
      expect(state.mockLimitCalls).toEqual([])
    })

    it('selects only subtest/correct/answeredAt', async () => {
      setCutoffs(CUTOFFS)
      renderHook(() => useAdmissionEstimate())

      await waitFor(() => {
        const state = require('./useAdmissionEstimateTestState')
        expect(state.mockSelectFieldsCalls.length).toBeGreaterThan(0)
      })

      const state = require('./useAdmissionEstimateTestState')
      const projectionCall = state.mockSelectFieldsCalls.find((f: any) =>
        f && Object.keys(f).sort().join(',') === 'answeredAt,correct,subtest',
      )
      expect(projectionCall).toBeDefined()
    })
  })
})

describe('loadAdmissionEstimateSnapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setAttempts([])
    setCutoffs([])
    mockGetSettings.mockResolvedValue(BASE_SETTINGS)
  })

  it('returns a plain snapshot usable for before/after comparisons', async () => {
    setAttempts(READY_ATTEMPTS)
    setCutoffs(CUTOFFS)
    const { useDb } = require('../useDb')
    const snap = await loadAdmissionEstimateSnapshot(useDb())
    expect(snap.status).toBe('ready')
    expect(snap.result?.point).toBeGreaterThanOrEqual(1)
  })
})
