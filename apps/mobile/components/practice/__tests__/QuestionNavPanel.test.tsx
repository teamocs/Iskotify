import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { QuestionNavPanel } from '../QuestionNavPanel'

const base = {
  total: 6,
  currentIdx: 2,
  answeredIdxs: new Set([0, 1]),
  flaggedIdxs: new Set([4]),
  floorIdx: 0,
  onJump: jest.fn(),
}

describe('QuestionNavPanel (desktop side panel)', () => {
  beforeEach(() => base.onJump.mockClear())

  it('is a labelled region with a heading and an answered count', () => {
    render(<QuestionNavPanel {...base} />)
    expect(screen.getByRole('header', { name: 'Questions' })).toBeTruthy()
    expect(screen.getByText('2 of 6 answered')).toBeTruthy()
  })

  it('names every cell by number and state, and marks the current one selected', () => {
    render(<QuestionNavPanel {...base} />)
    expect(screen.getByLabelText('Question 1, answered')).toBeTruthy()
    expect(screen.getByLabelText('Question 5, unanswered, flagged')).toBeTruthy()
    expect(screen.getByLabelText('Question 3, unanswered').props.accessibilityState).toMatchObject({ selected: true })
  })

  it('gives every cell at least a 44pt target', () => {
    render(<QuestionNavPanel {...base} />)
    const cell = screen.getByLabelText('Question 1, answered')
    const flat = Object.assign({}, ...[cell.props.style].flat(Infinity).filter(Boolean))
    expect(flat.minWidth ?? flat.width).toBeGreaterThanOrEqual(44)
    expect(flat.minHeight ?? flat.height).toBeGreaterThanOrEqual(44)
  })

  it('shows a non-colour mark on answered cells', () => {
    render(<QuestionNavPanel {...base} />)
    expect(screen.getAllByTestId('qgrid-answered-mark', { includeHiddenElements: true })).toHaveLength(2)
  })

  it('jumps to a tapped question', () => {
    render(<QuestionNavPanel {...base} />)
    fireEvent.press(screen.getByLabelText('Question 4, unanswered'))
    expect(base.onJump).toHaveBeenCalledWith(3)
  })

  it('disables questions in a locked (expired) section', () => {
    render(<QuestionNavPanel {...base} floorIdx={2} />)
    const locked = screen.getByLabelText('Question 1, answered')
    expect(locked.props.accessibilityState).toMatchObject({ disabled: true })
    fireEvent.press(locked)
    expect(base.onJump).not.toHaveBeenCalled()
  })
})
