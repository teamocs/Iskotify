import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { QuestionCard } from '../QuestionCard'

// PassagePanel pulls in react-native-safe-area-context + its own rendering concerns;
// shallow-mock it so this test stays scoped to QuestionCard's own composition logic.
jest.mock('../../upcat/PassagePanel', () => ({
  PassagePanel: ({ passage }: { passage: string }) => {
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
    expect(screen.queryByText('⚐ Report')).toBeNull()
    expect(screen.queryByText('Reported ✓')).toBeNull()
  })

  it('shows the report button when onReport is passed and not yet reported', () => {
    const onReport = jest.fn()
    render(<QuestionCard questionText="Q" onReport={onReport} />)
    const btn = screen.getByText('⚐ Report')
    expect(btn).toBeTruthy()
    fireEvent.press(btn)
    expect(onReport).toHaveBeenCalledTimes(1)
  })

  it('shows "Reported ✓" and hides the report button once reported', () => {
    render(<QuestionCard questionText="Q" onReport={jest.fn()} reported />)
    expect(screen.getByText('Reported ✓')).toBeTruthy()
    expect(screen.queryByText('⚐ Report')).toBeNull()
  })

  it('caps the question text font scaling (maxFontSizeMultiplier)', () => {
    render(<QuestionCard questionText="Capped question" />)
    const node = screen.getByText('Capped question')
    expect(node.props.maxFontSizeMultiplier).toBeGreaterThan(0)
    expect(node.props.maxFontSizeMultiplier).toBeLessThanOrEqual(1.8)
  })

  it('caps the report row text font scaling', () => {
    render(<QuestionCard questionText="Q" onReport={jest.fn()} />)
    const node = screen.getByText('⚐ Report')
    expect(node.props.maxFontSizeMultiplier).toBeGreaterThan(0)
    expect(node.props.maxFontSizeMultiplier).toBeLessThanOrEqual(1.8)
  })
})
