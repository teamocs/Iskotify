import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { ResultsScoreCard } from '../ResultsScoreCard'

// Fix 3 (exam safety) + iOS redesign P4: results never read as pass/fail —
// no verdict words, no band, no percentile, just the raw score in a neutral
// ring, "N of M", an optional factual headline and the Correct/Wrong/Skipped strip.
describe('ResultsScoreCard', () => {
  it('shows the percent (tabular, largeTitle) and "N of M"', () => {
    render(<ResultsScoreCard pct={85} correct={17} total={20} />)
    const pct = screen.getByText('85%')
    const flat = Object.assign({}, ...[pct.props.style].flat(Infinity).filter(Boolean))
    expect(flat.fontSize).toBe(34)
    expect(flat.fontVariant).toEqual(['tabular-nums'])
    expect(screen.getByText('17 of 20')).toBeTruthy()
  })

  it('draws the score ring as one image with a spoken label', () => {
    render(<ResultsScoreCard pct={72} correct={18} total={25} />)
    const ring = screen.getByLabelText('Score: 72%, 18 of 25 correct')
    expect(ring.props.accessibilityRole ?? ring.props.role).toMatch(/image|img/)
    expect(ring.props.role).toBe('img')
  })

  it('shows no band or verdict line at all', () => {
    render(<ResultsScoreCard pct={85} correct={17} total={20} />)
    for (const word of ['Competitive', 'Top tier', 'Developing', 'Foundational']) {
      expect(screen.queryByText(word)).toBeNull()
    }
  })

  it('shows the Correct / Wrong / Skipped strip when the counts are given', () => {
    render(<ResultsScoreCard pct={60} correct={6} total={10} wrong={3} skipped={1} />)
    expect(screen.getByLabelText('Correct: 6')).toBeTruthy()
    expect(screen.getByLabelText('Wrong: 3')).toBeTruthy()
    expect(screen.getByLabelText('Skipped: 1')).toBeTruthy()
  })

  it('shows a headline only when one is passed (never a default line)', () => {
    const { rerender } = render(<ResultsScoreCard pct={60} correct={6} total={10} />)
    expect(screen.queryByText(/since/)).toBeNull()
    rerender(<ResultsScoreCard pct={60} correct={6} total={10} headline="Up 9 points since last week" />)
    expect(screen.getByText('Up 9 points since last week')).toBeTruthy()
  })

  it.each([
    ['Below cut-off', 30],
    ['pass', 30],
    ['fail', 30],
    ['Great work', 90],
    ['Keep practicing', 30],
    ['percentile', 30],
    ['Top tier', 95],
  ])('never renders the banned word/phrase "%s" at pct=%i', (banned, pct) => {
    render(<ResultsScoreCard pct={pct} correct={1} total={10} wrong={2} skipped={0} />)
    const tree = JSON.stringify(screen.toJSON())
    expect(tree.toLowerCase()).not.toContain(banned.toLowerCase())
  })

  it('renders identically (no colour-coded pass/fail card) whether the score is low or high', () => {
    const { toJSON: lowJson } = render(<ResultsScoreCard pct={10} correct={1} total={10} />)
    const { toJSON: highJson } = render(<ResultsScoreCard pct={95} correct={19} total={20} />)
    function cardBg(tree: any): string | undefined {
      const style = Array.isArray(tree.props.style) ? Object.assign({}, ...tree.props.style) : tree.props.style
      return style.backgroundColor
    }
    expect(cardBg(lowJson())).toBe(cardBg(highJson()))
    expect(cardBg(lowJson())).toBe('#ffffff')
  })
})
