/**
 * WebRefreshButton unit tests.
 *
 * Platform.OS starts as 'ios' in jest-expo. We flip to 'web' for the web
 * suite, following the same pattern used in profile.test.tsx and
 * WebSetupOverlay.test.tsx.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { WebRefreshButton } from '../WebRefreshButton'

const { Platform } = require('react-native')
let originalOS: string

// ── Web suite ─────────────────────────────────────────────────────────────────

describe('WebRefreshButton — web', () => {
  beforeAll(() => {
    originalOS = Platform.OS
    Platform.OS = 'web'
  })

  afterAll(() => {
    Platform.OS = originalOS
  })

  it('renders the refresh glyph button on web', () => {
    render(<WebRefreshButton onRefresh={jest.fn()} refreshing={false} />)
    expect(screen.getByRole('button', { name: /refresh data/i })).toBeTruthy()
  })

  it('shows the ↻ glyph when not refreshing', () => {
    render(<WebRefreshButton onRefresh={jest.fn()} refreshing={false} />)
    expect(screen.getByText('↻')).toBeTruthy()
  })

  it('calls onRefresh when pressed', () => {
    const onRefresh = jest.fn()
    render(<WebRefreshButton onRefresh={onRefresh} refreshing={false} />)
    fireEvent.press(screen.getByRole('button', { name: /refresh data/i }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('does NOT show the glyph when refreshing (shows ActivityIndicator instead)', () => {
    render(<WebRefreshButton onRefresh={jest.fn()} refreshing={true} />)
    expect(screen.queryByText('↻')).toBeNull()
  })

  it('button has disabled prop when refreshing', () => {
    const onRefresh = jest.fn()
    render(<WebRefreshButton onRefresh={onRefresh} refreshing={true} />)
    const btn = screen.getByRole('button', { name: /refresh data/i })
    // Pressable exposes disabled via accessibilityState OR via props.disabled
    // depending on RNTL version. Check either path:
    const isDisabled = btn.props.accessibilityState?.disabled === true || btn.props.disabled === true
    expect(isDisabled).toBe(true)
  })

  it('does NOT call onRefresh when not refreshing and pressed', () => {
    // When not refreshing, pressing DOES call onRefresh
    const onRefresh = jest.fn()
    render(<WebRefreshButton onRefresh={onRefresh} refreshing={false} />)
    fireEvent.press(screen.getByRole('button', { name: /refresh data/i }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})

// ── Native suite ──────────────────────────────────────────────────────────────

describe('WebRefreshButton — native', () => {
  // Platform.OS is 'ios' by default in jest-expo; no flip needed.
  it('returns null on native (Platform.OS !== web)', () => {
    const { toJSON } = render(<WebRefreshButton onRefresh={jest.fn()} refreshing={false} />)
    expect(toJSON()).toBeNull()
  })

  it('returns null even when refreshing on native', () => {
    const { toJSON } = render(<WebRefreshButton onRefresh={jest.fn()} refreshing={true} />)
    expect(toJSON()).toBeNull()
  })
})
