import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { ReviewCard } from '../ReviewCard'

const OPTIONS = ['Manila', 'Cebu', 'Davao', 'Makati']

describe('ReviewCard', () => {
  it('renders the question stem with its 1-based index', () => {
    render(
      <ReviewCard
        index={3}
        questionText="Capital of the Philippines?"
        options={OPTIONS}
        correctIndex={0}
        selectedIndex={0}
        explanation="Manila is the capital."
      />,
    )
    expect(screen.getByText('Q3. Capital of the Philippines?')).toBeTruthy()
  })

  it('renders all four options', () => {
    render(
      <ReviewCard
        index={1}
        questionText="Q?"
        options={OPTIONS}
        correctIndex={0}
        selectedIndex={undefined}
        explanation="exp"
      />,
    )
    for (const o of OPTIONS) expect(screen.getByText(o)).toBeTruthy()
  })

  it('shows the correct-answer rationale under a "Why {letter} is correct" label', () => {
    render(
      <ReviewCard
        index={1}
        questionText="Q?"
        options={OPTIONS}
        correctIndex={1}
        selectedIndex={0}
        explanation="Cebu is the correct answer because..."
      />,
    )
    expect(screen.getByText('Why B is correct')).toBeTruthy()
    expect(screen.getByText('Cebu is the correct answer because...')).toBeTruthy()
  })

  it('does not render the correct-answer rationale block when explanation is empty', () => {
    render(
      <ReviewCard
        index={1}
        questionText="Q?"
        options={OPTIONS}
        correctIndex={0}
        selectedIndex={0}
        explanation=""
      />,
    )
    expect(screen.queryByText(/Why .* is correct/)).toBeNull()
  })

  it('renders per-option "why it\'s wrong" rows only for options that have them', () => {
    render(
      <ReviewCard
        index={1}
        questionText="Q?"
        options={OPTIONS}
        correctIndex={0}
        selectedIndex={1}
        explanation="exp"
        optionExplanations={[null, 'Cebu is a city, not the capital.', null, null]}
      />,
    )
    expect(screen.getByText('Why the others are wrong')).toBeTruthy()
    expect(screen.getByText(/Cebu is a city, not the capital\./)).toBeTruthy()
  })

  it('omits the "why it\'s wrong" block entirely when optionExplanations is absent or all-empty', () => {
    render(
      <ReviewCard
        index={1}
        questionText="Q?"
        options={OPTIONS}
        correctIndex={0}
        selectedIndex={1}
        explanation="exp"
      />,
    )
    expect(screen.queryByText('Why the others are wrong')).toBeNull()

    render(
      <ReviewCard
        index={2}
        questionText="Q2?"
        options={OPTIONS}
        correctIndex={0}
        selectedIndex={1}
        explanation="exp"
        optionExplanations={[null, null, null, null]}
      />,
    )
    expect(screen.queryByText('Why the others are wrong')).toBeNull()
  })

  it('renders the strategy tip chip only when present', () => {
    const { rerender } = render(
      <ReviewCard
        index={1}
        questionText="Q?"
        options={OPTIONS}
        correctIndex={0}
        selectedIndex={0}
        explanation="exp"
        strategyTip="Eliminate obviously wrong answers first."
      />,
    )
    expect(screen.getByText('💡 Eliminate obviously wrong answers first.')).toBeTruthy()

    rerender(
      <ReviewCard
        index={1}
        questionText="Q?"
        options={OPTIONS}
        correctIndex={0}
        selectedIndex={0}
        explanation="exp"
      />,
    )
    expect(screen.queryByText(/💡/)).toBeNull()
  })

  it('caps question and explanation text font scaling (maxFontSizeMultiplier)', () => {
    render(
      <ReviewCard
        index={1}
        questionText="Q?"
        options={OPTIONS}
        correctIndex={0}
        selectedIndex={0}
        explanation="exp"
      />,
    )
    const qNode = screen.getByText('Q1. Q?')
    expect(qNode.props.maxFontSizeMultiplier).toBeGreaterThan(0)
    expect(qNode.props.maxFontSizeMultiplier).toBeLessThanOrEqual(1.8)
    const expNode = screen.getByText('exp')
    expect(expNode.props.maxFontSizeMultiplier).toBeGreaterThan(0)
    expect(expNode.props.maxFontSizeMultiplier).toBeLessThanOrEqual(1.8)
  })

  it('marks the correct option and the selected wrong option distinctly', () => {
    render(
      <ReviewCard
        index={1}
        questionText="Q?"
        options={OPTIONS}
        correctIndex={0}
        selectedIndex={2}
        explanation="exp"
      />,
    )
    expect(screen.getByText('✓')).toBeTruthy()
    expect(screen.getByText('✗')).toBeTruthy()
  })

  it('renders no marks at all when unanswered (selectedIndex undefined) besides the correct check', () => {
    render(
      <ReviewCard
        index={1}
        questionText="Q?"
        options={OPTIONS}
        correctIndex={0}
        selectedIndex={undefined}
        explanation="exp"
      />,
    )
    expect(screen.getByText('✓')).toBeTruthy()
    expect(screen.queryByText('✗')).toBeNull()
  })
})
