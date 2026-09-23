import { renderHook, waitFor, act } from '@testing-library/react-native'
import { useAdmissionEstimate, loadAdmissionEstimateSnapshot } from '../useAdmissionEstimate'
import { MIN_ANSWERS } from '../../utils/subtestReadiness'

// ── settings ─────────────────────────────────────────────────────────────────
const mockGetSettings = jest.fn()
const mockUpdateSettings = jest.fn()
jest.mock('../../services/settings', () => ({
  getSettings: (...args: any[]) => mockGetSettings(...args),
  updateSettings: (...args: any[]) => mockUpdateSettings(...args),
}))

// ── useDb ────────────────────────────────────────────────────────────────────
// Identifiers prefixed with `mock` are allow-listed by babel-plugin-jest-hoist,
// so this factory may reference them even though jest.mock() calls are hoisted
// above these declarations.
let mockAttemptsRows: any[] = []
let mockCutoffRows: any[] = []

jest.mock('../useDb', () => {
  const actualSchema = require('../../db/schema')
  const db = {
    select: () => ({
      from: (table: unknown) => {
        if (table === actualSchema.questionAttempts) return Promise.resolve(mockAttemptsRows)
        if (table === actualSchema.upcatCutoffs) return Promise.resolve(mockCutoffRows)
        return Promise.resolve([])
      },
    }),
  }
  return { useDb: () => db }
})

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

describe('useAdmissionEstimate', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAttemptsRows = []
    mockCutoffRows = []
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
    mockCutoffRows = CUTOFFS
    const { result } = renderHook(() => useAdmissionEstimate())
    await waitFor(() => expect(result.current.status).toBe('not-ready'))
    expect(result.current.readiness?.math.needed).toBe(MIN_ANSWERS)
  })

  it('computes the on-device estimate once all four subtests are ready', async () => {
    mockAttemptsRows = READY_ATTEMPTS
    mockCutoffRows = CUTOFFS
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
})

describe('loadAdmissionEstimateSnapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAttemptsRows = []
    mockCutoffRows = []
    mockGetSettings.mockResolvedValue(BASE_SETTINGS)
  })

  it('returns a plain snapshot usable for before/after comparisons', async () => {
    mockAttemptsRows = READY_ATTEMPTS
    mockCutoffRows = CUTOFFS
    const { useDb } = require('../useDb')
    const snap = await loadAdmissionEstimateSnapshot(useDb())
    expect(snap.status).toBe('ready')
    expect(snap.result?.point).toBeGreaterThanOrEqual(1)
  })
})
