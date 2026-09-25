/**
 * useProfileName — one shared, cached read of the student's name per session.
 * Every tab mounts a TabHeader; they must not each hit the DB. A settings
 * write (updateSettings → invalidate('settings:')) refreshes every instance.
 */
import { renderHook, waitFor, act } from '@testing-library/react-native'
import { invalidate, _clearForTests } from '../../services/queryCache'

let mockDbName = 'Ana Reyes'
const mockLimit = jest.fn(async () => [{ fullName: mockDbName }])
const mockDb = {
  select: jest.fn(() => ({ from: () => ({ where: () => ({ limit: mockLimit }) }) })),
}

jest.mock('../useDb', () => ({ useDb: () => mockDb }))

import { useProfileName, _resetProfileNameForTests } from '../useProfileName'

beforeEach(() => {
  _clearForTests()
  _resetProfileNameForTests()
  mockDbName = 'Ana Reyes'
  mockLimit.mockClear()
})

describe('useProfileName', () => {
  it('returns the stored name', async () => {
    const { result } = renderHook(() => useProfileName())
    await waitFor(() => expect(result.current).toBe('Ana Reyes'))
  })

  it('reads the DB once however many headers mount', async () => {
    const a = renderHook(() => useProfileName())
    const b = renderHook(() => useProfileName())
    await waitFor(() => expect(a.result.current).toBe('Ana Reyes'))
    await waitFor(() => expect(b.result.current).toBe('Ana Reyes'))
    const c = renderHook(() => useProfileName())
    // A later mount gets the cached value on its first render — no flash, no read.
    expect(c.result.current).toBe('Ana Reyes')
    expect(mockLimit).toHaveBeenCalledTimes(1)
  })

  it('updates every instance when settings change', async () => {
    const a = renderHook(() => useProfileName())
    const b = renderHook(() => useProfileName())
    await waitFor(() => expect(a.result.current).toBe('Ana Reyes'))
    mockDbName = 'Ana R. Cruz'
    await act(async () => { invalidate('settings:') })
    await waitFor(() => expect(a.result.current).toBe('Ana R. Cruz'))
    await waitFor(() => expect(b.result.current).toBe('Ana R. Cruz'))
  })

  it('skips the lookup when disabled', async () => {
    const { result } = renderHook(() => useProfileName(false))
    await act(async () => {})
    expect(result.current).toBe('')
    expect(mockLimit).not.toHaveBeenCalled()
  })

  it('never throws when the read fails', async () => {
    mockLimit.mockRejectedValueOnce(new Error('db not ready'))
    const { result } = renderHook(() => useProfileName())
    await act(async () => {})
    expect(result.current).toBe('')
  })
})
