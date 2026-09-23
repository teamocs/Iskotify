import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { QuestionFigure } from '../QuestionFigure'

describe('QuestionFigure', () => {
  it('renders nothing when no imageUrl is given', () => {
    const { toJSON } = render(<QuestionFigure imageUrl={null} imageAlt="A diagram" />)
    expect(toJSON()).toBeNull()
  })

  it('renders the image with an accessible label from imageAlt', () => {
    render(
      <QuestionFigure
        imageUrl="https://example.com/circuit.png"
        imageAlt="Series circuit with two resistors"
        imageWidth={800}
        imageHeight={600}
      />,
    )
    const fig = screen.getByLabelText('Series circuit with two resistors')
    expect(fig).toBeTruthy()
    expect(fig.props.accessibilityRole).toBe('image')
  })

  it('falls back to a generic label when imageAlt is missing', () => {
    render(<QuestionFigure imageUrl="https://example.com/circuit.png" />)
    expect(screen.getByLabelText('Question figure')).toBeTruthy()
  })

  it('shows a bordered placeholder with the caption when the image fails to load', () => {
    render(
      <QuestionFigure
        imageUrl="https://example.com/circuit.png"
        imageAlt="Series circuit with two resistors"
      />,
    )
    fireEvent(screen.getByTestId('question-figure-image'), 'error')
    expect(screen.getByText('Series circuit with two resistors')).toBeTruthy()
    expect(screen.getByText('Figure unavailable offline')).toBeTruthy()
  })

  it('opens a full-screen zoom modal on press and closes it via the close button', () => {
    render(
      <QuestionFigure
        imageUrl="https://example.com/circuit.png"
        imageAlt="Series circuit with two resistors"
      />,
    )
    expect(screen.queryByLabelText('Close figure')).toBeNull()
    fireEvent.press(screen.getByLabelText('Series circuit with two resistors'))
    expect(screen.getByLabelText('Close figure')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('Close figure'))
    expect(screen.queryByLabelText('Close figure')).toBeNull()
  })
})
