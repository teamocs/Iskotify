import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { QuestionCard } from '../QuestionCard'

// ExamPassage pulls in react-native-safe-area-context + its own rendering concerns;
// shallow-mock it so this test stays scoped to QuestionCard's own composition logic.
jest.mock('../ExamPassage', () => ({
  ExamPassage: ({ passage }: { passage: string }) => {
    const { Text } = require('react-native')
    return <Text testID="passage-panel">{passage}</Text>
  },
}))

describe('QuestionCard', () => {
  it('renders the question text', () => {
    render(<QuestionCard questionText="What is 2 + 2?" />)
    expect(screen.getByText('What is 2 + 2?')).toBeTruthy()
  })

  it('does not render a passage panel when no passageText is given', () => {
    render(<QuestionCard questionText="Q" />)
    expect(screen.queryByTestId('passage-panel')).toBeNull()
  })

  it('renders the passage panel above the question when passageText is given', () => {
    render(<QuestionCard questionText="Q" passageText="Once upon a time…" />)
    expect(screen.getByTestId('passage-panel')).toBeTruthy()
    expect(screen.getByText('Once upon a time…')).toBeTruthy()
  })

  it('renders the subject tag when given (diagnostic engine)', () => {
    render(<QuestionCard questionText="Q" subjectTag="Mathematics" />)
    expect(screen.getByText('Mathematics')).toBeTruthy()
  })

  it('omits the subject tag when not given', () => {
    render(<QuestionCard questionText="Q" />)
    expect(screen.queryByText('Mathematics')).toBeNull()
  })

  it('hides the report row entirely when onReport is not passed (diagnostic has no report flow)', () => {
    render(<QuestionCard questionText="Q" />)
    expect(screen.queryByRole('button', { name: 'Report this question' })).toBeNull()
    expect(screen.queryByText('Reported')).toBeNull()
  })

  it('shows the report button when onReport is passed and not yet reported', () => {
    const onReport = jest.fn()
    render(<QuestionCard questionText="Q" onReport={onReport} />)
    const btn = screen.getByRole('button', { name: 'Report this question' })
    expect(btn).toBeTruthy()
    fireEvent.press(btn)
    expect(onReport).toHaveBeenCalledTimes(1)
  })

  it('shows "Reported ✓" and hides the report button once reported', () => {
    render(<QuestionCard questionText="Q" onReport={jest.fn()} reported />)
    expect(screen.getByText('Reported')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Report this question' })).toBeNull()
  })

  it('caps the question text font scaling (maxFontSizeMultiplier)', () => {
    render(<QuestionCard questionText="Capped question" />)
    const node = screen.getByText('Capped question')
    expect(node.props.maxFontSizeMultiplier).toBeGreaterThan(0)
    expect(node.props.maxFontSizeMultiplier).toBeLessThanOrEqual(1.8)
  })

  it('caps the report row text font scaling', () => {
    render(<QuestionCard questionText="Q" onReport={jest.fn()} />)
    const node = screen.getByText('Report')
    expect(node.props.maxFontSizeMultiplier).toBeGreaterThan(0)
    expect(node.props.maxFontSizeMultiplier).toBeLessThanOrEqual(1.8)
  })

  it('renders the question figure between the stem and the report row when imageUrl is given', () => {
    render(
      <QuestionCard
        questionText="Q"
        onReport={jest.fn()}
        imageUrl="https://example.com/circuit.png"
        imageAlt="Series circuit"
      />,
    )
    expect(screen.getByLabelText('Series circuit')).toBeTruthy()
  })

  it('renders no figure when imageUrl is absent', () => {
    render(<QuestionCard questionText="Q" />)
    expect(screen.queryByLabelText('Question figure')).toBeNull()
  })

  // Redesign M2: the report control is a real 44pt button with a drawn icon
  // (no glyph), and the question is the dominant, readable element.
  it('gives the report control a 44pt target and an explicit name', () => {
    render(<QuestionCard questionText="Q" onReport={jest.fn()} />)
    const btn = screen.getByRole('button', { name: 'Report this question' })
    const flat = Object.assign({}, ...[btn.props.style].flat(Infinity).filter(Boolean))
    expect(flat.minHeight).toBeGreaterThanOrEqual(44)
  })

  it('renders the question stem as a header-sized reading line (no numeric fontSize below 20)', () => {
    render(<QuestionCard questionText="Big question" />)
    const flat = Object.assign({}, ...[screen.getByText('Big question').props.style].flat(Infinity).filter(Boolean))
    expect(flat.fontSize).toBeGreaterThanOrEqual(20)
  })

  it('shows a question number when given, for orientation', () => {
    render(<QuestionCard questionText="Q" questionLabel="Question 3 of 40" />)
    expect(screen.getByText('Question 3 of 40')).toBeTruthy()
  })
})

