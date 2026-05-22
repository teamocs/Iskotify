import { renderHook, act } from '@testing-library/react-native'

jest.mock('../../services/llm', () => ({
  modelExists: jest.fn(),
  hasEnoughRam: jest.fn(),
  MODEL_PATH: '/mock/path/model.gguf',
  MODEL_DOWNLOAD_URL: 'https://example.com/model.gguf',
}))

jest.mock('react-native-background-downloader', () => ({
  __esModule: true,
  default: {
    download: jest.fn(),
  },
}))

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
}))

import { useModelDownload } from '../useModelDownload'
import { modelExists, hasEnoughRam } from '../../services/llm'

const mockModelExists = modelExists as jest.MockedFunction<typeof modelExists>
const mockHasEnoughRam = hasEnoughRam as jest.MockedFunction<typeof hasEnoughRam>

describe('useModelDownload', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sets status to ready when model already exists', async () => {
    mockModelExists.mockResolvedValue(true)
    mockHasEnoughRam.mockReturnValue(true)
    const { result } = renderHook(() => useModelDownload())
    await act(async () => {})
    expect(result.current.modelStatus).toBe('ready')
  })

  it('sets status to absent when model not found and RAM sufficient', async () => {
    mockModelExists.mockResolvedValue(false)
    mockHasEnoughRam.mockReturnValue(true)
    const { result } = renderHook(() => useModelDownload())
    await act(async () => {})
    expect(result.current.modelStatus).toBe('absent')
  })

  it('sets status to unsupported when RAM insufficient', async () => {
    mockModelExists.mockResolvedValue(false)
    mockHasEnoughRam.mockReturnValue(false)
    const { result } = renderHook(() => useModelDownload())
    await act(async () => {})
    expect(result.current.modelStatus).toBe('unsupported')
  })

  it('exposes progress as 0 initially', async () => {
    mockModelExists.mockResolvedValue(false)
    mockHasEnoughRam.mockReturnValue(true)
    const { result } = renderHook(() => useModelDownload())
    await act(async () => {})
    expect(result.current.progress).toBe(0)
  })
})
