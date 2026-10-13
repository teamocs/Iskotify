import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react-native'
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

  // Review finding (MEDIUM): answer choices are a single-choice group, so
  // they carry radio semantics (a labelled radiogroup of radios with a checked
  // state), not a row of generic buttons.
  it('is a radiogroup labelled "Answer choices"', () => {
    render(<OptionList options={OPTIONS} selectedIndex={undefined} onSelect={jest.fn()} />)
    const group = screen.getByLabelText('Answer choices')
    expect(group.props.accessibilityRole ?? group.props.role).toBe('radiogroup')
  })

  it('exposes every option as a radio, with only the selected one checked', () => {
    render(<OptionList options={OPTIONS} selectedIndex={2} onSelect={jest.fn()} />)
    expect(screen.getAllByRole('radio')).toHaveLength(4)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    const checked = screen.getAllByRole('radio', { checked: true })
    expect(checked).toHaveLength(1)
    expect(within(checked[0]!).getByText('Davao')).toBeTruthy()
    expect(screen.getAllByRole('radio', { checked: false })).toHaveLength(3)
  })

  it('marks no option as checked when selectedIndex is undefined', () => {
    render(<OptionList options={OPTIONS} selectedIndex={undefined} onSelect={jest.fn()} />)
    expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0)
    expect(screen.getAllByRole('radio', { checked: false })).toHaveLength(4)
  })

  // Review finding (HIGH): react-native-web 0.21 drops the nested
  // accessibilityState prop, so the checked state travels as aria-checked
  // (RN maps it natively; RNW writes it to the DOM).
  it('passes the checked state as aria-checked, not accessibilityState', () => {
    render(<OptionList options={OPTIONS} selectedIndex={1} onSelect={jest.fn()} />)
    const radios = screen.UNSAFE_getAllByProps({ accessibilityRole: 'radio' })
      .filter(n => typeof n.props.onPress === 'function') // the Pressable, not its host View
    expect(radios).toHaveLength(4)
    radios.forEach((r, i) => {
      expect(r.props['aria-checked']).toBe(i === 1)
    })
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
    render(<OptionList options={['Manila', 'Cebu', 'Davao']} selectedIndex={undefined} onSelect={jest.fn()} />)
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByText('A')).toBeTruthy()
    expect(screen.getByText('B')).toBeTruthy()
    expect(screen.getByText('C')).toBeTruthy()
    expect(screen.queryByText('D')).toBeNull()
  })

  // Redesign M2: answer choices are at least 48 tall (Android target) and the
  // selected state carries a non-colour cue (a check mark), not a tint alone.
  it('gives every option a touch target at least 48 tall', () => {
    render(<OptionList options={OPTIONS} selectedIndex={undefined} onSelect={jest.fn()} />)
    for (const btn of screen.getAllByRole('radio')) {
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

  // iOS redesign P4: choice states
  it('draws the selected choice with a 2pt accent edge, an accentSurface fill and a filled disc', () => {
    render(<OptionList options={OPTIONS} selectedIndex={1} onSelect={jest.fn()} />)
    const [checked] = screen.getAllByRole('radio', { checked: true })
    const flat = Object.assign({}, ...[checked!.props.style].flat(Infinity).filter(Boolean))
    expect(flat.borderWidth).toBe(2)
    expect(flat.borderColor).toBe('#800000')
    expect(flat.backgroundColor).toBe('rgba(128,0,0,0.10)')
    expect(flat.borderRadius).toBe(14)
  })

  it('letter discs are at least 26pt and grow with the text (no fixed height)', () => {
    render(<OptionList options={OPTIONS} selectedIndex={undefined} onSelect={jest.fn()} />)
    for (const disc of screen.getAllByTestId('option-letter-disc')) {
      const flat = Object.assign({}, ...[disc.props.style].flat(Infinity).filter(Boolean))
      expect(flat.minHeight).toBe(26)
      expect(flat.minWidth).toBe(26)
      expect(flat.height).toBeUndefined()
    }
  })

  it('reveal: the correct choice says Correct (with a check), a wrong pick says Your answer, in the radio name', () => {
    render(<OptionList options={OPTIONS} selectedIndex={2} onSelect={jest.fn()} reveal={{ correctIndex: 1 }} />)
    const radios = screen.getAllByRole('radio')
    expect(within(radios[1]!).getByText('Correct')).toBeTruthy()
    expect(within(radios[2]!).getByText('Your answer')).toBeTruthy()
    expect(screen.getAllByTestId('animated-check', { includeHiddenElements: true })).toHaveLength(1)
    const flat = (n: any) => Object.assign({}, ...[n.props.style].flat(Infinity).filter(Boolean))
    expect(flat(radios[1]).backgroundColor).toBe('rgba(21,128,61,0.10)')
    expect(flat(radios[1]).borderColor).toBe('rgba(21,128,61,0.80)')
    expect(flat(radios[2]).backgroundColor).toBe('rgba(185,28,28,0.10)')
  })

  it('reveal: choices stop taking presses', () => {
    const onSelect = jest.fn()
    render(<OptionList options={OPTIONS} selectedIndex={0} onSelect={onSelect} reveal={{ correctIndex: 0 }} />)
    fireEvent.press(screen.getByText('Cebu'))
    expect(onSelect).not.toHaveBeenCalled()
  })
})
