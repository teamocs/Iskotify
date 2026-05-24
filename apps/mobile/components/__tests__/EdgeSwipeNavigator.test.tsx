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
  onEnd: jest.fn().mockReturnThis(),
}

jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  Gesture: { Pan: jest.fn(() => mockPanBuilder) },
}))

jest.mock('react-native-reanimated', () => ({
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
}))

import { EdgeSwipeNavigator } from '../EdgeSwipeNavigator'
import { Gesture } from 'react-native-gesture-handler'

type OnEndCallback = (e: { translationX: number; velocityX: number }) => void

function getOnEndCallback(): OnEndCallback {
  return mockPanBuilder.onEnd.mock.calls[0]![0] as OnEndCallback
}

describe('EdgeSwipeNavigator', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    ;(Gesture.Pan as jest.Mock).mockClear()
    mockPanBuilder.activeOffsetX.mockClear()
    mockPanBuilder.failOffsetY.mockClear()
    mockPanBuilder.onEnd.mockClear()
    mockUsePathname.mockReturnValue('/practice')
  })

  it('renders children', () => {
    const { getByText } = render(
      <EdgeSwipeNavigator><Text>child</Text></EdgeSwipeNavigator>
    )
    expect(getByText('child')).toBeTruthy()
  })

  it('configures Pan gesture with activation thresholds', () => {
    render(<EdgeSwipeNavigator><Text>x</Text></EdgeSwipeNavigator>)
    expect(Gesture.Pan).toHaveBeenCalledTimes(1)
    expect(mockPanBuilder.activeOffsetX).toHaveBeenCalledWith([-15, 15])
    expect(mockPanBuilder.failOffsetY).toHaveBeenCalledWith([-15, 15])
    expect(mockPanBuilder.onEnd).toHaveBeenCalledTimes(1)
  })

  it('navigates to next tab on qualifying left swipe', () => {
    mockUsePathname.mockReturnValue('/practice')
    render(<EdgeSwipeNavigator><Text>x</Text></EdgeSwipeNavigator>)
    getOnEndCallback()({ translationX: -200, velocityX: -800 })
    expect(mockNavigate).toHaveBeenCalledWith('/(tabs)/listings')
  })

  it('navigates to previous tab on qualifying right swipe', () => {
    mockUsePathname.mockReturnValue('/practice')
    render(<EdgeSwipeNavigator><Text>x</Text></EdgeSwipeNavigator>)
    getOnEndCallback()({ translationX: 200, velocityX: 800 })
    expect(mockNavigate).toHaveBeenCalledWith('/(tabs)')
  })

  it('navigates Home → Practice on left swipe at index', () => {
    mockUsePathname.mockReturnValue('/')
    render(<EdgeSwipeNavigator><Text>x</Text></EdgeSwipeNavigator>)
    getOnEndCallback()({ translationX: -200, velocityX: -800 })
    expect(mockNavigate).toHaveBeenCalledWith('/(tabs)/practice')
  })

  it('no-op at Home boundary on right swipe', () => {
    mockUsePathname.mockReturnValue('/')
    render(<EdgeSwipeNavigator><Text>x</Text></EdgeSwipeNavigator>)
    getOnEndCallback()({ translationX: 200, velocityX: 800 })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('no-op at Profile boundary on left swipe', () => {
    mockUsePathname.mockReturnValue('/profile')
    render(<EdgeSwipeNavigator><Text>x</Text></EdgeSwipeNavigator>)
    getOnEndCallback()({ translationX: -200, velocityX: -800 })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('no-op when distance below threshold', () => {
    mockUsePathname.mockReturnValue('/practice')
    render(<EdgeSwipeNavigator><Text>x</Text></EdgeSwipeNavigator>)
    getOnEndCallback()({ translationX: -30, velocityX: -800 })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('no-op when velocity below threshold', () => {
    mockUsePathname.mockReturnValue('/practice')
    render(<EdgeSwipeNavigator><Text>x</Text></EdgeSwipeNavigator>)
    getOnEndCallback()({ translationX: -200, velocityX: -100 })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('no-op when pathname is not a known tab', () => {
    mockUsePathname.mockReturnValue('/listings/some-detail-page')
    render(<EdgeSwipeNavigator><Text>x</Text></EdgeSwipeNavigator>)
    getOnEndCallback()({ translationX: -200, velocityX: -800 })
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
