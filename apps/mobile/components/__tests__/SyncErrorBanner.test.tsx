/**
 * SyncErrorBanner unit tests.
 *
 * Strategy (mirrors WebSetupOverlay.test.tsx):
 *  - theme/ThemeContext is mapped to __mocks__/themeContextMock.js by jest.config.js
 *    so useTheme() works without a real DB.
 *  - react-native-safe-area-context is mocked with zero insets (same pattern as
 *    AskKuyaModal.test.tsx).
 *  - We drive the syncStatus store directly via its exported helpers.
 */
import React from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react-native'

import {
  resetSyncStatus,
  markSyncStart,
  markSyncDone,
  markSyncError,
} from '../../services/syncStatus'

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

import { SyncErrorBanner } from '../SyncErrorBanner'

const MESSAGE = /Couldn't refresh data/

beforeEach(() => {
  resetSyncStatus()
})

describe('SyncErrorBanner', () => {
  it('renders null when there is no error (initial state)', () => {
    const { toJSON } = render(<SyncErrorBanner onRetry={() => {}} />)
    expect(toJSON()).toBeNull()
  })

  it('renders null after a successful sync (start → done, no error)', () => {
    act(() => {
      markSyncStart()
      markSyncDone()
    })
    const { toJSON } = render(<SyncErrorBanner onRetry={() => {}} />)
    expect(toJSON()).toBeNull()
  })

  it('shows the message when a sync failed (error set, not syncing)', () => {
    act(() => {
      markSyncStart()
      markSyncError('network down')
      markSyncDone() // finally-block: isSyncing=false, error preserved
    })
    render(<SyncErrorBanner onRetry={() => {}} />)
    expect(screen.getByText(MESSAGE)).toBeTruthy()
  })

  it('stays hidden while a sync is in flight even if an error is already set', () => {
    act(() => {
      markSyncStart()
      markSyncError('network down') // error raised mid-sync; markSyncDone not yet called
    })
    const { toJSON } = render(<SyncErrorBanner onRetry={() => {}} />)
    expect(toJSON()).toBeNull()
  })

  it('has alert accessibility role when visible', () => {
    act(() => {
      markSyncError('network down')
    })
    render(<SyncErrorBanner onRetry={() => {}} />)
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('Retry button calls the onRetry handler', () => {
    act(() => {
      markSyncError('network down')
    })
    const onRetry = jest.fn()
    render(<SyncErrorBanner onRetry={onRetry} />)

    fireEvent.press(screen.getByRole('button', { name: /retry sync/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('hides while a retry is running (markSyncStart clears the error)', () => {
    act(() => {
      markSyncError('network down')
    })
    render(<SyncErrorBanner onRetry={() => {}} />)
    expect(screen.getByText(MESSAGE)).toBeTruthy()

    act(() => {
      markSyncStart()
    })
    expect(screen.queryByText(MESSAGE)).toBeNull()
  })

  it('dismiss (✕) hides the banner', () => {
    act(() => {
      markSyncError('network down')
    })
    render(<SyncErrorBanner onRetry={() => {}} />)
    expect(screen.getByText(MESSAGE)).toBeTruthy()

    fireEvent.press(screen.getByRole('button', { name: /dismiss sync error/i }))
    expect(screen.queryByText(MESSAGE)).toBeNull()
  })

  it('stays dismissed while the SAME error value persists', () => {
    act(() => {
      markSyncError('network down')
    })
    render(<SyncErrorBanner onRetry={() => {}} />)
    fireEvent.press(screen.getByRole('button', { name: /dismiss sync error/i }))
    expect(screen.queryByText(MESSAGE)).toBeNull()

    // Same message again — snapshot is keyed off the error value, stays hidden.
    act(() => {
      markSyncError('network down')
    })
    expect(screen.queryByText(MESSAGE)).toBeNull()
  })

  it('re-appears after dismiss when a NEW (different) error arrives', () => {
    act(() => {
      markSyncError('first failure')
    })
    render(<SyncErrorBanner onRetry={() => {}} />)
    fireEvent.press(screen.getByRole('button', { name: /dismiss sync error/i }))
    expect(screen.queryByText(MESSAGE)).toBeNull()

    act(() => {
      markSyncError('second failure')
    })
    expect(screen.getByText(MESSAGE)).toBeTruthy()
  })

  it('re-appears after dismiss + retry cycle that fails again with a different error', () => {
    act(() => {
      markSyncError('first failure')
    })
    render(<SyncErrorBanner onRetry={() => {}} />)
    fireEvent.press(screen.getByRole('button', { name: /dismiss sync error/i }))

    // Retry cycle: start clears error, fails again with a new message, done.
    act(() => {
      markSyncStart()
      markSyncError('second failure')
      markSyncDone()
    })
    expect(screen.getByText(MESSAGE)).toBeTruthy()
  })
})
