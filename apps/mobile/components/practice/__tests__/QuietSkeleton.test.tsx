import React from 'react'
import { Animated, AccessibilityInfo } from 'react-native'
import { render, screen, act } from '@testing-library/react-native'
import { QuietSkeleton } from '../QuietSkeleton'

// Regression (found in the M2 web visual check): the ui/Skeleton pulse runs
// Animated.timing without the native driver on web, which defaults to
// isInteraction: true. An endless loop therefore holds an InteractionManager
// handle open, and usePracticeData — which loads in runAfterInteractions —
// never loads while a skeleton is on screen: the Practice tab's Subjects stayed
// skeletons forever. QuietSkeleton pulses without registering an interaction.
describe('QuietSkeleton', () => {
  let timing: jest.SpyInstance
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    timing = jest.spyOn(Animated, 'timing')
  })
  afterEach(() => jest.restoreAllMocks())

  it('never registers its pulse as an interaction', async () => {
    render(<QuietSkeleton />)
    await act(async () => {})
    expect(timing).toHaveBeenCalled()
    for (const call of timing.mock.calls) expect(call[1]).toMatchObject({ isInteraction: false })
  })

  it('stays still under reduced motion', async () => {
    ;(AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true)
    render(<QuietSkeleton />)
    await act(async () => {})
    expect(timing).not.toHaveBeenCalled()
  })

  it('is hidden from assistive tech unless it is the one announced block', () => {
    const { rerender } = render(<QuietSkeleton />)
    expect(screen.queryByLabelText('Loading')).toBeNull()
    rerender(<QuietSkeleton accessible label="Loading subjects" />)
    expect(screen.getByLabelText('Loading subjects')).toBeTruthy()
  })
})
