import { renderHook, act } from '@testing-library/react-native'

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/mock/',
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
}))

jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react')
    React.useEffect(() => cb(), [])
  },
}))

jest.mock('../../services/llm', () => ({
  modelExists: jest.fn(),
  hasEnoughRam: jest.fn(),
  ensureModelDirectory: jest.fn().mockResolvedValue(undefined),
  resolveDownloadUrl: jest.fn().mockResolvedValue('https://example.com/model.gguf'),
  MODEL_PATH: '/mock/path/google_gemma-3-1b-it-Q8_0.gguf',
  MODEL_FILENAME: 'google_gemma-3-1b-it-Q8_0.gguf',
  MODEL_DOWNLOAD_URL: 'https://example.com/model.gguf',
}))

jest.mock('@kesha-antonov/react-native-background-downloader', () => ({
  __esModule: true,
  createDownloadTask: jest.fn(),
  setConfig: jest.fn(),
  completeHandler: jest.fn(),
  getExistingDownloadTasks: jest.fn().mockResolvedValue([]),
}))

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
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

  it('exposes lastError as null initially', async () => {
    mockModelExists.mockResolvedValue(false)
    mockHasEnoughRam.mockReturnValue(true)
    const { result } = renderHook(() => useModelDownload())
    await act(async () => {})
    expect(result.current.lastError).toBeNull()
  })

  it('startDownload sets status to downloading and invokes createDownloadTask', async () => {
    mockModelExists.mockResolvedValue(false)
    mockHasEnoughRam.mockReturnValue(true)

    const fakeTask = {
      begin: jest.fn().mockReturnThis(),
      progress: jest.fn().mockReturnThis(),
      done: jest.fn().mockReturnThis(),
      error: jest.fn().mockReturnThis(),
      start: jest.fn(),
      stop: jest.fn(),
    }
    const { createDownloadTask, setConfig } = require('@kesha-antonov/react-native-background-downloader')
    ;(createDownloadTask as jest.Mock).mockReturnValue(fakeTask)

    const { result } = renderHook(() => useModelDownload())
    await act(async () => {})

    await act(async () => {
      result.current.startDownload()
    })

    expect(result.current.modelStatus).toBe('downloading')
    expect(createDownloadTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'gemma-model', url: 'https://example.com/model.gguf' })
    )
    expect(setConfig).toHaveBeenCalledWith(
      expect.objectContaining({ showNotificationsEnabled: true })
    )
    expect(fakeTask.start).toHaveBeenCalledTimes(1)
  })

  it('exposes bytesDownloaded and bytesTotal as 0 initially', async () => {
    mockModelExists.mockResolvedValue(false)
    mockHasEnoughRam.mockReturnValue(true)
    const { result } = renderHook(() => useModelDownload())
    await act(async () => {})
    expect(result.current.bytesDownloaded).toBe(0)
    expect(result.current.bytesTotal).toBe(0)
  })

  it('startDownload triggers generalized stale-model cleanup before downloading', async () => {
    mockModelExists.mockResolvedValue(false)
    mockHasEnoughRam.mockReturnValue(true)

    const fs = require('expo-file-system/legacy')
    // Simulate two stale files in the models dir
    fs.readDirectoryAsync.mockResolvedValue([
      'google_gemma-3-1b-it-Q4_K_M.gguf',  // old Q4
      'google_gemma-4-E2B-it-Q4_K_M.gguf', // old E2B (3.4 GB)
      'google_gemma-3-1b-it-Q8_0.gguf',    // current — must NOT be deleted
    ])

    const fakeTask = {
      begin: jest.fn().mockReturnThis(),
      progress: jest.fn().mockReturnThis(),
      done: jest.fn().mockReturnThis(),
      error: jest.fn().mockReturnThis(),
      start: jest.fn(),
      stop: jest.fn(),
    }
    const { createDownloadTask } = require('@kesha-antonov/react-native-background-downloader')
    ;(createDownloadTask as jest.Mock).mockReturnValue(fakeTask)

    const { result } = renderHook(() => useModelDownload())
    await act(async () => {})

    await act(async () => {
      result.current.startDownload()
      await new Promise(r => setTimeout(r, 50))
    })

    // readDirectoryAsync should have been called for cleanup
    expect(fs.readDirectoryAsync).toHaveBeenCalled()
    // The two stale gguf files should have been deleted
    const deletedPaths: string[] = fs.deleteAsync.mock.calls.map((c: [string]) => c[0])
    expect(deletedPaths.some(p => p.includes('Q4_K_M') && p.includes('gemma-3'))).toBe(true)
    expect(deletedPaths.some(p => p.includes('gemma-4-E2B'))).toBe(true)
    // Current Q8_0 must NOT be deleted
    expect(deletedPaths.every(p => !p.includes('Q8_0'))).toBe(true)
  })
})
