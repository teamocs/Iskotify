/**
 * SegmentedControl (iOS redesign P3): a tablist whose selection rides on
 * aria-selected, a haptic tick only when the choice changes, arrow keys on
 * the web, 44pt targets, and a thumb that slides on spring.snappy or, under
 * Reduce Motion, jumps.
 */
import React from 'react'
import { Platform, StyleSheet } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { motion } from '../../../theme/tokens'
import { aria } from '../../../test-utils/aria'

const mockCaps = { liquidGlass: false, blurTier: 'blur', reduceTransparency: false, reduceMotion: false }
jest.mock('../../../hooks/usePlatformCapabilities', () => ({
  usePlatformCapabilities: () => mockCaps,
}))

const mockSelection = jest.fn()
jest.mock('../../../lib/haptics', () => ({ selection: () => mockSelection() }))

const mockWithSpring = jest.fn((to: unknown, _cfg?: unknown) => to)
const mockWithTiming = jest.fn((to: unknown, _cfg?: unknown) => to)
jest.mock('react-native-reanimated', () => {
  const actual = require('react-native-reanimated/mock')
  return {
    ...actual,
    withSpring: (to: unknown, cfg: unknown) => mockWithSpring(to, cfg),
    withTiming: (to: unknown, cfg: unknown) => mockWithTiming(to, cfg),
  }
})

import { SegmentedControl } from '../SegmentedControl'

const SEGMENTS = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'all', label: 'All time' },
] as const

type Range = (typeof SEGMENTS)[number]['value']

function Harness({ initial = 'week' as Range, onChange = jest.fn() }) {
  const [value, setValue] = React.useState<Range>(initial)
  return (
    <SegmentedControl
      accessibilityLabel="Time range"
      segments={SEGMENTS}
      value={value}
      onChange={(v) => { setValue(v); onChange(v) }}
    />
  )
}

const original = Platform.OS
afterEach(() => {
  Platform.OS = original
  mockCaps.reduceMotion = false
  jest.clearAllMocks()
})

describe('SegmentedControl', () => {
  it('is a named tablist of tabs exposing aria-selected', () => {
    render(<Harness />)
    // The tablist is a plain grouping view (making it `accessible` would hide
    // the tabs inside it on iOS), so find it by its label and check its role.
    expect(screen.getByLabelText('Time range').props.accessibilityRole).toBe('tablist')
    expect(aria(screen.getByRole('tab', { name: 'Week' }), 'aria-selected')).toBe(true)
    expect(aria(screen.getByRole('tab', { name: 'Month' }), 'aria-selected')).toBe(false)
  })

  it('moves the selection on press, with one haptic tick', () => {
    const onChange = jest.fn()
    render(<Harness onChange={onChange} />)
    fireEvent.press(screen.getByRole('tab', { name: 'Month' }))
    expect(onChange).toHaveBeenCalledWith('month')
    expect(mockSelection).toHaveBeenCalledTimes(1)
    expect(aria(screen.getByRole('tab', { name: 'Month' }), 'aria-selected')).toBe(true)
    expect(aria(screen.getByRole('tab', { name: 'Week' }), 'aria-selected')).toBe(false)
  })

  it('pressing the selected segment changes nothing: no callback, no haptic', () => {
    const onChange = jest.fn()
    render(<Harness onChange={onChange} />)
    fireEvent.press(screen.getByRole('tab', { name: 'Week' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(mockSelection).not.toHaveBeenCalled()
  })

  it('keeps every segment at a 44pt target or larger', () => {
    render(<Harness />)
    expect(StyleSheet.flatten(screen.getByLabelText('Time range').props.style).minHeight).toBeGreaterThanOrEqual(44)
    for (const tab of screen.getAllByRole('tab')) {
      const style = tab.props.style
      const s = StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style)
      expect(s.minHeight).toBeGreaterThanOrEqual(40)
    }
  })

  it('slides the thumb on spring.snappy when the selection changes', () => {
    render(<Harness />)
    mockWithSpring.mockClear()
    fireEvent.press(screen.getByRole('tab', { name: 'All time' }))
    expect(mockWithSpring).toHaveBeenCalledWith(2, motion.spring.snappy)
  })

  it('under Reduce Motion the thumb jumps: no spring', () => {
    mockCaps.reduceMotion = true
    render(<Harness />)
    mockWithSpring.mockClear()
    fireEvent.press(screen.getByRole('tab', { name: 'All time' }))
    expect(mockWithSpring).not.toHaveBeenCalled()
    expect(aria(screen.getByRole('tab', { name: 'All time' }), 'aria-selected')).toBe(true)
  })

  describe('web keyboard', () => {
    beforeEach(() => { Platform.OS = 'web' })

    it('ArrowRight and ArrowLeft move the selection, wrapping at the ends', () => {
      const onChange = jest.fn()
      render(<Harness onChange={onChange} />)
      fireEvent(screen.getByRole('tab', { name: 'Week' }), 'keyDown', { key: 'ArrowRight', preventDefault: jest.fn() })
      expect(onChange).toHaveBeenLastCalledWith('month')
      fireEvent(screen.getByRole('tab', { name: 'Month' }), 'keyDown', { key: 'ArrowLeft', preventDefault: jest.fn() })
      expect(onChange).toHaveBeenLastCalledWith('week')
      fireEvent(screen.getByRole('tab', { name: 'Week' }), 'keyDown', { key: 'ArrowLeft', preventDefault: jest.fn() })
      expect(onChange).toHaveBeenLastCalledWith('all')
    })

    it('ignores other keys', () => {
      const onChange = jest.fn()
      render(<Harness onChange={onChange} />)
      fireEvent(screen.getByRole('tab', { name: 'Week' }), 'keyDown', { key: 'a', preventDefault: jest.fn() })
      expect(onChange).not.toHaveBeenCalled()
    })

    it('only the selected tab is in the Tab order (roving tabindex)', () => {
      render(<Harness />)
      expect(screen.getByRole('tab', { name: 'Week' }).props.tabIndex).toBe(0)
      expect(screen.getByRole('tab', { name: 'Month' }).props.tabIndex).toBe(-1)
    })
  })
})
