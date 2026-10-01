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

jest.mock('../useDb', () => {
  const gate: { resolve: (rows: unknown[]) => void } = { resolve: () => {} }
  const pending = new Promise<unknown[]>(r => { gate.resolve = r })
  const db = { select: () => ({ from: () => ({ leftJoin: () => ({ orderBy: () => pending }) }) }) }
  return { useDb: () => db, __gate: gate }
})
const { __gate: gate } = jest.requireMock('../useDb') as { __gate: { resolve: (rows: unknown[]) => void } }

it('is not loaded until the first focus read has finished, then loaded with the rows', async () => {
  const { result } = renderHook(() => useFocusListings())
  expect(result.current.loaded).toBe(false)
  expect(result.current.focusListings).toEqual([])
  gate.resolve([{ slug: 'upcat', priority: 1, addedAt: 0, title: 'UPCAT', type: 'exam' }])
  await waitFor(() => expect(result.current.loaded).toBe(true))
  expect(result.current.focusListings.map(f => f.slug)).toEqual(['upcat'])
})
