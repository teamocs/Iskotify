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

  // Some imported questions carry only 3 options (a blank 4th option is
  // dropped by the CSV importer). OptionList must render exactly as many
  // chips as it's given — no crash, no phantom 4th "D" button.
  it('renders exactly 3 chips (A-C) for a 3-option question, with no crash and no 4th button', () => {
    const { getAllByRole } = render(
      <OptionList options={['Manila', 'Cebu', 'Davao']} selectedIndex={undefined} onSelect={jest.fn()} />,
    )
    const buttons = getAllByRole('button')
    expect(buttons).toHaveLength(3)
    expect(screen.getByText('A')).toBeTruthy()
    expect(screen.getByText('B')).toBeTruthy()
    expect(screen.getByText('C')).toBeTruthy()
    expect(screen.queryByText('D')).toBeNull()
  })

  // Redesign M2: answer choices are at least 48 tall (Android target) and the
  // selected state carries a non-colour cue (a check mark), not a tint alone.
  it('gives every option a touch target at least 48 tall', () => {
    const { getAllByRole } = render(<OptionList options={OPTIONS} selectedIndex={undefined} onSelect={jest.fn()} />)
    for (const btn of getAllByRole('button')) {
      const flat = Object.assign({}, ...[btn.props.style].flat(Infinity).filter(Boolean))
      expect(flat.minHeight).toBeGreaterThanOrEqual(48)
    }
  })

  it('marks the selected option with a visible check, and only that one', () => {
    render(<OptionList options={OPTIONS} selectedIndex={1} onSelect={jest.fn()} />)
    expect(screen.getAllByTestId('option-selected-mark', { includeHiddenElements: true })).toHaveLength(1)
  })

  it('shows no check when nothing is selected', () => {
    render(<OptionList options={OPTIONS} selectedIndex={undefined} onSelect={jest.fn()} />)
    expect(screen.queryByTestId('option-selected-mark', { includeHiddenElements: true })).toBeNull()
  })

  it('ignores presses while disabled', () => {
    const onSelect = jest.fn()
    render(<OptionList options={OPTIONS} selectedIndex={undefined} onSelect={onSelect} disabled />)
    fireEvent.press(screen.getByText('Cebu'))
    expect(onSelect).not.toHaveBeenCalled()
  })
})

