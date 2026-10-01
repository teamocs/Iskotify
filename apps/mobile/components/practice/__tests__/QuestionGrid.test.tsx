import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { QuestionGrid } from '../QuestionGrid'

const props = { total: 4, currentIdx: 2, answeredIdxs: new Set<number>([0]), onPressCell: jest.fn() }
const cellProps = (label: string) =>
  screen.UNSAFE_getAllByProps({ accessibilityLabel: label }).find(n => typeof n.type !== 'string')!.props

describe('QuestionGrid: locked cells say why', () => {
  it('a cell in an expired section explains the lock in its accessible name', () => {
    render(<QuestionGrid {...props} floorIdx={2} />)
    const p = cellProps('Question 1, answered, locked until you finish this section')
    expect(p.disabled).toBe(true)
    expect(p['aria-disabled']).toBe(true)
  })

  it('a cell in a later section is explained the same way', () => {
    render(<QuestionGrid {...props} currentIdx={0} ceilIdx={2} />)
    expect(cellProps('Question 4, unanswered, locked until you finish this section')['aria-disabled']).toBe(true)
  })

  it('open cells carry no lock wording', () => {
    render(<QuestionGrid {...props} floorIdx={2} />)
    expect(screen.getByLabelText('Question 3, unanswered, current question')).toBeTruthy()
    expect(screen.queryAllByLabelText(/Question 3.*locked/)).toHaveLength(0)
  })

  it('draws a non-opacity lock mark on locked cells only', () => {
    render(<QuestionGrid {...props} floorIdx={2} />)
    expect(screen.getAllByTestId('qgrid-lock-mark', { includeHiddenElements: true })).toHaveLength(2)
  })
})
