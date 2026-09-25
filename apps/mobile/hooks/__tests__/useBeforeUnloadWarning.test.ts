import { renderHook } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { useBeforeUnloadWarning } from '../useBeforeUnloadWarning'

const mockFlush = jest.fn()
jest.mock('../../db/webPersist', () => ({
  flushWebPersist: (...a: unknown[]) => mockFlush(...a),
}))

// Review finding #3 (MEDIUM): on web there is no beforeunload handling, so a
// closed tab can lose the latest answer to db/webPersist.ts's ~2s debounce.
describe('useBeforeUnloadWarning', () => {
  let originalOS: typeof Platform.OS
  let addSpy: jest.SpyInstance
  let removeSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    originalOS = Platform.OS
    ;(global as any).window = { addEventListener: jest.fn(), removeEventListener: jest.fn() }
    addSpy = (window as any).addEventListener
    removeSpy = (window as any).removeEventListener
  })

  afterEach(() => {
    Platform.OS = originalOS
    delete (global as any).window
  })

  it('does nothing on native (non-web) platforms', () => {
    Platform.OS = 'ios'
    renderHook(() => useBeforeUnloadWarning(true))
    expect(addSpy).not.toHaveBeenCalled()
  })

  it('does nothing on web when shouldWarn is false', () => {
    Platform.OS = 'web'
    renderHook(() => useBeforeUnloadWarning(false))
    expect(addSpy).not.toHaveBeenCalled()
  })

  it('registers a beforeunload listener on web while shouldWarn is true', () => {
    Platform.OS = 'web'
    renderHook(() => useBeforeUnloadWarning(true))
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
  })

  it('removes the listener on unmount', () => {
    Platform.OS = 'web'
    const { unmount } = renderHook(() => useBeforeUnloadWarning(true))
    const handler = addSpy.mock.calls[0]![1]
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', handler)
  })

  it('removes the old listener and adds a new one when shouldWarn flips false then true again', () => {
    Platform.OS = 'web'
    const { rerender } = renderHook(
      ({ warn }: { warn: boolean }) => useBeforeUnloadWarning(warn),
      { initialProps: { warn: true } },
    )
    expect(addSpy).toHaveBeenCalledTimes(1)
    rerender({ warn: false })
    expect(removeSpy).toHaveBeenCalledTimes(1)
    rerender({ warn: true })
    expect(addSpy).toHaveBeenCalledTimes(2)
  })

  it('the handler flushes the pending web persist and warns (sets returnValue / preventDefault)', () => {
    Platform.OS = 'web'
    renderHook(() => useBeforeUnloadWarning(true))
    const handler = addSpy.mock.calls[0]![1] as (e: any) => void
    const fakeEvent = { preventDefault: jest.fn(), returnValue: undefined as unknown }
    handler(fakeEvent)
    expect(mockFlush).toHaveBeenCalledTimes(1)
    expect(fakeEvent.preventDefault).toHaveBeenCalled()
    expect(fakeEvent.returnValue).not.toBeUndefined()
  })
})
