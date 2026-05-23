import { renderHook, act } from '@testing-library/react-native'

jest.mock('../useDb', () => ({
  useDb: () => ({}),
}))

jest.mock('../useHomeStats', () => ({
  useHomeStats: () => ({
    listing: null,
    daysLeft: null,
    todayAccuracy: null,
    streakDays: 0,
    weakTopics: [],
    firstTopicId: null,
    fullName: '',
    importantDayIndices: [],
    practiceDayIndices: [],
    focusedListings: [],
  }),
}))

jest.mock('../../services/llm', () => ({
  modelExists: jest.fn().mockResolvedValue(true),
  streamChatInference: jest.fn(),
}))

jest.mock('../../services/chatContext', () => ({
  buildProgressContext: jest.fn().mockResolvedValue('ctx'),
}))

import { useKuyaChat } from '../useKuyaChat'
import { streamChatInference, modelExists } from '../../services/llm'

const mockStream = streamChatInference as jest.MockedFunction<typeof streamChatInference>
const mockModelExists = modelExists as jest.MockedFunction<typeof modelExists>

describe('useKuyaChat', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockModelExists.mockResolvedValue(true)
  })

  it('initializes with empty messages, progress mode, and not streaming', async () => {
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})
    expect(result.current.messages).toEqual([])
    expect(result.current.mode).toBe('progress')
    expect(result.current.isStreaming).toBe(false)
  })

  it('sets isModelReady true when modelExists resolves true', async () => {
    mockModelExists.mockResolvedValue(true)
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})
    expect(result.current.isModelReady).toBe(true)
  })

  it('sets isModelReady false when modelExists resolves false', async () => {
    mockModelExists.mockResolvedValue(false)
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})
    expect(result.current.isModelReady).toBe(false)
  })

  it('send pushes a user message and an assistant placeholder', async () => {
    mockStream.mockImplementation(async () => 'response')
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})
    await act(async () => { result.current.send('hello'); await new Promise(r => setTimeout(r, 0)) })
    expect(result.current.messages.length).toBeGreaterThanOrEqual(2)
    expect(result.current.messages[0]!.role).toBe('user')
    expect(result.current.messages[0]!.text).toBe('hello')
    expect(result.current.messages[1]!.role).toBe('assistant')
  })

  it('send is a no-op when text is empty or whitespace', async () => {
    mockStream.mockImplementation(async () => 'r')
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})
    await act(async () => { result.current.send('   ') })
    expect(result.current.messages.length).toBe(0)
    expect(mockStream).not.toHaveBeenCalled()
  })

  it('setMode changes the mode when not streaming', async () => {
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})
    act(() => { result.current.setMode('topic') })
    expect(result.current.mode).toBe('topic')
  })

  it('abort can be called safely when nothing is streaming', async () => {
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})
    expect(() => result.current.abort()).not.toThrow()
    expect(result.current.isStreaming).toBe(false)
  })
})
