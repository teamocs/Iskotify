import React from 'react'
import { StyleSheet, Text } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { PressableScale, pressFeedback } from '../Pressable'
import { motion } from '../../../theme/tokens'

const mockCaps = { liquidGlass: false, blurTier: 'blur', reduceTransparency: false, reduceMotion: false }
jest.mock('../../../hooks/usePlatformCapabilities', () => ({
  usePlatformCapabilities: () => mockCaps,
}))

// Reanimated's stock mock recreates shared values each render and never
// re-renders on a write, so a press can't be observed. This local variant
// keeps one value per hook and re-renders when it is written; springs and
// timings settle instantly.
jest.mock('react-native-reanimated', () => {
  const React = require('react')
  const actual = require('react-native-reanimated/mock')
  const useSharedValue = (init: unknown) => {
    const [, force] = React.useReducer((n: number) => n + 1, 0)
    const ref = React.useRef(null)
    if (!ref.current) {
      const box = { v: init }
      ref.current = { get value() { return box.v }, set value(next) { box.v = next; force() } }
    }
    return ref.current
  }
  return {
    ...actual,
    __esModule: true,
    default: { ...actual.default, createAnimatedComponent: (c: unknown) => c },
    useSharedValue,
    useAnimatedStyle: (fn: () => unknown) => fn(),
    withSpring: (to: unknown) => to,
    withTiming: (to: unknown) => to,
  }
})

const flat = (el: { props: { style?: unknown } }) =>
  StyleSheet.flatten(el.props.style as never) as { opacity?: number; transform?: { scale: number }[] }

function renderButton(props: Record<string, unknown> = {}) {
  render(
    <PressableScale accessibilityRole="button" accessibilityLabel="Start practice" {...props}>
      <Text>Start</Text>
    </PressableScale>,
  )
  return () => screen.getByRole('button', { name: 'Start practice' })
}

describe('pressFeedback', () => {
  it('scales to 0.97 while pressed and back to 1 on release', () => {
    expect(pressFeedback(true, false)).toEqual({ scale: motion.pressScale, opacity: 1 })
    expect(pressFeedback(false, false)).toEqual({ scale: 1, opacity: 1 })
  })

  it('under Reduce Motion it only dims, never scales', () => {
    expect(pressFeedback(true, true)).toEqual({ scale: 1, opacity: 0.7 })
    expect(pressFeedback(false, true)).toEqual({ scale: 1, opacity: 1 })
  })
})

describe('<PressableScale>', () => {
  afterEach(() => { mockCaps.reduceMotion = false })

  it('is an accessible button that fires onPress', () => {
    const onPress = jest.fn()
    const button = renderButton({ onPress })
    fireEvent.press(button())
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not fire when disabled', () => {
    const onPress = jest.fn()
    const button = renderButton({ onPress, disabled: true })
    fireEvent.press(button())
    expect(onPress).not.toHaveBeenCalled()
  })

  it('scales to 0.97 on press-in and back to 1 on press-out', () => {
    const button = renderButton()
    expect(flat(button()).transform).toEqual([{ scale: 1 }])
    fireEvent(button(), 'pressIn')
    expect(flat(button())).toMatchObject({ opacity: 1, transform: [{ scale: 0.97 }] })
    fireEvent(button(), 'pressOut')
    expect(flat(button())).toMatchObject({ opacity: 1, transform: [{ scale: 1 }] })
  })

  it('under Reduce Motion it only dims: opacity changes, scale stays 1', () => {
    mockCaps.reduceMotion = true
    const button = renderButton()
    fireEvent(button(), 'pressIn')
    expect(flat(button())).toMatchObject({ opacity: 0.7, transform: [{ scale: 1 }] })
    fireEvent(button(), 'pressOut')
    expect(flat(button())).toMatchObject({ opacity: 1, transform: [{ scale: 1 }] })
  })

  it("still calls the caller's onPressIn and onPressOut", () => {
    const onPressIn = jest.fn()
    const onPressOut = jest.fn()
    const button = renderButton({ onPressIn, onPressOut })
    fireEvent(button(), 'pressIn')
    fireEvent(button(), 'pressOut')
    expect(onPressIn).toHaveBeenCalledTimes(1)
    expect(onPressOut).toHaveBeenCalledTimes(1)
  })
})
