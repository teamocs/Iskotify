import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { FocusModeToggle } from '../FocusModeToggle'

describe('FocusModeToggle', () => {
  it('renders label "Focus Mode" + a description', () => {
    const { getByText } = render(<FocusModeToggle enabled={true} onToggle={() => {}} />)
    expect(getByText('Focus Mode')).toBeTruthy()
    expect(getByText(/Hides nav bar/i)).toBeTruthy()
  })

  it('calls onToggle(false) when switch is tapped while ON', () => {
    const onToggle = jest.fn()
    const { getByRole } = render(<FocusModeToggle enabled={true} onToggle={onToggle} />)
    fireEvent(getByRole('switch'), 'valueChange', false)
    expect(onToggle).toHaveBeenCalledWith(false)
  })

  it('calls onToggle(true) when switch is tapped while OFF', () => {
    const onToggle = jest.fn()
    const { getByRole } = render(<FocusModeToggle enabled={false} onToggle={onToggle} />)
    fireEvent(getByRole('switch'), 'valueChange', true)
    expect(onToggle).toHaveBeenCalledWith(true)
  })

  it('reflects enabled prop in switch state', () => {
    const { getByRole, rerender } = render(<FocusModeToggle enabled={true} onToggle={() => {}} />)
    expect(getByRole('switch').props.value).toBe(true)
    rerender(<FocusModeToggle enabled={false} onToggle={() => {}} />)
    expect(getByRole('switch').props.value).toBe(false)
  })
})
