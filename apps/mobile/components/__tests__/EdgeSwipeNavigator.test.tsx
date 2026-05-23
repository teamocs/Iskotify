import React from 'react'
import { Text } from 'react-native'
import { render } from '@testing-library/react-native'

const mockNavigate = jest.fn()
const mockUsePathname = jest.fn(() => '/practice')

jest.mock('expo-router', () => ({
  router: { navigate: (...args: unknown[]) => mockNavigate(...args) },
  usePathname: () => mockUsePathname(),
}))

const mockPanBuilder = {
  activeOffsetX: jest.fn().mockReturnThis(),
  failOffsetY: jest.fn().mockReturnThis(),
  onBegin: jest.fn().mockReturnThis(),
  onEnd: jest.fn().mockReturnThis(),
}

jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  Gesture: { Pan: jest.fn(() => mockPanBuilder) },
}))

jest.mock('react-native-reanimated', () => ({
  useSharedValue: (init: number) => ({ value: init }),
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
}))

import { EdgeSwipeNavigator } from '../EdgeSwipeNavigator'
import { Gesture } from 'react-native-gesture-handler'

describe('EdgeSwipeNavigator', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    ;(Gesture.Pan as jest.Mock).mockClear()
    mockPanBuilder.activeOffsetX.mockClear()
    mockPanBuilder.failOffsetY.mockClear()
    mockPanBuilder.onBegin.mockClear()
    mockPanBuilder.onEnd.mockClear()
  })

  it('renders children', () => {
    const { getByText } = render(
      <EdgeSwipeNavigator><Text>child</Text></EdgeSwipeNavigator>
    )
    expect(getByText('child')).toBeTruthy()
  })

  it('configures Pan gesture with edge thresholds', () => {
    render(<EdgeSwipeNavigator><Text>x</Text></EdgeSwipeNavigator>)
    expect(Gesture.Pan).toHaveBeenCalledTimes(1)
    expect(mockPanBuilder.activeOffsetX).toHaveBeenCalledWith([-15, 15])
    expect(mockPanBuilder.failOffsetY).toHaveBeenCalledWith([-15, 15])
    expect(mockPanBuilder.onBegin).toHaveBeenCalledTimes(1)
    expect(mockPanBuilder.onEnd).toHaveBeenCalledTimes(1)
  })

  it('onEnd worklet navigates forward on left-edge right-swipe is no-op when in middle', () => {
    render(<EdgeSwipeNavigator><Text>x</Text></EdgeSwipeNavigator>)
    const onEndCb = mockPanBuilder.onEnd.mock.calls[0]![0] as (e: {
      translationX: number; velocityX: number
    }) => void
    // Gesture started in middle of screen (startX = 0 default from useSharedValue),
    // so even a strong horizontal swipe is rejected (not an edge swipe).
    onEndCb({ translationX: -200, velocityX: -1000 })
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
