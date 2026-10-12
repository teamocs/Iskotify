import React from 'react'
import { StyleSheet } from 'react-native'
import { render, screen } from '@testing-library/react-native'
import { CheckCircle } from '../TodaysPlanFold'
import { lightTheme, motion } from '../../../theme/tokens'

jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))

const mockCaps = { liquidGlass: false, blurTier: 'blur', reduceTransparency: false, reduceMotion: false }
jest.mock('../../../hooks/usePlatformCapabilities', () => ({
  usePlatformCapabilities: () => mockCaps,
}))

// One value per hook that re-renders on write; animations settle instantly
// but are recorded, so the test can see which curve each change used.
const mockCalls: { fn: string; to: unknown; config: unknown }[] = []
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
    withSpring: (to: unknown, config: unknown) => { mockCalls.push({ fn: 'spring', to, config }); return to },
    withTiming: (to: unknown, config: unknown) => { mockCalls.push({ fn: 'timing', to, config }); return to },
    withSequence: (...steps: unknown[]) => steps[steps.length - 1],
  }
})

const fill = () => StyleSheet.flatten(screen.getByTestId('check-circle-fill', { includeHiddenElements: true }).props.style) as { opacity: number }
const ring = () => StyleSheet.flatten(screen.getByTestId('check-circle', { includeHiddenElements: true }).props.style) as { borderColor: string; width: number }

describe('CheckCircle', () => {
  beforeEach(() => { mockCalls.length = 0; mockCaps.reduceMotion = false })

  it('is a 24pt inputBorder ring when not done, a filled success disc when done', () => {
    const { rerender } = render(<CheckCircle done={false} />)
    expect(ring()).toMatchObject({ width: 24, borderColor: lightTheme.inputBorder })
    expect(fill().opacity).toBe(0)
    rerender(<CheckCircle done />)
    expect(ring().borderColor).toBe(lightTheme.success)
    expect(fill().opacity).toBe(1)
  })

  it('does not animate on first render', () => {
    render(<CheckCircle done />)
    expect(mockCalls).toEqual([])
  })

  it('pops in on spring.bouncy when checked', () => {
    const { rerender } = render(<CheckCircle done={false} />)
    rerender(<CheckCircle done />)
    expect(mockCalls).toContainEqual({ fn: 'spring', to: 1, config: motion.spring.bouncy })
  })

  it('crossfades instead under Reduce Motion', () => {
    mockCaps.reduceMotion = true
    const { rerender } = render(<CheckCircle done={false} />)
    rerender(<CheckCircle done />)
    expect(mockCalls.some(c => c.fn === 'spring')).toBe(false)
    expect(mockCalls).toContainEqual({ fn: 'timing', to: 1, config: { duration: motion.duration.reduced } })
    expect(fill().opacity).toBe(1)
  })
})
