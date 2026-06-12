import React from 'react'
import { render, fireEvent, screen } from '@testing-library/react-native'
import { ReportQuestionModal } from '../ReportQuestionModal'

describe('ReportQuestionModal', () => {
  it('renders nothing when visible=false', () => {
    render(<ReportQuestionModal visible={false} onClose={jest.fn()} onSubmit={jest.fn()} />)
    expect(screen.queryByText('Report this question')).toBeNull()
  })

  it('shows the title and all four preset reasons when visible', () => {
    render(<ReportQuestionModal visible onClose={jest.fn()} onSubmit={jest.fn()} />)
    expect(screen.getByText('Report this question')).toBeTruthy()
    expect(screen.getByText('Wrong answer')).toBeTruthy()
    expect(screen.getByText('Typo or formatting issue')).toBeTruthy()
    expect(screen.getByText('Question is unclear')).toBeTruthy()
    expect(screen.getByText('Other')).toBeTruthy()
  })

  it('Submit is disabled until a preset is chosen', () => {
    const onSubmit = jest.fn()
    render(<ReportQuestionModal visible onClose={jest.fn()} onSubmit={onSubmit} />)

    fireEvent.press(screen.getByText('Submit'))
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.press(screen.getByText('Wrong answer'))
    fireEvent.press(screen.getByText('Submit'))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith('Wrong answer')
  })

  it('passes "preset — details" when details are typed', () => {
    const onSubmit = jest.fn()
    render(<ReportQuestionModal visible onClose={jest.fn()} onSubmit={onSubmit} />)

    fireEvent.press(screen.getByText('Question is unclear'))
    fireEvent.changeText(
      screen.getByPlaceholderText('Add details (optional)'),
      '  option B and C look identical  ',
    )
    fireEvent.press(screen.getByText('Submit'))

    expect(onSubmit).toHaveBeenCalledWith('Question is unclear — option B and C look identical')
  })

  it('Cancel calls onClose without submitting', () => {
    const onClose = jest.fn()
    const onSubmit = jest.fn()
    render(<ReportQuestionModal visible onClose={onClose} onSubmit={onSubmit} />)

    fireEvent.press(screen.getByText('Wrong answer'))
    fireEvent.press(screen.getByText('Cancel'))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('resets prior selection and details when reopened', () => {
    const onSubmit = jest.fn()
    const { rerender } = render(
      <ReportQuestionModal visible onClose={jest.fn()} onSubmit={onSubmit} />,
    )

    fireEvent.press(screen.getByText('Other'))
    fireEvent.changeText(screen.getByPlaceholderText('Add details (optional)'), 'stale text')

    rerender(<ReportQuestionModal visible={false} onClose={jest.fn()} onSubmit={onSubmit} />)
    rerender(<ReportQuestionModal visible onClose={jest.fn()} onSubmit={onSubmit} />)

    // Selection cleared → Submit is disabled again
    fireEvent.press(screen.getByText('Submit'))
    expect(onSubmit).not.toHaveBeenCalled()
    // Details cleared
    expect(screen.getByPlaceholderText('Add details (optional)').props.value).toBe('')
  })
})
