import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { SectionGrid } from '../SectionGrid'
import { aria } from '../../../test-utils/aria'

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

  // aria-selected is invalid on a button, so the active section is named
  // "<section>, current section" (heard the same on web and native).
  it('announces the active card as the current section and the locked card as disabled', () => {
    const { getAllByRole, getByRole } = render(<SectionGrid sections={makeSections()} onJump={jest.fn()} />)
    const buttons = getAllByRole('button')
    expect(buttons).toHaveLength(4)
    expect(getByRole('button', { name: 'Language Proficiency, current section' })).toBeTruthy()
    expect(getAllByRole('button', { name: /current section/ })).toHaveLength(1)
    expect(buttons.filter(b => aria(b, 'aria-disabled') === true)).toHaveLength(1)
    expect(aria(getByRole('button', { name: 'Science' }), 'aria-disabled')).toBe(true)
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
