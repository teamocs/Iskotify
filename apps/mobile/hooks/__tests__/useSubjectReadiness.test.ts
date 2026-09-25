import { renderHook, waitFor, act } from '@testing-library/react-native'
import { useSubjectReadiness } from '../useSubjectReadiness'

// Readiness by subject moved from Today to Progress (redesign M2: Progress
// owns readiness). Same SESSION-based source as before: per-topic review
// bests + subject-level mock bests, never a flashcard-accuracy fallback.

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

const mockTopicBest = { value: [] as Array<{ topicId: string; bestPct: number }>, fail: false }
const mockSubjectBest = { value: [] as Array<{ subject: string; bestPct: number }> }
jest.mock('../../services/homeAggregates', () => ({
  getTopicBestSessionPercentages: () => (mockTopicBest.fail ? Promise.reject(new Error('x')) : Promise.resolve(mockTopicBest.value)),
  getSubjectSessionPercentages: () => Promise.resolve(mockSubjectBest.value),
}))

const mockPractice = {
  subjects: [{ id: 's-math', name: 'Math' }, { id: 's-sci', name: 'Science' }],
  topicRows: [
    { topic: { id: 't1', name: 'Algebra', subjectId: 's-math' }, accuracy: 40 },
    { topic: { id: 't2', name: 'Biology', subjectId: 's-sci' }, accuracy: null },
  ],
}
jest.mock('../usePracticeData', () => ({ usePracticeData: () => mockPractice }))

beforeEach(() => {
  mockTopicBest.value = []
  mockTopicBest.fail = false
  mockSubjectBest.value = []
  mockListeners.length = 0
  mockFocus.cb = null
})

describe('useSubjectReadiness', () => {
  it('computes per-subject readiness from session bests, lowest first', async () => {
    mockTopicBest.value = [{ topicId: 't1', bestPct: 80 }]
    const { result } = renderHook(() => useSubjectReadiness())
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.entries).toEqual([
      { id: 's-sci', name: 'Science', pct: 0 },
      { id: 's-math', name: 'Math', pct: 80 },
    ])
  })

  it('uses 0% (not flashcard accuracy) when a subject has no sessions', async () => {
    const { result } = renderHook(() => useSubjectReadiness())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.entries.find(e => e.name === 'Math')?.pct).toBe(0)
  })

  it('reports a failure and recovers on refresh', async () => {
    mockTopicBest.fail = true
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useSubjectReadiness())
    await waitFor(() => expect(result.current.error).toBe(true))
    mockTopicBest.fail = false
    mockTopicBest.value = [{ topicId: 't1', bestPct: 55 }]
    await act(async () => { await result.current.refresh() })
    expect(result.current.error).toBe(false)
    expect(result.current.entries.find(e => e.name === 'Math')?.pct).toBe(55)
    warn.mockRestore()
  })

  it('reloads when a finished session invalidates home: (Progress tab stays mounted)', async () => {
    mockTopicBest.value = [{ topicId: 't1', bestPct: 40 }]
    const { result } = renderHook(() => useSubjectReadiness())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockListeners.some(l => l.prefix === 'home:')).toBe(true)
    mockTopicBest.value = [{ topicId: 't1', bestPct: 75 }]
    await act(async () => { mockListeners.forEach(l => l.fn()) })
    await waitFor(() => expect(result.current.entries.find(e => e.name === 'Math')?.pct).toBe(75))
  })

  it('reloads when the screen regains focus', async () => {
    mockTopicBest.value = [{ topicId: 't1', bestPct: 40 }]
    const { result } = renderHook(() => useSubjectReadiness())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockFocus.cb).not.toBeNull()
    mockTopicBest.value = [{ topicId: 't1', bestPct: 60 }]
    await act(async () => { mockFocus.cb?.() })
    await waitFor(() => expect(result.current.entries.find(e => e.name === 'Math')?.pct).toBe(60))
  })
})
