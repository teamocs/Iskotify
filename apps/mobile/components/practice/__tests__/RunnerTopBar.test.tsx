import React from 'react'
import { AccessibilityInfo } from 'react-native'
import { render, screen } from '@testing-library/react-native'
import { TimerCapsule, fmtClock } from '../runner/RunnerTopBar'

// iOS redesign P4 review: the timer capsule is a role="timer" with tabular
// figures, and it SPEAKS low time exactly once at 5 minutes and once at
// 1 minute — never per second (a screen reader would be flooded).

describe('TimerCapsule low-time announcements', () => {
  let announce: jest.SpyInstance
  beforeEach(() => { announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {}) })
  afterEach(() => announce.mockRestore())

  function tick(from: number, to: number) {
    const { rerender } = render(<TimerCapsule label="Time left" secs={from} emphasis />)
    for (let s = from - 1; s >= to; s--) rerender(<TimerCapsule label="Time left" secs={s} emphasis />)
  }

  it('says nothing on mount, nor while time is plentiful', () => {
    tick(400, 302)
    expect(announce).not.toHaveBeenCalled()
  })

  it('announces once when crossing 5 minutes and once when crossing 1 minute', () => {
    tick(305, 0)
    expect(announce).toHaveBeenCalledTimes(2)
    expect(announce).toHaveBeenNthCalledWith(1, 'Time left: 5 minutes')
    expect(announce).toHaveBeenNthCalledWith(2, 'Time left: 1 minute')
  })

  it('a timer resumed under 5 minutes stays quiet until the 1-minute mark', () => {
    tick(200, 30)
    expect(announce).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenCalledWith('Time left: 1 minute')
  })

  it('re-rendering at the same second never repeats an announcement', () => {
    const { rerender } = render(<TimerCapsule label="Time left" secs={61} emphasis />)
    rerender(<TimerCapsule label="Time left" secs={60} emphasis />)
    rerender(<TimerCapsule label="Time left" secs={60} emphasis={false} />)
    rerender(<TimerCapsule label="Time left" secs={59} emphasis />)
    expect(announce).toHaveBeenCalledTimes(1)
  })

  it('is a role="timer" with a spoken clock', () => {
    render(<TimerCapsule label="Section time left" secs={125} emphasis />)
    expect(screen.getByRole('timer').props.accessibilityLabel).toBe(`Section time left: ${fmtClock(125)}`)
  })
})
