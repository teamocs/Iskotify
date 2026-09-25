import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { ResultsBreakdown } from '../ResultsBreakdown'

const rows = [
  { name: 'Math', correct: 2, total: 3, pct: 67 },
  { name: 'Science', correct: 0, total: 2, pct: 0 },
]

describe('ResultsBreakdown (per-subtest results)', () => {
  it('keeps the "Per-section" heading the results flow is known by', () => {
    render(<ResultsBreakdown rows={rows} />)
    expect(screen.getByRole('header', { name: 'Per-section' })).toBeTruthy()
  })

  it('shows each subtest with raw count and percent', () => {
    render(<ResultsBreakdown rows={rows} />)
    expect(screen.getByText('Math')).toBeTruthy()
    expect(screen.getByText('2/3 correct · 67%')).toBeTruthy()
    expect(screen.getByText('0/2 correct · 0%')).toBeTruthy()
  })

  it('draws a neutral, labelled bar per subtest (same tone regardless of score)', () => {
    render(<ResultsBreakdown rows={rows} />)
    const bars = screen.getAllByRole('progressbar')
    expect(bars).toHaveLength(2)
    expect(bars[0]!.props.accessibilityLabel).toBe('Math score')
    expect(bars[1]!.props.accessibilityValue).toMatchObject({ now: 0 })
    const fill = (bar: any) => Object.assign({}, ...[bar.children[0].props.style].flat(Infinity).filter(Boolean)).backgroundColor
    expect(fill(bars[0])).toBe(fill(bars[1]))
  })

  it('suggests the lowest subtest as the next step, encouragingly', () => {
    render(<ResultsBreakdown rows={rows} />)
    expect(screen.getByText('Science is your next hakbang. It has the most room to grow.')).toBeTruthy()
  })

  it('makes no suggestion for a single subtest', () => {
    render(<ResultsBreakdown rows={[rows[0]!]} />)
    expect(screen.queryByText(/next hakbang/)).toBeNull()
  })

  it('never uses verdict language', () => {
    render(<ResultsBreakdown rows={rows} />)
    const tree = JSON.stringify(screen.toJSON()).toLowerCase()
    for (const banned of ['pass', 'fail', 'below cut-off', 'percentile', 'weak']) expect(tree).not.toContain(banned)
  })
})
