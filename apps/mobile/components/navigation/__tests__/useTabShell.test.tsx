/**
 * useTabShell (iOS redesign P2b): what both tab layouts need besides the
 * navigator itself, so the iOS native-tabs layout and the Android / web
 * floating-bar layout cannot drift apart.
 */
import React from 'react'
import { fireEvent, render, renderHook, screen } from '@testing-library/react-native'

let mockDb: object = { tag: 'db-1' }
jest.mock('../../../hooks/useDb', () => ({ useDb: () => mockDb }))
const mockSyncOnLaunch = jest.fn().mockResolvedValue(undefined)
jest.mock('../../../services/sync', () => ({ syncOnLaunch: (...a: unknown[]) => mockSyncOnLaunch(...a) }))
jest.mock('../../SyncErrorBanner', () => ({
  SyncErrorBanner: ({ onRetry }: { onRetry: () => void }) => {
    const { Pressable, Text } = require('react-native')
    return require('react').createElement(Pressable, { testID: 'sync-banner', onPress: onRetry },
      require('react').createElement(Text, null, 'banner'))
  },
}))

import { useTabShell } from '../useTabShell'

beforeEach(() => {
  mockDb = { tag: 'db-1' }
  mockSyncOnLaunch.mockClear()
})

function Shell() {
  const { syncBanner } = useTabShell()
  return <>{syncBanner}</>
}

describe('useTabShell', () => {
  it('retrySync re-runs the launch sync against the current database', () => {
    const { result } = renderHook(() => useTabShell())
    result.current.retrySync()
    expect(mockSyncOnLaunch).toHaveBeenCalledWith(mockDb)
  })

  it('renders the sync-error banner wired to the retry', () => {
    render(<Shell />)
    fireEvent.press(screen.getByTestId('sync-banner'))
    expect(mockSyncOnLaunch).toHaveBeenCalledTimes(1)
    expect(mockSyncOnLaunch).toHaveBeenCalledWith(mockDb)
  })

  it('keeps the retry stable while the database is the same, and follows a new one', () => {
    const { result, rerender } = renderHook(() => useTabShell())
    const first = result.current.retrySync
    rerender({})
    expect(result.current.retrySync).toBe(first)

    mockDb = { tag: 'db-2' }
    rerender({})
    expect(result.current.retrySync).not.toBe(first)
    result.current.retrySync()
    expect(mockSyncOnLaunch).toHaveBeenLastCalledWith({ tag: 'db-2' })
  })

  it('gives the shell the themed page ground', () => {
    const { lightTheme } = require('../../../theme/tokens')
    const { result } = renderHook(() => useTabShell())
    expect(result.current.backgroundColor).toBe(lightTheme.bg)
  })
})

