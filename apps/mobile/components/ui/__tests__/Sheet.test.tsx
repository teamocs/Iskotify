/**
 * Sheets (iOS redesign P3): routed sheets are native formSheets with
 * detents [0.5, 1], a grabber and the 28pt corner; the in-place <Sheet>
 * keeps its modal contract, takes the sheet radius and a glass header, and
 * slides in on spring.smooth or, under Reduce Motion, crossfades.
 */
import React from 'react'
import { StyleSheet, Text } from 'react-native'
import { Modal } from 'react-native'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { motion, radius } from '../../../theme/tokens'

const mockCaps = { liquidGlass: false, blurTier: 'blur', reduceTransparency: false, reduceMotion: false }
jest.mock('../../../hooks/usePlatformCapabilities', () => ({
  usePlatformCapabilities: () => mockCaps,
}))

const mockBp = { current: 'compact' }
jest.mock('../../../hooks/useBreakpoint', () => ({
  ...jest.requireActual('../../../hooks/useBreakpoint'),
  useBreakpoint: () => mockBp.current,
}))

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

import { Sheet } from '../Sheet'
import { sheetRouteOptions } from '../sheetRoute'
import { profileScreenOptions } from '../../navigation/profileSheet'

afterEach(() => {
  mockCaps.reduceMotion = false
  mockBp.current = 'compact'
  jest.clearAllMocks()
})

describe('sheetRouteOptions (routed sheets)', () => {
  it.each(['ios', 'android'])('%s: a native formSheet at half and full height, grabber, 28pt corner', (os) => {
    expect(sheetRouteOptions(os)).toEqual({
      presentation: 'formSheet',
      sheetAllowedDetents: [0.5, 1],
      sheetGrabberVisible: true,
      sheetCornerRadius: 28,
    })
    expect(sheetRouteOptions(os).sheetCornerRadius).toBe(radius.sheet)
  })

  it('web: a plain push (no native sheet)', () => {
    expect(sheetRouteOptions('web')).toEqual({})
  })

  it('Profile reuses the same options', () => {
    expect(profileScreenOptions('ios')).toEqual(sheetRouteOptions('ios'))
    expect(profileScreenOptions('web')).toEqual({})
  })
})

describe('<Sheet> shape', () => {
  it('rounds the top corners at the sheet radius on phones', () => {
    render(<Sheet visible title="Filters" onClose={() => {}}><Text>Body</Text></Sheet>)
    const s = StyleSheet.flatten(screen.getByTestId('sheet-panel').props.style)
    expect(s.borderTopLeftRadius).toBe(radius.sheet)
    expect(s.borderTopRightRadius).toBe(radius.sheet)
    expect(s.borderBottomLeftRadius).toBe(0)
    expect(s.borderCurve).toBe('continuous')
  })

  it('is a centred dialog rounded on every corner from medium width up', () => {
    mockBp.current = 'medium'
    render(<Sheet visible title="Filters" onClose={() => {}}><Text>Body</Text></Sheet>)
    const s = StyleSheet.flatten(screen.getByTestId('sheet-panel').props.style)
    expect(s.borderBottomLeftRadius).toBe(radius.sheet)
    expect(s.borderBottomRightRadius).toBe(radius.sheet)
  })

  it('draws the title row on a glass header', () => {
    render(<Sheet visible title="Filters" onClose={() => {}}><Text>Body</Text></Sheet>)
    expect(screen.getByTestId('sheet-header')).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Filters' })).toBeTruthy()
  })
})

describe('<Sheet> motion', () => {
  it('slides the panel in on spring.smooth', () => {
    render(<Sheet visible title="Filters" onClose={() => {}}><Text>Body</Text></Sheet>)
    expect(mockWithSpring).toHaveBeenCalledWith(1, motion.spring.smooth)
  })

  it('under Reduce Motion it crossfades (a 160ms timing), never a spring', () => {
    mockCaps.reduceMotion = true
    render(<Sheet visible title="Filters" onClose={() => {}}><Text>Body</Text></Sheet>)
    expect(mockWithSpring).not.toHaveBeenCalled()
    expect(mockWithTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: motion.duration.reduced }))
  })
})

describe('<Sheet> exit', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  const panel = () => screen.queryByTestId('sheet-panel', { includeHiddenElements: true })

  it('stays mounted while it animates out, then unmounts', () => {
    const { rerender } = render(<Sheet visible title="Filters" onClose={() => {}}><Text>Body</Text></Sheet>)
    rerender(<Sheet visible={false} title="Filters" onClose={() => {}}><Text>Body</Text></Sheet>)
    expect(panel()).toBeTruthy()
    expect(mockWithTiming).toHaveBeenLastCalledWith(0, expect.objectContaining({ duration: 200 }))
    act(() => { jest.advanceTimersByTime(199) })
    expect(panel()).toBeTruthy()
    act(() => { jest.advanceTimersByTime(1) })
    expect(panel()).toBeNull()
  })

  it('ignores the panel and scrim while closing, and keeps it modal until unmount', () => {
    const { rerender } = render(<Sheet visible title="Filters" onClose={() => {}}><Text>Body</Text></Sheet>)
    rerender(<Sheet visible={false} title="Filters" onClose={() => {}}><Text>Body</Text></Sheet>)
    expect(panel()!.props.pointerEvents).toBe('none')
    expect(screen.getByTestId('sheet-backdrop', { includeHiddenElements: true }).props.pointerEvents).toBe('none')
    expect(panel()!.props.accessibilityViewIsModal).toBe(true)
  })

  it('calls onClose once when the scrim and Escape both fire around the exit', () => {
    const onClose = jest.fn()
    const { rerender } = render(<Sheet visible title="Filters" onClose={onClose}><Text>Body</Text></Sheet>)
    fireEvent.press(screen.getByTestId('sheet-backdrop', { includeHiddenElements: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
    rerender(<Sheet visible={false} title="Filters" onClose={onClose}><Text>Body</Text></Sheet>)
    act(() => { screen.UNSAFE_getByType(Modal).props.onRequestClose() })
    fireEvent.press(screen.getByTestId('sheet-backdrop', { includeHiddenElements: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('under Reduce Motion it fades out in 160ms', () => {
    mockCaps.reduceMotion = true
    const { rerender } = render(<Sheet visible title="Filters" onClose={() => {}}><Text>Body</Text></Sheet>)
    rerender(<Sheet visible={false} title="Filters" onClose={() => {}}><Text>Body</Text></Sheet>)
    expect(mockWithTiming).toHaveBeenLastCalledWith(0, expect.objectContaining({ duration: motion.duration.reduced }))
    act(() => { jest.advanceTimersByTime(motion.duration.reduced - 1) })
    expect(panel()).toBeTruthy()
    act(() => { jest.advanceTimersByTime(1) })
    expect(panel()).toBeNull()
  })

  it('reopening during the exit cancels it and stays open', () => {
    const { rerender } = render(<Sheet visible title="Filters" onClose={() => {}}><Text>Body</Text></Sheet>)
    rerender(<Sheet visible={false} title="Filters" onClose={() => {}}><Text>Body</Text></Sheet>)
    act(() => { jest.advanceTimersByTime(100) })
    rerender(<Sheet visible title="Filters" onClose={() => {}}><Text>Body</Text></Sheet>)
    act(() => { jest.advanceTimersByTime(500) })
    expect(panel()).toBeTruthy()
    expect(panel()!.props.pointerEvents).not.toBe('none')
  })
})
