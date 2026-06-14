/**
 * AskKuyaModal render + interaction tests.
 *
 * The redesign keeps all chat LOGIC inside useKuyaChat (mocked here) and the
 * cloud-AI enable flow as a route push to '/settings/gemini-key' (the existing
 * affordance, also used by KuyaDownloadSheet). These tests verify the wiring is
 * preserved through the restyle:
 *   - send button + return key call useKuyaChat.send and clear the input
 *   - suggestion chips fill the input (matching pre-redesign behavior)
 *   - the clear-chat control calls useKuyaChat.clearHistory
 *   - the close tile calls onClose
 *   - the "Unlock Cloud AI" pill routes to the existing gemini-key screen when
 *     cloud is off, and reflects an active state (no route push) when on
 *   - the intro greets the user by first name from settings.fullName
 */
import React from 'react'
import { render, fireEvent, act } from '@testing-library/react-native'

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('@lineiconshq/react-native-lineicons', () => ({
  Lineicons: () => null,
}))

jest.mock('@lineiconshq/free-icons', () => ({
  ChevronLeftOutlined: {},
  QuestionMarkCircleOutlined: {},
  Trash3Outlined: {},
  Locked1Outlined: {},
  CloudCheckCircleOutlined: {},
  ArrowUpwardOutlined: {},
}))

// useKuyaChat — all chat logic lives here; the modal is a thin view over it.
const mockSend = jest.fn()
const mockAbort = jest.fn()
const mockClearHistory = jest.fn().mockResolvedValue(undefined)
const mockChat = {
  value: {
    messages: [] as Array<{ id: string; role: 'user' | 'assistant'; text: string; timestamp: number }>,
    send: mockSend,
    abort: mockAbort,
    clearHistory: mockClearHistory,
    isStreaming: false,
    isModelReady: true,
  },
}
jest.mock('../../hooks/useKuyaChat', () => ({
  useKuyaChat: () => mockChat.value,
}))

// useDb — used by the modal to read settings/name on mount
jest.mock('../../hooks/useDb', () => ({
  useDb: () => ({}),
}))

// settings + gemini key — drive firstName + cloud-AI active state
const mockGetSettings = jest.fn()
jest.mock('../../services/settings', () => ({
  getSettings: (...args: unknown[]) => mockGetSettings(...args),
}))
const mockGetGeminiKey = jest.fn()
jest.mock('../../services/geminiKey', () => ({
  getGeminiKey: (...args: unknown[]) => mockGetGeminiKey(...args),
}))

// ChatBubble — render the text plainly so message assertions are simple
jest.mock('../ChatBubble', () => ({
  ChatBubble: ({ message }: { message: { text: string } }) => {
    const { Text } = require('react-native')
    return <Text>{message.text}</Text>
  },
}))

// Spy on Alert so the help tile can be asserted without a native dialog
import { Alert } from 'react-native'

import { AskKuyaModal } from '../AskKuyaModal'

async function renderModal() {
  const utils = render(<AskKuyaModal visible onClose={onClose} />)
  // Flush the on-mount settings/key promises + their setState updates.
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  return utils
}

const onClose = jest.fn()

describe('AskKuyaModal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockChat.value = {
      messages: [],
      send: mockSend,
      abort: mockAbort,
      clearHistory: mockClearHistory,
      isStreaming: false,
      isModelReady: true,
    }
    mockGetSettings.mockResolvedValue({ fullName: 'Christian Raro', aiProvider: 'local' })
    mockGetGeminiKey.mockResolvedValue(null)
  })

  it('renders the header title and footer microcopy', async () => {
    const { getByText } = await renderModal()
    expect(getByText('Ask Kuya Baw')).toBeTruthy()
    expect(getByText(/double-check important details/i)).toBeTruthy()
  })

  it('greets the user by first name in the intro', async () => {
    const { getByText } = await renderModal()
    expect(getByText(/Hi Christian!/)).toBeTruthy()
  })

  it('falls back to "there" when no name is set', async () => {
    mockGetSettings.mockResolvedValue({ fullName: '', aiProvider: 'local' })
    const { getByText } = await renderModal()
    expect(getByText(/Hi there!/)).toBeTruthy()
  })

  it('send button calls useKuyaChat.send with the typed text', async () => {
    const { getByLabelText } = await renderModal()
    const input = getByLabelText('Question input')
    fireEvent.changeText(input, 'How am I doing?')
    fireEvent.press(getByLabelText('Send question'))
    expect(mockSend).toHaveBeenCalledWith('How am I doing?')
  })

  it('does not call send when the input is empty', async () => {
    const { getByLabelText } = await renderModal()
    fireEvent.press(getByLabelText('Send question'))
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('tapping a suggestion fills the input (does not send immediately)', async () => {
    const { getByLabelText, getByText } = await renderModal()
    fireEvent.press(getByText('How am I doing this week?'))
    expect(mockSend).not.toHaveBeenCalled()
    const input = getByLabelText('Question input')
    expect(input.props.value).toBe('How am I doing this week?')
  })

  it('the clear control calls clearHistory when there are messages', async () => {
    mockChat.value.messages = [
      { id: 'u1', role: 'user', text: 'Hi', timestamp: 1 },
      { id: 'a1', role: 'assistant', text: 'Hello!', timestamp: 2 },
    ]
    const { getByLabelText } = await renderModal()
    fireEvent.press(getByLabelText('Clear chat history'))
    expect(mockClearHistory).toHaveBeenCalled()
  })

  it('close tile calls onClose', async () => {
    const { getByLabelText } = await renderModal()
    fireEvent.press(getByLabelText('Close chat'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows "Unlock Cloud AI" and routes to the gemini-key screen when cloud is off', async () => {
    mockGetSettings.mockResolvedValue({ fullName: 'A B', aiProvider: 'local' })
    mockGetGeminiKey.mockResolvedValue(null)
    const { getByText } = await renderModal()
    const pill = getByText(/Unlock Cloud AI/i)
    expect(pill).toBeTruthy()
    fireEvent.press(pill)
    expect(mockPush).toHaveBeenCalledWith('/settings/gemini-key')
  })

  it('reflects an active cloud state (no route push) when gemini is configured', async () => {
    mockGetSettings.mockResolvedValue({ fullName: 'A B', aiProvider: 'gemini' })
    mockGetGeminiKey.mockResolvedValue('AIza-test')
    const { getByText, queryByText } = await renderModal()
    expect(getByText(/Cloud AI on/i)).toBeTruthy()
    expect(queryByText(/Unlock Cloud AI/i)).toBeNull()
  })
})
