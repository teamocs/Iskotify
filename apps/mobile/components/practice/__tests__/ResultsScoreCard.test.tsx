import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { ResultsScoreCard } from '../ResultsScoreCard'

// Fix 3 (exam safety): results must never read as pass/fail — no verdict
// words, no percentile, just the raw score and a descriptive, neutral band.
describe('ResultsScoreCard', () => {
  it('shows the raw percent and the correct/total count', () => {
    render(<ResultsScoreCard pct={85} correct={17} total={20} />)
    expect(screen.getByText('85%')).toBeTruthy()
    expect(screen.getByText('17/20 correct')).toBeTruthy()
  })

  it('shows a descriptive band derived from the score, not a pass/fail verdict', () => {
    render(<ResultsScoreCard pct={85} correct={17} total={20} />)
    expect(screen.getByText('Competitive')).toBeTruthy()
  })

  it.each([
    ['Below cut-off', 30],
    ['pass', 30],
    ['fail', 30],
    ['Great work', 90],
    ['Keep practicing', 30],
    ['percentile', 30],
  ])('never renders the banned word/phrase "%s" at pct=%i', (banned, pct) => {
    render(<ResultsScoreCard pct={pct} correct={1} total={10} />)
    const tree = JSON.stringify(screen.toJSON())
    expect(tree.toLowerCase()).not.toContain(banned.toLowerCase())
  })

  it('renders identically (no color-coded pass/fail card) whether the score is low or high — same card style', () => {
    const { toJSON: lowJson } = render(<ResultsScoreCard pct={10} correct={1} total={10} />)
    const { toJSON: highJson } = render(<ResultsScoreCard pct={95} correct={19} total={20} />)
    function cardBg(tree: any): string | undefined {
      // First View's style array should include a fixed neutral backgroundColor prop.
      const style = Array.isArray(tree.props.style) ? Object.assign({}, ...tree.props.style) : tree.props.style
      return style.backgroundColor
    }
    expect(cardBg(lowJson())).toBe(cardBg(highJson()))
  })
})
