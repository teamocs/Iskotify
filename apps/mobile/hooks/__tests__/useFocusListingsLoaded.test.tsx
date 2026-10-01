// P4: screens that show or hide things by focus (the Practice tab's estimator
// row) must wait for the first read, or an empty list flashes as "no focus".
import { renderHook, waitFor } from '@testing-library/react-native'
import { useFocusListings } from '../useFocusListings'

jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return { useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) }
})
jest.mock('../../services/sync', () => ({ syncOnLaunch: jest.fn(), schedulePushUserData: jest.fn() }))
jest.mock('../../services/queryCache', () => ({ invalidate: jest.fn() }))
jest.mock('../../db/webPersist', () => ({ scheduleWebPersist: jest.fn() }))
jest.mock('../../lib/analytics', () => ({ capture: jest.fn() }))

type Gate = { resolve: (rows: unknown[]) => void; reject: (err: unknown) => void; pending: Promise<unknown[]> }
jest.mock('../useDb', () => {
  const gate = {} as Gate
  const db = { select: () => ({ from: () => ({ leftJoin: () => ({ orderBy: () => gate.pending }) }) }) }
  return { useDb: () => db, __gate: gate }
})
const { __gate: gate } = jest.requireMock('../useDb') as { __gate: Gate }

beforeEach(() => {
  gate.pending = new Promise<unknown[]>((resolve, reject) => { gate.resolve = resolve; gate.reject = reject })
})

it('is not loaded until the first focus read has finished, then loaded with the rows', async () => {
  const { result } = renderHook(() => useFocusListings())
  expect(result.current.loaded).toBe(false)
  expect(result.current.focusListings).toEqual([])
  gate.resolve([{ slug: 'upcat', priority: 1, addedAt: 0, title: 'UPCAT', type: 'exam' }])
  await waitFor(() => expect(result.current.loaded).toBe(true))
  expect(result.current.focusListings.map(f => f.slug)).toEqual(['upcat'])
})

it('a failed read still finishes loading (empty focus, a warning, no unhandled rejection) so focus-gated UI never stays hidden', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
  const { result } = renderHook(() => useFocusListings())
  gate.reject(new Error('db closed'))
  await waitFor(() => expect(result.current.loaded).toBe(true))
  expect(result.current.focusListings).toEqual([])
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('[useFocusListings]'), expect.any(Error))
  warn.mockRestore()
})
