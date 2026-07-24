import React from 'react'
import { Pressable, Text } from 'react-native'
import { render, fireEvent, waitFor } from '@testing-library/react-native'

// ── Lightweight stand-ins for the heavy modal/sheet components ────────────────
jest.mock('../../components/AskKuyaModal', () => {
  const { Text: RNText } = require('react-native')
  return {
    AskKuyaModal: ({ visible }: { visible: boolean }) =>
      visible ? <RNText testID="chat-modal">chat-open</RNText> : null,
  }
})
jest.mock('../../components/KuyaDownloadSheet', () => {
  const { Text: RNText } = require('react-native')
  return {
    KuyaDownloadSheet: ({ visible }: { visible: boolean }) =>
      visible ? <RNText testID="download-sheet">sheet-open</RNText> : null,
  }
})

jest.mock('../../hooks/useDb', () => ({
  useDb: () => ({ __mockDb: true }),
}))

jest.mock('../../lib/analytics', () => ({
  capture: jest.fn(),
}))

jest.mock('../../services/llm', () => ({
  modelExists: jest.fn().mockResolvedValue(true),
  hasEnoughRam: jest.fn().mockReturnValue(true),
  warmUpLlama: jest.fn(),
}))

jest.mock('../../services/geminiKey', () => ({
  getGeminiKey: jest.fn().mockResolvedValue(null),
}))

jest.mock('../../services/settings', () => ({
  getSettings: jest.fn().mockResolvedValue({ aiProvider: 'local' }),
}))

const mockGetAiConfig = jest.fn()
jest.mock('../../services/aiConfig', () => ({
  getAiConfig: (...args: unknown[]) => mockGetAiConfig(...args),
}))

import { Alert, Platform } from 'react-native'
import { KuyaChatProvider, useKuyaChatModal } from '../KuyaChatProvider'
import { capture } from '../../lib/analytics'
import { modelExists } from '../../services/llm'

const mockCapture = capture as jest.MockedFunction<typeof capture>
const mockModelExists = modelExists as jest.MockedFunction<typeof modelExists>

function OpenButton() {
  const { open } = useKuyaChatModal()
  return <Pressable onPress={() => { void open() }}><Text>open</Text></Pressable>
}

function renderProvider() {
  return render(
    <KuyaChatProvider>
      <OpenButton />
    </KuyaChatProvider>,
  )
}

describe('KuyaChatProvider — kill-switch defense in depth', () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  const originalOS = Platform.OS

  beforeEach(() => {
    jest.clearAllMocks()
    alertSpy.mockClear()
    mockModelExists.mockResolvedValue(true)
    Platform.OS = 'android'
  })

  afterAll(() => {
    Platform.OS = originalOS
  })

  it('shows the kill-switch alert and does NOT open the chat when chatEnabled is false', async () => {
    mockGetAiConfig.mockResolvedValue({ chatEnabled: false, ragBlocksEnabled: {} })
    const { getByText, queryByTestId } = renderProvider()

    fireEvent.press(getByText('open'))

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('', 'Kuya Baw is taking a break — check back soon.'))
    expect(queryByTestId('chat-modal')).toBeNull()
    expect(queryByTestId('download-sheet')).toBeNull()
    expect(mockCapture).not.toHaveBeenCalled()
  })

  it('shows the kill-switch alert when the config row is missing (chatEnabled default false)', async () => {
    mockGetAiConfig.mockResolvedValue({ chatEnabled: false, ragBlocksEnabled: {} })
    const { getByText, queryByTestId } = renderProvider()

    fireEvent.press(getByText('open'))

    await waitFor(() => expect(alertSpy).toHaveBeenCalled())
    expect(queryByTestId('chat-modal')).toBeNull()
  })

  it('fails closed (shows the alert) when getAiConfig itself rejects', async () => {
    mockGetAiConfig.mockRejectedValue(new Error('db read failed'))
    const { getByText, queryByTestId } = renderProvider()

    fireEvent.press(getByText('open'))

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('', 'Kuya Baw is taking a break — check back soon.'))
    expect(queryByTestId('chat-modal')).toBeNull()
    expect(mockCapture).not.toHaveBeenCalled()
  })

  it('proceeds past the kill-switch (reaches the model-check path) when chatEnabled is true', async () => {
    mockGetAiConfig.mockResolvedValue({ chatEnabled: true, ragBlocksEnabled: {} })
    mockModelExists.mockResolvedValue(true)
    const { getByText, findByTestId } = renderProvider()

    fireEvent.press(getByText('open'))

    // Local model exists → chat opens directly (no download sheet).
    await findByTestId('chat-modal')
    expect(alertSpy).not.toHaveBeenCalled()
    expect(mockCapture).toHaveBeenCalledWith('kuya_chat_opened', { platform: 'android' })
  })
})
