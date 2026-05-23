import { renderHook, act } from '@testing-library/react-native'
import { useAiCoach } from '../useAiCoach'

// Mock provider context — drives all hook scenarios
const mockStats = {
  listing: { title: 'UPCAT 2026', examDate: Date.now() + 30 * 86400000 },
  daysLeft: 30,
  todayAccuracy: null,
  streakDays: 0,
  weakTopics: [],
  firstTopicId: null,
  fullName: '',
  importantDayIndices: [],
  practiceDayIndices: [],
  focusedListings: [],
}

let mockRingIndex = 0
const mockNextPhrase = jest.fn()

jest.mock('../../providers/AiCoachProvider', () => ({
  useCoachContext: () => ({
    stats: mockStats,
    ringIndex: mockRingIndex,
    nextPhrase: mockNextPhrase,
  }),
}))

describe('useAiCoach', () => {
  beforeEach(() => {
    mockRingIndex = 0
    mockNextPhrase.mockReset()
  })

  it('returns a non-empty Layer-1 phrase on initial render', () => {
    const { result } = renderHook(() => useAiCoach())
    expect(typeof result.current.phrase).toBe('string')
    expect(result.current.phrase.length).toBeGreaterThan(0)
  })

  it('calls nextPhrase on tap and updates displayed phrase', () => {
    mockNextPhrase.mockReturnValue({ id: 42, text: 'AI-generated push' })
    const { result } = renderHook(() => useAiCoach())
    act(() => { result.current.onTap() })
    expect(mockNextPhrase).toHaveBeenCalledTimes(1)
    expect(result.current.phrase).toBe('AI-generated push')
  })

  it('debounces taps within 300ms', () => {
    mockNextPhrase.mockReturnValue({ id: 1, text: 'first phrase' })
    const { result } = renderHook(() => useAiCoach())
    act(() => { result.current.onTap() })
    act(() => { result.current.onTap() })
    act(() => { result.current.onTap() })
    expect(mockNextPhrase).toHaveBeenCalledTimes(1)
  })

  it('allows another tap after debounce window elapses', () => {
    jest.useFakeTimers()
    mockNextPhrase.mockReturnValue({ id: 1, text: 'phrase A' })
    const { result } = renderHook(() => useAiCoach())
    act(() => { result.current.onTap() })
    expect(mockNextPhrase).toHaveBeenCalledTimes(1)
    act(() => { jest.advanceTimersByTime(350) })
    mockNextPhrase.mockReturnValue({ id: 2, text: 'phrase B' })
    act(() => { result.current.onTap() })
    expect(mockNextPhrase).toHaveBeenCalledTimes(2)
    expect(result.current.phrase).toBe('phrase B')
    jest.useRealTimers()
  })
})
