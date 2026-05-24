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

  it('finalizes the assistant message text after stream completes', async () => {
    mockStream.mockImplementation(async (_prompt, onToken) => {
      onToken('Hello ')
      onToken('world!')
      return 'Hello world!'
    })
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})
    await act(async () => {
      // Use a question over the 5-char threshold so the short-question guard
      // doesn't short-circuit the model call.
      result.current.send('hello?')
      // wait for InteractionManager + setTimeout flushes
      await new Promise(r => setTimeout(r, 200))
    })
    const assistantMsg = result.current.messages.find(m => m.role === 'assistant')
    expect(assistantMsg?.text).toBe('Hello world!')
    expect(assistantMsg?.isStreaming).toBe(false)
    expect(result.current.isStreaming).toBe(false)
  })

  it('shows the empty-output fallback (English) when stream resolves with no tokens', async () => {
    mockStream.mockImplementation(async () => '')
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})
    await act(async () => {
      result.current.send('hello?')
      await new Promise(r => setTimeout(r, 200))
    })
    const assistantMsg = result.current.messages.find(m => m.role === 'assistant')
    expect(assistantMsg?.text).toBe("I couldn't process that. Try rephrasing your question.")
    expect(assistantMsg?.isStreaming).toBe(false)
  })

  it('shows the inline error message (English) when streamChatInference throws', async () => {
    mockStream.mockRejectedValue(new Error('native crash'))
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})
    await act(async () => {
      result.current.send('hello?')
      await new Promise(r => setTimeout(r, 200))
    })
    const assistantMsg = result.current.messages.find(m => m.role === 'assistant')
    expect(assistantMsg?.error).toBe("Kuya Baw can't answer right now. Try again in a moment.")
    expect(assistantMsg?.isStreaming).toBe(false)
    expect(result.current.isStreaming).toBe(false)
  })

  it('short-question guard: input under 5 chars shows canned message and does NOT call the model', async () => {
    mockStream.mockImplementation(async () => 'should not be called')
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})
    await act(async () => {
      result.current.send('Ano?')  // 4 chars — under threshold
      await new Promise(r => setTimeout(r, 50))
    })
    const userMsg = result.current.messages.find(m => m.role === 'user')
    const assistantMsg = result.current.messages.find(m => m.role === 'assistant')
    expect(userMsg?.text).toBe('Ano?')
    expect(assistantMsg?.text).toBe('Please ask a more specific question — try one of the suggestions below.')
    expect(assistantMsg?.isStreaming).toBe(false)
    expect(mockStream).not.toHaveBeenCalled()
  })

  it('Tagalog safety net: response with ≥3 Tagalog tokens gets replaced with English fallback', async () => {
    // Simulate the 1.5B model ignoring the English-only rule and producing Tagalog
    mockStream.mockImplementation(async (_prompt, onToken) => {
      const tagalogResponse = 'Christian Raro, nais ka naman sa naging pag-aaral. Sa naging pag-aaral, nangangahulugang masama ka sa pag-aaral. Mga gawin mo'
      onToken(tagalogResponse)
      return tagalogResponse
    })
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})
    await act(async () => {
      result.current.send('How am I doing this week?')
      await new Promise(r => setTimeout(r, 200))
    })
    const assistantMsg = result.current.messages.find(m => m.role === 'assistant')
    expect(assistantMsg?.text).toBe('Let me try that again — could you re-ask your question?')
    expect(assistantMsg?.isStreaming).toBe(false)
  })

  it('Tagalog safety net does NOT trigger for clean English responses', async () => {
    mockStream.mockImplementation(async (_prompt, onToken) => {
      const englishResponse = 'Focus on Algebra today — it is your weakest topic at 32%.'
      onToken(englishResponse)
      return englishResponse
    })
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})
    await act(async () => {
      result.current.send('What should I focus on?')
      await new Promise(r => setTimeout(r, 200))
    })
    const assistantMsg = result.current.messages.find(m => m.role === 'assistant')
    expect(assistantMsg?.text).toBe('Focus on Algebra today — it is your weakest topic at 32%.')
  })

  it('does NOT clobber a fresh send when a previously-aborted stream resolves late', async () => {
    // First call: hang until manually resolved
    let resolveFirst: (() => void) | undefined
    mockStream.mockImplementationOnce(async () => {
      await new Promise<void>(r => { resolveFirst = r })
      return 'late response'
    })
    // Second call: resolves quickly with real tokens
    mockStream.mockImplementationOnce(async (_p, onToken) => {
      onToken('Quick reply')
      return 'Quick reply'
    })

    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})

    // Send #1 → starts streaming
    await act(async () => {
      result.current.send('first')
      await new Promise(r => setTimeout(r, 10))
    })
    expect(result.current.isStreaming).toBe(true)

    // User aborts #1
    act(() => { result.current.abort() })
    expect(result.current.isStreaming).toBe(false)

    // User immediately sends #2
    await act(async () => {
      result.current.send('second')
      await new Promise(r => setTimeout(r, 200))
    })

    // #2 should have populated cleanly
    const userMsgs = result.current.messages.filter(m => m.role === 'user')
    expect(userMsgs.length).toBe(2)
    expect(userMsgs[1]!.text).toBe('second')

    const assistant2 = result.current.messages.filter(m => m.role === 'assistant')[1]
    expect(assistant2?.text).toBe('Quick reply')
    expect(assistant2?.isStreaming).toBe(false)

    // Now #1 finally resolves — must NOT corrupt #2's bubble or isStreaming state
    if (resolveFirst) await act(async () => { resolveFirst!(); await new Promise(r => setTimeout(r, 50)) })

    // After late #1 resolution, #2 is unchanged
    const finalAssistant2 = result.current.messages.filter(m => m.role === 'assistant')[1]
    expect(finalAssistant2?.text).toBe('Quick reply')
    expect(finalAssistant2?.isStreaming).toBe(false)
    expect(result.current.isStreaming).toBe(false)
  })
})
