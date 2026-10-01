import { renderHook, waitFor, act } from '@testing-library/react-native'
import { useSubjectReadiness } from '../useSubjectReadiness'

// Readiness by subject on Progress. Source is weighted RECENT accuracy per
// subject (homeAggregates.getSubjectRecentAccuracy, answered questions only,
// minimum sample) — a subject without enough practice is null = "Not started".

const mockDb = {}
jest.mock('../useDb', () => ({ useDb: () => mockDb }))
jest.mock('../../services/queryCache', () => ({
  cachedQuery: (_k: string, _ttl: number, fetcher: () => Promise<unknown>) => fetcher(),
  invalidate: jest.fn(),
  subscribe: (prefix: string, fn: () => void) => {
    mockListeners.push({ prefix, fn })
    return () => { mockListeners.splice(mockListeners.findIndex(l => l.fn === fn), 1) }
  },
}))
const mockListeners: Array<{ prefix: string; fn: () => void }> = []
const mockFocus = { cb: null as null | (() => void) }
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => { mockFocus.cb = cb },
}))

const mockSubjectPct = { value: [] as Array<{ subject: string; pct: number; answered: number }>, fail: false }
jest.mock('../../services/homeAggregates', () => ({
  getSubjectRecentAccuracy: () => (mockSubjectPct.fail ? Promise.reject(new Error('x')) : Promise.resolve(mockSubjectPct.value)),
}))

const mockPractice = {
  subjects: [{ id: 's-math', name: 'Math' }, { id: 's-sci', name: 'Science' }],
  topicRows: [
    { topic: { id: 't1', name: 'Algebra', subjectId: 's-math' }, accuracy: 40 },
    { topic: { id: 't2', name: 'Biology', subjectId: 's-sci' }, accuracy: null },
  ],
}
jest.mock('../usePracticeData', () => ({ usePracticeData: () => mockPractice }))

const math = (pct: number) => [{ subject: 'Math', pct, answered: 20 }]

beforeEach(() => {
  mockSubjectPct.value = []
  mockSubjectPct.fail = false
  mockListeners.length = 0
  mockFocus.cb = null
})

describe('useSubjectReadiness', () => {
  it('computes per-subject readiness from recent accuracy, lowest first, not-started last', async () => {
    mockSubjectPct.value = math(80)
    const { result } = renderHook(() => useSubjectReadiness())
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.entries).toEqual([
      { id: 's-math', name: 'Math', pct: 80 },
      { id: 's-sci', name: 'Science', pct: null },
    ])
  })

  it('a subject with too little practice is null (Not started), never 0%', async () => {
    const { result } = renderHook(() => useSubjectReadiness())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.entries.find(e => e.name === 'Math')?.pct).toBeNull()
  })

  it('reports a failure and recovers on refresh', async () => {
    mockSubjectPct.fail = true
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useSubjectReadiness())
    await waitFor(() => expect(result.current.error).toBe(true))
    mockSubjectPct.fail = false
    mockSubjectPct.value = math(55)
    await act(async () => { await result.current.refresh() })
    expect(result.current.error).toBe(false)
    expect(result.current.entries.find(e => e.name === 'Math')?.pct).toBe(55)
    warn.mockRestore()
  })

  it('reloads when a finished session invalidates home: (Progress tab stays mounted)', async () => {
    mockSubjectPct.value = math(40)
    const { result } = renderHook(() => useSubjectReadiness())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockListeners.some(l => l.prefix === 'home:')).toBe(true)
    mockSubjectPct.value = math(75)
    await act(async () => { mockListeners.forEach(l => l.fn()) })
    await waitFor(() => expect(result.current.entries.find(e => e.name === 'Math')?.pct).toBe(75))
  })

  it('reloads when the screen regains focus', async () => {
    mockSubjectPct.value = math(40)
    const { result } = renderHook(() => useSubjectReadiness())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockFocus.cb).not.toBeNull()
    mockSubjectPct.value = math(60)
    await act(async () => { mockFocus.cb?.() })
    await waitFor(() => expect(result.current.entries.find(e => e.name === 'Math')?.pct).toBe(60))
  })
})
