import { renderHook } from '@testing-library/react-native'
import { usePreventLeave } from '../usePreventLeave'

const mockUsePreventRemove = jest.fn()
jest.mock('@react-navigation/native', () => ({
  usePreventRemove: (...args: unknown[]) => mockUsePreventRemove(...args),
}))

describe('usePreventLeave', () => {
  beforeEach(() => jest.clearAllMocks())

  it('forwards `shouldPrevent` straight to usePreventRemove', () => {
    renderHook(() => usePreventLeave(true, () => {}))
    expect(mockUsePreventRemove).toHaveBeenCalledWith(true, expect.any(Function))
  })

  it('invokes onAttemptLeave when React Navigation reports a blocked removal (gesture, hardware back, or router.back())', () => {
    const onAttemptLeave = jest.fn()
    renderHook(() => usePreventLeave(true, onAttemptLeave))
    const callback = mockUsePreventRemove.mock.calls[0]![1] as () => void
    expect(onAttemptLeave).not.toHaveBeenCalled()
    callback()
    expect(onAttemptLeave).toHaveBeenCalledTimes(1)
  })

  it('passes shouldPrevent=false through unchanged (e.g. once results are shown)', () => {
    renderHook(() => usePreventLeave(false, () => {}))
    expect(mockUsePreventRemove).toHaveBeenCalledWith(false, expect.any(Function))
  })
})
