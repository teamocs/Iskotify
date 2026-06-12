import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { SectionGrid } from '../SectionGrid'

type Section = { name: string; start: number; active: boolean; disabled: boolean }

function makeSections(): Section[] {
  return [
    { name: 'Language Proficiency', start: 0, active: true, disabled: false },
    { name: 'Reading Comprehension', start: 20, active: false, disabled: false },
    { name: 'Science', start: 40, active: false, disabled: true },
    { name: 'Mathematics', start: 60, active: false, disabled: false },
  ]
}

describe('SectionGrid', () => {
  it('renders every section name', () => {
    const { getByText } = render(<SectionGrid sections={makeSections()} onJump={jest.fn()} />)
    expect(getByText('Language Proficiency')).toBeTruthy()
    expect(getByText('Reading Comprehension')).toBeTruthy()
    expect(getByText('Science')).toBeTruthy()
    expect(getByText('Mathematics')).toBeTruthy()
  })

  it('pressing an enabled card calls onJump with that section start index', () => {
    const onJump = jest.fn()
    const { getByText } = render(<SectionGrid sections={makeSections()} onJump={onJump} />)
    fireEvent.press(getByText('Mathematics'))
    expect(onJump).toHaveBeenCalledTimes(1)
    expect(onJump).toHaveBeenCalledWith(60)
  })

  it('pressing a disabled card does NOT call onJump', () => {
    const onJump = jest.fn()
    const { getByText } = render(<SectionGrid sections={makeSections()} onJump={onJump} />)
    fireEvent.press(getByText('Science'))
    expect(onJump).not.toHaveBeenCalled()
  })

  it('exposes accessibilityState: active card selected, disabled card disabled', () => {
    const { getAllByRole } = render(<SectionGrid sections={makeSections()} onJump={jest.fn()} />)
    const buttons = getAllByRole('button')
    expect(buttons).toHaveLength(4)
    const active = buttons.find(b => b.props.accessibilityState?.selected === true)
    expect(active).toBeTruthy()
    const disabled = buttons.filter(b => b.props.accessibilityState?.disabled === true)
    expect(disabled).toHaveLength(1)
  })

  it('renders nothing for a single section', () => {
    const single: Section[] = [{ name: 'Only One', start: 0, active: true, disabled: false }]
    const { toJSON, queryByText } = render(<SectionGrid sections={single} onJump={jest.fn()} />)
    expect(queryByText('Only One')).toBeNull()
    expect(toJSON()).toBeNull()
  })

  it('renders nothing for zero sections', () => {
    const { toJSON } = render(<SectionGrid sections={[]} onJump={jest.fn()} />)
    expect(toJSON()).toBeNull()
  })
})
