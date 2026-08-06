import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { OptionList } from '../OptionList'

const OPTIONS = ['Manila', 'Cebu', 'Davao', 'Makati']

describe('OptionList', () => {
  it('renders every option with its letter chip (A–D)', () => {
    render(<OptionList options={OPTIONS} selectedIndex={undefined} onSelect={jest.fn()} />)
    expect(screen.getByText('A')).toBeTruthy()
    expect(screen.getByText('B')).toBeTruthy()
    expect(screen.getByText('C')).toBeTruthy()
    expect(screen.getByText('D')).toBeTruthy()
    expect(screen.getByText('Manila')).toBeTruthy()
    expect(screen.getByText('Cebu')).toBeTruthy()
    expect(screen.getByText('Davao')).toBeTruthy()
    expect(screen.getByText('Makati')).toBeTruthy()
  })

  it('calls onSelect with the pressed option index', () => {
    const onSelect = jest.fn()
    render(<OptionList options={OPTIONS} selectedIndex={undefined} onSelect={onSelect} />)
    fireEvent.press(screen.getByText('Cebu'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('exposes accessibilityRole="button" and accessibilityState={{selected}} on every option', () => {
    const { getAllByRole } = render(
      <OptionList options={OPTIONS} selectedIndex={2} onSelect={jest.fn()} />,
    )
    const buttons = getAllByRole('button')
    expect(buttons).toHaveLength(4)
    buttons.forEach((btn, i) => {
      expect(btn.props.accessibilityState).toEqual({ selected: i === 2 })
    })
  })

  it('marks no option as selected when selectedIndex is undefined', () => {
    const { getAllByRole } = render(
      <OptionList options={OPTIONS} selectedIndex={undefined} onSelect={jest.fn()} />,
    )
    const buttons = getAllByRole('button')
    expect(buttons.every(b => b.props.accessibilityState?.selected === false)).toBe(true)
  })

  it('caps option text font scaling (maxFontSizeMultiplier)', () => {
    render(<OptionList options={OPTIONS} selectedIndex={undefined} onSelect={jest.fn()} />)
    const node = screen.getByText('Manila')
    expect(node.props.maxFontSizeMultiplier).toBeGreaterThan(0)
    expect(node.props.maxFontSizeMultiplier).toBeLessThanOrEqual(1.8)
  })

  it('caps letter chip text font scaling', () => {
    render(<OptionList options={OPTIONS} selectedIndex={undefined} onSelect={jest.fn()} />)
    const node = screen.getByText('A')
    expect(node.props.maxFontSizeMultiplier).toBeGreaterThan(0)
    expect(node.props.maxFontSizeMultiplier).toBeLessThanOrEqual(1.8)
  })
})
