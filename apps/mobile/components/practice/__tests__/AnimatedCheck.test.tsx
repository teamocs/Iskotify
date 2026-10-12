import React from 'react'
import { render } from '@testing-library/react-native'
import { motion } from '../../../theme/tokens'

// iOS redesign P4: a correct answer is the one place that bounces, once
// (spring.bouncy on the check's scale); Reduce Motion only crossfades it in.

const mockCaps = { liquidGlass: false, blurTier: 'blur', reduceTransparency: false, reduceMotion: false }
jest.mock('../../../hooks/usePlatformCapabilities', () => ({ usePlatformCapabilities: () => mockCaps }))

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

import { AnimatedCheck } from '../AnimatedCheck'

afterEach(() => {
  mockCaps.reduceMotion = false
  jest.clearAllMocks()
})

describe('AnimatedCheck', () => {
  it('springs in on spring.bouncy exactly once, and never again on re-render', () => {
    const { rerender } = render(<AnimatedCheck color="#166534" />)
    rerender(<AnimatedCheck color="#166534" size={18} />)
    rerender(<AnimatedCheck color="#166534" size={20} />)
    expect(mockWithSpring).toHaveBeenCalledTimes(1)
    expect(mockWithSpring).toHaveBeenCalledWith(1, motion.spring.bouncy)
    expect(mockWithTiming).not.toHaveBeenCalled()
  })

  it('only crossfades under Reduce Motion', () => {
    mockCaps.reduceMotion = true
    render(<AnimatedCheck color="#166534" />)
    expect(mockWithSpring).not.toHaveBeenCalled()
    expect(mockWithTiming).toHaveBeenCalledWith(1, { duration: motion.duration.reduced })
  })

  it('is decorative (the word "Correct" beside it carries the meaning)', () => {
    const { getByTestId } = render(<AnimatedCheck color="#166534" />)
    const node = getByTestId('animated-check', { includeHiddenElements: true })
    expect(node.props['aria-hidden'] ?? node.props.accessibilityElementsHidden).toBe(true)
  })
})
