import { renderHook, waitFor, act } from '@testing-library/react-native'
import { useStudyPlan } from '../useStudyPlan'
import { useHomeCatalog } from '../useHomeCatalog'
import { useHomeStats } from '../useHomeStats'
import { useAnalytics } from '../useAnalytics'

// Redesign M2: Today and Progress show an ErrorState (with retry) instead of a
// silent empty section when a load fails (brief §5 finding 9, "silent load
// failures"). Each data hook therefore reports `error`, and clears it on a
// successful retry.

jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => {
    const React = require('react')
    React.useEffect(cb, [cb])
  },
}))

jest.mock('../../services/queryCache', () => ({
  cachedQuery: (_key: string, _ttl: number, fetcher: () => Promise<unknown>) => fetcher(),
  subscribe: () => () => {},
  invalidate: () => {},
}))

let mockFail = true
const boom = () => Promise.reject(new Error('disk I/O error'))
// A drizzle stand-in whose every read either rejects (mockFail) or returns [].
function chain(): any {
  const result = () => (mockFail ? boom() : Promise.resolve([]))
  const node: any = {
    from: () => node, where: () => node, limit: () => result(), orderBy: () => result(),
    leftJoin: () => node, innerJoin: () => node, groupBy: () => node,
    then: (res: any, rej: any) => result().then(res, rej),
  }
  return node
}
const mockDb = { select: () => chain(), insert: () => ({ values: () => Promise.resolve() }), all: () => (mockFail ? boom() : Promise.resolve([])) }
jest.mock('../useDb', () => ({ useDb: () => mockDb }))

jest.mock('../../services/studyPlan', () => ({
  gatherPlanInputs: () => (mockFail ? Promise.reject(new Error('x')) : Promise.resolve(null)),
  // Success mode returns today's saved plan, so no generation is needed.
  getPlanItemsForDate: () => (mockFail
    ? Promise.reject(new Error('x'))
    : Promise.resolve([{ id: 1, kind: 'diagnostic', refId: '', targetCount: 1, completedAt: null }])),
  persistPlanItems: () => Promise.resolve(),
  markPlanItemDone: () => Promise.resolve(),
  getTomorrowDueSrsCount: () => Promise.resolve(0),
}))

jest.mock('../../services/homeAggregates', () => ({
  getPracticeDayIndices: () => (mockFail ? Promise.reject(new Error('x')) : Promise.resolve([])),
  getListingMockBest: () => (mockFail ? Promise.reject(new Error('x')) : Promise.resolve([])),
}))
jest.mock('../../services/examBlueprints', () => ({ listPublishedBlueprints: () => Promise.resolve([]) }))
jest.mock('../../services/settings', () => ({ getSettings: () => Promise.resolve({}) }))

const quiet = jest.spyOn(console, 'error').mockImplementation(() => {})
const quietWarn = jest.spyOn(console, 'warn').mockImplementation(() => {})
afterAll(() => { quiet.mockRestore(); quietWarn.mockRestore() })
beforeEach(() => { mockFail = true })

describe('data hooks report load failures', () => {
  it('useStudyPlan sets error, stops loading, and clears error on a good retry', async () => {
    const { result } = renderHook(() => useStudyPlan())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe(true)
    mockFail = false
    await act(async () => { await result.current.refresh() })
    expect(result.current.error).toBe(false)
  })

  it('useHomeCatalog sets error and still marks itself loaded', async () => {
    const { result } = renderHook(() => useHomeCatalog())
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.error).toBe(true)
  })

  it('useHomeStats starts loading, then reports the error', async () => {
    const { result } = renderHook(() => useHomeStats())
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe(true)
  })

  it('useAnalytics stops loading and reports the error instead of spinning forever', async () => {
    const { result } = renderHook(() => useAnalytics('overall'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe(true)
  })
})
