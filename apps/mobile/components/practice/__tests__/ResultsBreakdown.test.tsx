import React from 'react'
import { render, screen, within } from '@testing-library/react-native'
import { ResultsBreakdown } from '../ResultsBreakdown'

const rows = [
  { name: 'Math', correct: 2, total: 3, pct: 67 },
  { name: 'Science', correct: 0, total: 2, pct: 0 },
]

describe('ResultsBreakdown ("By skill", iOS redesign P4)', () => {
  it('is an inset group headed "By skill"', () => {
    render(<ResultsBreakdown rows={rows} />)
    expect(screen.getByRole('header', { name: 'By skill' })).toBeTruthy()
    expect(within(screen.getByTestId('results-by-skill')).getByTestId('inset-group')).toBeTruthy()
  })

  it('shows each skill with its raw count and a tabular percent', () => {
    render(<ResultsBreakdown rows={rows} />)
    expect(screen.getByText('Math')).toBeTruthy()
    expect(screen.getByText('2 of 3 correct')).toBeTruthy()
    const pct = screen.getByText('67%')
    expect(Object.assign({}, ...[pct.props.style].flat(Infinity).filter(Boolean)).fontVariant).toEqual(['tabular-nums'])
  })

  it('draws a neutral, labelled 4pt bar per skill (same tone regardless of score)', () => {
    render(<ResultsBreakdown rows={rows} />)
    const bars = screen.getAllByRole('progressbar')
    expect(bars).toHaveLength(2)
    expect(bars[0]!.props.accessibilityLabel).toBe('Math score')
    expect(bars[1]!.props.accessibilityValue).toMatchObject({ now: 0 })
    const style = (bar: any) => Object.assign({}, ...[bar.props.style].flat(Infinity).filter(Boolean))
    expect(style(bars[0]).height).toBe(4)
    const fill = (bar: any) => Object.assign({}, ...[bar.children[0].props.style].flat(Infinity).filter(Boolean)).backgroundColor
    expect(fill(bars[0])).toBe(fill(bars[1]))
  })

  it('gives the weakest skill the calm hint "Focus here next", and only that one', () => {
    render(<ResultsBreakdown rows={rows} />)
    expect(screen.getByText('0 of 2 correct · Focus here next')).toBeTruthy()
    expect(screen.getAllByText(/Focus here next/)).toHaveLength(1)
  })

  it('makes no suggestion for a single skill', () => {
    render(<ResultsBreakdown rows={[rows[0]!]} />)
    expect(screen.queryByText(/Focus here next/)).toBeNull()
  })

  it('never uses verdict language', () => {
    render(<ResultsBreakdown rows={rows} />)
    const tree = JSON.stringify(screen.toJSON()).toLowerCase()
    for (const banned of ['pass', 'fail', 'below cut-off', 'percentile', 'weak', 'hakbang']) expect(tree).not.toContain(banned)
  })
})
