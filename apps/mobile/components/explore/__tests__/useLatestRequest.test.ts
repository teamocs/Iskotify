import { renderHook } from '@testing-library/react-native'
import { useLatestRequest } from '../useLatestRequest'

describe('useLatestRequest', () => {
  it('a request is current until a newer one starts', () => {
    const { result } = renderHook(() => useLatestRequest())
    const first = result.current()
    expect(first()).toBe(true)
    const second = result.current()
    expect(first()).toBe(false)
    expect(second()).toBe(true)
  })

  it('no request is current once the component unmounts', () => {
    const { result, unmount } = renderHook(() => useLatestRequest())
    const req = result.current()
    unmount()
    expect(req()).toBe(false)
  })

  it('returns a stable starter across renders (safe in hook dependencies)', () => {
    const { result, rerender } = renderHook(() => useLatestRequest())
    const before = result.current
    rerender({})
    expect(result.current).toBe(before)
  })
})
