import React from 'react'
import { Text } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { PressableScale, pressFeedback } from '../Pressable'
import { motion } from '../../../theme/tokens'

jest.mock('../../../hooks/usePlatformCapabilities', () => ({
  usePlatformCapabilities: () => ({ liquidGlass: false, blurTier: 'blur', reduceTransparency: false, reduceMotion: false }),
}))

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
  it('is an accessible button that fires onPress', () => {
    const onPress = jest.fn()
    render(
      <PressableScale accessibilityRole="button" accessibilityLabel="Start practice" onPress={onPress}>
        <Text>Start</Text>
      </PressableScale>,
    )
    fireEvent.press(screen.getByRole('button', { name: 'Start practice' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not fire when disabled', () => {
    const onPress = jest.fn()
    render(
      <PressableScale accessibilityRole="button" accessibilityLabel="Locked" disabled onPress={onPress}>
        <Text>Locked</Text>
      </PressableScale>,
    )
    fireEvent.press(screen.getByRole('button', { name: 'Locked' }))
    expect(onPress).not.toHaveBeenCalled()
  })
})
