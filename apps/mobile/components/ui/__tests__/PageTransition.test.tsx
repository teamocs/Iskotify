import React from 'react'
import { StyleSheet, Text } from 'react-native'
import { act, render, screen } from '@testing-library/react-native'
import * as Reanimated from 'react-native-reanimated'
import { PageTransition } from '../PageTransition'

// Every committed render of the page's Animated.View, with its opacity: the
// first one after a key change is the frame the student would see first.
const mockFrames: (number | undefined)[] = []
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated/mock')
  const R = jest.requireActual('react')
  const RN = jest.requireActual('react-native')
  function RecordingView(props: { style?: unknown }) {
    mockFrames.push(RN.StyleSheet.flatten(props.style)?.opacity)
    return R.createElement(RN.View, props)
  }
  return { ...actual, __esModule: true, default: { ...actual.default, View: RecordingView } }
})
import { motion } from '../../../theme/tokens'

const opacity = () => StyleSheet.flatten(screen.getByTestId('page').props.style).opacity

afterEach(() => jest.restoreAllMocks())

describe('PageTransition', () => {
  it('shows the first page as is, with no animation', () => {
    const timing = jest.spyOn(Reanimated, 'withTiming')
    render(<PageTransition testID="page" pageKey="a"><Text>A</Text></PageTransition>)
    expect(opacity()).toBe(1)
    expect(timing).not.toHaveBeenCalled()
  })

  it('a new page starts hidden (no full-opacity first frame) and fades in over the page duration', () => {
    // Hold the fade at its start so the first frame of the new page is visible to the test.
    const timing = jest.spyOn(Reanimated, 'withTiming').mockImplementation(() => 0 as never)
    const { rerender } = render(<PageTransition testID="page" pageKey="a"><Text>A</Text></PageTransition>)
    mockFrames.length = 0
    act(() => { rerender(<PageTransition testID="page" pageKey="b"><Text>B</Text></PageTransition>) })
    expect(mockFrames[0]).toBe(0)
    expect(timing).toHaveBeenCalledWith(1, expect.objectContaining({ duration: motion.duration.page }))
  })

  it('never springs a page', () => {
    const spring = jest.spyOn(Reanimated, 'withSpring')
    const { rerender } = render(<PageTransition testID="page" pageKey="a"><Text>A</Text></PageTransition>)
    act(() => { rerender(<PageTransition testID="page" pageKey="b"><Text>B</Text></PageTransition>) })
    expect(spring).not.toHaveBeenCalled()
  })
})
