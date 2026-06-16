/**
 * WebSetupOverlay unit tests.
 *
 * Strategy:
 *  - The mobile jest project uses jest-expo (native preset by default), so
 *    Platform.OS starts as 'ios'. We flip it to 'web' using the same technique
 *    established in apps/mobile/app/(tabs)/__tests__/profile.test.tsx.
 *  - theme/ThemeContext is mapped to __mocks__/themeContextMock.js by jest.config.js
 *    so useTheme() works without a real DB.
 *  - We drive the syncStatus store directly via its exported helpers.
 */
import React from 'react'
import { Platform } from 'react-native'
import { render, screen, act, fireEvent } from '@testing-library/react-native'

import {
  resetSyncStatus,
  markSyncStart,
  markSyncDone,
  markFirstSyncDone,
} from '../../services/syncStatus'

// ── Platform stubbing ─────────────────────────────────────────────────────────
// jest-expo defaults to 'ios'. We flip to 'web' for the duration of this suite
// using the same require-then-assign pattern used in profile.test.tsx.
const { Platform: RNPlatform } = require('react-native')
let originalOS: string

beforeAll(() => {
  originalOS = RNPlatform.OS
  RNPlatform.OS = 'web'
})

afterAll(() => {
  RNPlatform.OS = originalOS
})

// ── Per-test cleanup ──────────────────────────────────────────────────────────
beforeEach(() => {
  jest.useFakeTimers()
  resetSyncStatus()
})

afterEach(() => {
  jest.runOnlyPendingTimers()
  jest.useRealTimers()
})

// ── Lazy import after Platform is patched ────────────────────────────────────
// We import after beforeAll has run (module-level require is fine here because
// jest evaluates describe blocks synchronously before any beforeAll runs, but
// the actual module code in WebSetupOverlay only reads Platform.OS at render
// time, not at import time — so the import order doesn't matter here).
import { WebSetupOverlay } from '../WebSetupOverlay'

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WebSetupOverlay', () => {
  it('renders null when not syncing (initial state)', () => {
    // resetSyncStatus() → isSyncing=false, firstSyncDone=false
    // The overlay only shows when isSyncing && !firstSyncDone, so this should be null.
    const { toJSON } = render(<WebSetupOverlay />)
    expect(toJSON()).toBeNull()
  })

  it('renders null when firstSyncDone is true even if isSyncing somehow stayed true', () => {
    // markFirstSyncDone sets firstSyncDone=true without touching isSyncing
    act(() => { markFirstSyncDone() })
    const { toJSON } = render(<WebSetupOverlay />)
    expect(toJSON()).toBeNull()
  })

  it('shows "Setting up Iskotify" title when markSyncStart() and firstSyncDone=false', () => {
    act(() => { markSyncStart() })
    render(<WebSetupOverlay />)
    expect(screen.getByText('Setting up Iskotify')).toBeTruthy()
  })

  it('shows the subtitle text describing what is loading', () => {
    act(() => { markSyncStart() })
    render(<WebSetupOverlay />)
    expect(
      screen.getByText(/Fetching the latest exams, scholarships and study decks/i)
    ).toBeTruthy()
  })

  it('hides (returns null) after markSyncDone()', () => {
    act(() => { markSyncStart() })
    const { toJSON, rerender } = render(<WebSetupOverlay />)
    // Should be visible now
    expect(screen.getByText('Setting up Iskotify')).toBeTruthy()

    // markSyncDone sets isSyncing=false AND firstSyncDone=true
    act(() => { markSyncDone() })
    rerender(<WebSetupOverlay />)
    expect(toJSON()).toBeNull()
  })

  it('hides after markFirstSyncDone() is called while syncing (suppression path)', () => {
    act(() => { markSyncStart() })
    render(<WebSetupOverlay />)
    expect(screen.getByText('Setting up Iskotify')).toBeTruthy()

    act(() => { markFirstSyncDone() })
    // Re-query — the component should have re-rendered and removed itself
    expect(screen.queryByText('Setting up Iskotify')).toBeNull()
  })

  it('does NOT show "Continue anyway" button before 15 s', () => {
    act(() => { markSyncStart() })
    render(<WebSetupOverlay />)
    // Advance time by less than 15 000 ms
    act(() => { jest.advanceTimersByTime(14_999) })
    expect(screen.queryByText('Continue anyway')).toBeNull()
  })

  it('shows "Continue anyway" button after 15 s', () => {
    act(() => { markSyncStart() })
    render(<WebSetupOverlay />)
    act(() => { jest.advanceTimersByTime(15_000) })
    expect(screen.getByText('Continue anyway')).toBeTruthy()
    expect(screen.getByText(/Taking longer than usual/i)).toBeTruthy()
  })

  it('"Continue anyway" button has correct accessibility attributes', () => {
    act(() => { markSyncStart() })
    render(<WebSetupOverlay />)
    act(() => { jest.advanceTimersByTime(15_000) })
    const btn = screen.getByRole('button', { name: /continue to the app/i })
    expect(btn).toBeTruthy()
  })

  it('pressing "Continue anyway" hides the overlay via markSyncDone', () => {
    act(() => { markSyncStart() })
    render(<WebSetupOverlay />)
    act(() => { jest.advanceTimersByTime(15_000) })

    const btn = screen.getByRole('button', { name: /continue to the app/i })
    fireEvent.press(btn)

    // After pressing, markSyncDone() is called → overlay hides
    expect(screen.queryByText('Setting up Iskotify')).toBeNull()
  })

  it('does not show "Continue anyway" after overlay becomes invisible and re-appears', () => {
    // Start sync → show overlay → stop before 15 s
    act(() => { markSyncStart() })
    render(<WebSetupOverlay />)
    act(() => { jest.advanceTimersByTime(5_000) })

    // Overlay disappears (markSyncDone resets firstSyncDone=true)
    act(() => { markSyncDone() })
    expect(screen.queryByText('Setting up Iskotify')).toBeNull()

    // Timer should have been cleared — advancing to 15 s from original start
    // should NOT produce a button if we were to re-show (timer is cleaned up).
    act(() => { jest.advanceTimersByTime(10_000) })
    expect(screen.queryByText('Continue anyway')).toBeNull()
  })

  it('renders null on native (Platform.OS check)', () => {
    // Temporarily flip back to native to verify the guard works
    RNPlatform.OS = 'ios'
    try {
      act(() => { markSyncStart() })
      const { toJSON } = render(<WebSetupOverlay />)
      // Should be null regardless of sync state on native
      expect(toJSON()).toBeNull()
    } finally {
      RNPlatform.OS = 'web'
    }
  })
})
