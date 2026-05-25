import { renderHook, act } from '@testing-library/react-native'

// ── DB mock ───────────────────────────────────────────────────────────────────
// Variables prefixed with `mock` are accessible inside jest.mock factory (babel hoist rule)
const mockOrderBy = jest.fn().mockResolvedValue([])
const mockFrom = jest.fn(() => ({ orderBy: mockOrderBy }))
const mockValues = jest.fn().mockResolvedValue(undefined)
const mockInsert = jest.fn(() => ({ values: mockValues }))
const mockDelete = jest.fn().mockResolvedValue(undefined)
const mockTransaction = jest.fn().mockImplementation(
  async (fn: (tx: { insert: typeof mockInsert }) => Promise<void>) => {
    await fn({ insert: mockInsert })
  },
)

jest.mock('../useDb', () => ({
  useDb: () => ({
    select: jest.fn(() => ({ from: mockFrom })),
    insert: mockInsert,
    delete: mockDelete,
    transaction: mockTransaction,
  }),
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
    mockOrderBy.mockResolvedValue([])
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

  it('loads chat history from DB on mount', async () => {
    mockOrderBy.mockResolvedValueOnce([
      { id: 1, role: 'user', text: 'Hello?', mode: 'topic', createdAt: 1000 },
      { id: 2, role: 'assistant', text: 'Hi there!', mode: 'topic', createdAt: 1001 },
    ])
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0]!.text).toBe('Hello?')
    expect(result.current.messages[0]!.role).toBe('user')
    expect(result.current.messages[1]!.text).toBe('Hi there!')
    expect(result.current.messages[1]!.role).toBe('assistant')
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
      result.current.send('hello?')
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
      result.current.send('Ano?')
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

  it('saves user+assistant messages to DB after successful stream', async () => {
    mockStream.mockImplementation(async (_p, onToken) => {
      onToken('Good answer!')
      return 'Good answer!'
    })
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})
    await act(async () => {
      result.current.send('hello?')
      await new Promise(r => setTimeout(r, 200))
    })
    expect(mockTransaction).toHaveBeenCalledTimes(1)
    // Both messages passed to insert inside the transaction
    expect(mockValues).toHaveBeenCalledTimes(2)
    const calls = mockValues.mock.calls
    expect(calls[0]![0].role).toBe('user')
    expect(calls[0]![0].text).toBe('hello?')
    expect(calls[1]![0].role).toBe('assistant')
    expect(calls[1]![0].text).toBe('Good answer!')
  })

  it('does NOT save to DB when stream errors', async () => {
    mockStream.mockRejectedValue(new Error('crash'))
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})
    await act(async () => {
      result.current.send('hello?')
      await new Promise(r => setTimeout(r, 200))
    })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('does NOT save to DB when stream is aborted', async () => {
    let resolveStream: (() => void) | undefined
    mockStream.mockImplementation(async () => {
      await new Promise<void>(r => { resolveStream = r })
      return ''
    })
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})
    await act(async () => {
      result.current.send('hello?')
      await new Promise(r => setTimeout(r, 10))
    })
    act(() => { result.current.abort() })
    if (resolveStream) {
      await act(async () => { resolveStream!(); await new Promise(r => setTimeout(r, 50)) })
    }
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('clearHistory deletes from DB and clears messages state', async () => {
    mockOrderBy.mockResolvedValueOnce([
      { id: 1, role: 'user', text: 'Hi', mode: 'topic', createdAt: 1000 },
    ])
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })
    expect(result.current.messages).toHaveLength(1)
    await act(async () => { await result.current.clearHistory() })
    expect(mockDelete).toHaveBeenCalled()
    expect(result.current.messages).toHaveLength(0)
  })

  it('passes existing messages as history to the LLM prompt', async () => {
    mockOrderBy.mockResolvedValueOnce([
      { id: 1, role: 'user', text: 'Prior question', mode: 'topic', createdAt: 1000 },
      { id: 2, role: 'assistant', text: 'Prior answer', mode: 'topic', createdAt: 1001 },
    ])
    mockStream.mockImplementation(async () => 'ok')
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })
    await act(async () => {
      result.current.send('hello?')
      await new Promise(r => setTimeout(r, 200))
    })
    const promptArg = mockStream.mock.calls[0]?.[0] as string
    expect(promptArg).toContain('Prior question')
    expect(promptArg).toContain('Prior answer')
  })

  it('does NOT clobber a fresh send when a previously-aborted stream resolves late', async () => {
    let resolveFirst: (() => void) | undefined
    mockStream.mockImplementationOnce(async () => {
      await new Promise<void>(r => { resolveFirst = r })
      return 'late response'
    })
    mockStream.mockImplementationOnce(async (_p, onToken) => {
      onToken('Quick reply')
      return 'Quick reply'
    })

    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})

    await act(async () => {
      result.current.send('first')
      await new Promise(r => setTimeout(r, 10))
    })
    expect(result.current.isStreaming).toBe(true)

    act(() => { result.current.abort() })
    expect(result.current.isStreaming).toBe(false)

    await act(async () => {
      result.current.send('second')
      await new Promise(r => setTimeout(r, 200))
    })

    const userMsgs = result.current.messages.filter(m => m.role === 'user')
    expect(userMsgs.length).toBe(2)
    expect(userMsgs[1]!.text).toBe('second')

    const assistant2 = result.current.messages.filter(m => m.role === 'assistant')[1]
    expect(assistant2?.text).toBe('Quick reply')
    expect(assistant2?.isStreaming).toBe(false)

    if (resolveFirst) await act(async () => { resolveFirst!(); await new Promise(r => setTimeout(r, 50)) })

    const finalAssistant2 = result.current.messages.filter(m => m.role === 'assistant')[1]
    expect(finalAssistant2?.text).toBe('Quick reply')
    expect(finalAssistant2?.isStreaming).toBe(false)
    expect(result.current.isStreaming).toBe(false)
  })
})
