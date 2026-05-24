import { renderHook, act } from '@testing-library/react-native'

let mockAppStateHandler: ((state: string) => void) | null = null
const mockBackHandlerCb = jest.fn<boolean, []>()
let mockBackHandlerRegistered = false

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: {
    addEventListener: jest.fn((event: string, cb: (s: string) => void) => {
      if (event === 'change') mockAppStateHandler = cb
      return { remove: jest.fn(() => { mockAppStateHandler = null }) }
    }),
    currentState: 'active',
  },
  BackHandler: {
    addEventListener: jest.fn((event: string, cb: () => boolean) => {
      mockBackHandlerRegistered = true
      mockBackHandlerCb.mockImplementation(cb)
      return { remove: jest.fn(() => { mockBackHandlerRegistered = false }) }
    }),
  },
  Alert: {
    alert: jest.fn((_title: string, _msg: string | undefined, buttons?: Array<{ text: string; onPress?: () => void; style?: string }>) => {
      // Simulate user tapping the destructive button if present
      const destructive = buttons?.find(b => b.style === 'destructive')
      if (destructive?.onPress) destructive.onPress()
    }),
  },
}))

import { preventScreenCaptureAsync, allowScreenCaptureAsync } from 'expo-screen-capture'
import { setVisibilityAsync, setBehaviorAsync } from 'expo-navigation-bar'
import { Alert, BackHandler } from 'react-native'

const mockPrevent = preventScreenCaptureAsync as jest.MockedFunction<typeof preventScreenCaptureAsync>
const mockAllow = allowScreenCaptureAsync as jest.MockedFunction<typeof allowScreenCaptureAsync>
const mockSetVisibility = setVisibilityAsync as jest.MockedFunction<typeof setVisibilityAsync>
const mockSetBehavior = setBehaviorAsync as jest.MockedFunction<typeof setBehaviorAsync>
const mockAlert = Alert.alert as jest.MockedFunction<typeof Alert.alert>
const mockBackHandlerAdd = BackHandler.addEventListener as jest.MockedFunction<typeof BackHandler.addEventListener>

import { useFocusMode } from '../useFocusMode'

beforeEach(() => {
  jest.clearAllMocks()
  mockAppStateHandler = null
  mockBackHandlerRegistered = false
})

describe('useFocusMode', () => {
  const baseArgs = {
    enabled: true,
    active: true,
    onTimerPause: jest.fn(),
    onTimerResume: jest.fn(),
    onExitConfirmed: jest.fn(),
  }

  it('does NOT activate when enabled=false', () => {
    renderHook(() => useFocusMode({ ...baseArgs, enabled: false }))
    expect(mockPrevent).not.toHaveBeenCalled()
    expect(mockSetVisibility).not.toHaveBeenCalled()
    expect(mockBackHandlerAdd).not.toHaveBeenCalled()
  })

  it('does NOT activate when active=false (ready/results phase)', () => {
    renderHook(() => useFocusMode({ ...baseArgs, active: false }))
    expect(mockPrevent).not.toHaveBeenCalled()
    expect(mockSetVisibility).not.toHaveBeenCalled()
  })

  it('calls preventScreenCaptureAsync on activation', async () => {
    renderHook(() => useFocusMode(baseArgs))
    await act(async () => {})
    expect(mockPrevent).toHaveBeenCalledTimes(1)
  })

  it('hides navigation bar on activation (Android)', async () => {
    renderHook(() => useFocusMode(baseArgs))
    await act(async () => {})
    expect(mockSetVisibility).toHaveBeenCalledWith('hidden')
    expect(mockSetBehavior).toHaveBeenCalledWith('inset-swipe')
  })

  it('registers a BackHandler listener on activation', async () => {
    renderHook(() => useFocusMode(baseArgs))
    await act(async () => {})
    expect(mockBackHandlerAdd).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function))
  })

  it('calls allowScreenCaptureAsync + restores nav bar on unmount', async () => {
    const { unmount } = renderHook(() => useFocusMode(baseArgs))
    await act(async () => {})
    mockAllow.mockClear()
    mockSetVisibility.mockClear()
    unmount()
    await act(async () => {})
    expect(mockAllow).toHaveBeenCalledTimes(1)
    expect(mockSetVisibility).toHaveBeenCalledWith('visible')
  })

  it('isPaused=true and onTimerPause called when AppState goes to background', async () => {
    const onTimerPause = jest.fn()
    const { result } = renderHook(() => useFocusMode({ ...baseArgs, onTimerPause }))
    await act(async () => {})
    expect(result.current.isPaused).toBe(false)

    act(() => { mockAppStateHandler?.('background') })
    expect(result.current.isPaused).toBe(true)
    expect(onTimerPause).toHaveBeenCalledTimes(1)
  })

  it('isPaused stays true when AppState returns to active (user must tap Resume)', async () => {
    const onTimerResume = jest.fn()
    const { result } = renderHook(() => useFocusMode({ ...baseArgs, onTimerResume }))
    await act(async () => {})

    act(() => { mockAppStateHandler?.('background') })
    expect(result.current.isPaused).toBe(true)

    act(() => { mockAppStateHandler?.('active') })
    expect(result.current.isPaused).toBe(true)  // STILL paused — overlay should be visible
    expect(onTimerResume).not.toHaveBeenCalled()
  })

  it('resumeSession() flips isPaused back and calls onTimerResume', async () => {
    const onTimerResume = jest.fn()
    const { result } = renderHook(() => useFocusMode({ ...baseArgs, onTimerResume }))
    await act(async () => {})

    act(() => { mockAppStateHandler?.('background') })
    expect(result.current.isPaused).toBe(true)

    act(() => { result.current.resumeSession() })
    expect(result.current.isPaused).toBe(false)
    expect(onTimerResume).toHaveBeenCalledTimes(1)
  })

  it('hardware back press shows Alert and calls onExitConfirmed when user confirms', async () => {
    const onExitConfirmed = jest.fn()
    renderHook(() => useFocusMode({ ...baseArgs, onExitConfirmed }))
    await act(async () => {})

    // Trigger the back handler that was registered
    const handler = mockBackHandlerAdd.mock.calls[0]?.[1] as (() => boolean)
    const consumed = handler?.()
    expect(consumed).toBe(true)  // back press consumed
    expect(mockAlert).toHaveBeenCalledWith(
      'Exit session?',
      expect.stringContaining('progress'),
      expect.any(Array),
    )
    // Our mock Alert auto-taps the destructive button → onExitConfirmed fires
    expect(onExitConfirmed).toHaveBeenCalledTimes(1)
  })

  it('endSession() calls onTimerPause (the caller handles navigation)', async () => {
    const onTimerPause = jest.fn()
    const { result } = renderHook(() => useFocusMode({ ...baseArgs, onTimerPause }))
    await act(async () => {})
    onTimerPause.mockClear()  // ignore the initial mount call (if any)

    act(() => { result.current.endSession() })
    expect(onTimerPause).toHaveBeenCalledTimes(1)
  })
})
