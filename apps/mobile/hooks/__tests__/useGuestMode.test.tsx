import { renderHook, waitFor } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { useGuestMode } from '../useGuestMode'

let mockGuest = true
const mockIsGuest = jest.fn(async () => mockGuest)
jest.mock('../../services/guestSession', () => ({ isSignedOutWebGuest: () => mockIsGuest() }))

let mockState: 'guest' | 'held' = 'guest'
let releaseCatalog: () => void = () => {}
const mockStart = jest.fn(async () => ({
  state: mockState,
  catalog: new Promise<void>(r => { releaseCatalog = r }),
}))
jest.mock('../../services/guestPreview', () => ({ startGuestPreview: () => mockStart() }))
jest.mock('../useDb', () => {
  const db = {}
  return { useDb: () => db }
})

describe('useGuestMode', () => {
  let restoreOS: { restore(): void } | null = null
  beforeEach(() => {
    jest.clearAllMocks()
    mockGuest = true
    mockState = 'guest'
  })
  afterEach(() => { restoreOS?.restore(); restoreOS = null })

  it('native is always a member and never prepares a guest device', async () => {
    const { result } = renderHook(() => useGuestMode())
    expect(result.current).toEqual({ mode: 'member', catalogReady: true })
    await new Promise(r => setTimeout(r, 0))
    expect(mockIsGuest).not.toHaveBeenCalled()
    expect(mockStart).not.toHaveBeenCalled()
  })

  describe('web', () => {
    beforeEach(() => { restoreOS = jest.replaceProperty(Platform, 'OS', 'web') })

    it('a signed-out visitor becomes a guest, catalog ready once the sync settles', async () => {
      const { result } = renderHook(() => useGuestMode())
      expect(result.current.mode).toBe('checking')
      await waitFor(() => expect(result.current.mode).toBe('guest'))
      expect(result.current.catalogReady).toBe(false)
      releaseCatalog()
      await waitFor(() => expect(result.current.catalogReady).toBe(true))
    })

    it('a signed-in student is a member and the device is left alone', async () => {
      mockGuest = false
      const { result } = renderHook(() => useGuestMode())
      await waitFor(() => expect(result.current.mode).toBe('member'))
      expect(mockStart).not.toHaveBeenCalled()
    })

    it('a browser holding a signed-out account is reported as held', async () => {
      mockState = 'held'
      const { result } = renderHook(() => useGuestMode())
      await waitFor(() => expect(result.current.mode).toBe('held'))
    })
  })
})
