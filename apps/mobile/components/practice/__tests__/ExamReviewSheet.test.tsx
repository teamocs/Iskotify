import React from 'react'
import { render, fireEvent, screen } from '@testing-library/react-native'
import { Alert, AccessibilityInfo } from 'react-native'
import { ExamReviewSheet } from '../ExamReviewSheet'

describe('ExamReviewSheet', () => {
  let alertSpy: jest.SpyInstance
  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  })
  afterEach(() => alertSpy.mockRestore())

  const baseProps = {
    visible: true,
    total: 4,
    currentIdx: 0,
    answeredIdxs: new Set([0, 2]),
    onJump: jest.fn(),
    onClose: jest.fn(),
    onSubmit: jest.fn(),
  }

  it('lists every question with an answered/unanswered accessibility state', () => {
    render(<ExamReviewSheet {...baseProps} />)
    expect(screen.getByLabelText('Question 1, answered')).toBeTruthy()
    expect(screen.getByLabelText('Question 2, unanswered')).toBeTruthy()
    expect(screen.getByLabelText('Question 3, answered')).toBeTruthy()
    expect(screen.getByLabelText('Question 4, unanswered')).toBeTruthy()
  })

  it('shows how many questions are unanswered', () => {
    render(<ExamReviewSheet {...baseProps} />)
    expect(screen.getByText(/2 unanswered/i)).toBeTruthy()
  })

  it('shows an all-answered summary when nothing is left blank', () => {
    render(<ExamReviewSheet {...baseProps} answeredIdxs={new Set([0, 1, 2, 3])} />)
    expect(screen.getByText(/all questions answered/i)).toBeTruthy()
  })

  it('jumps to the tapped question and closes the sheet', () => {
    const onJump = jest.fn()
    const onClose = jest.fn()
    render(<ExamReviewSheet {...baseProps} onJump={onJump} onClose={onClose} />)
    fireEvent.press(screen.getByLabelText('Question 2, unanswered'))
    expect(onJump).toHaveBeenCalledWith(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('flags a reported question distinctly from plain unanswered/answered', () => {
    render(<ExamReviewSheet {...baseProps} flaggedIdxs={new Set([1])} />)
    expect(screen.getByLabelText('Question 2, unanswered, flagged')).toBeTruthy()
  })

  // Fix 2: the whole point — Submit exam must ask for confirmation and
  // mention the unanswered count, never submit on a single tap.
  it('does NOT call onSubmit on a single tap of "Submit exam" — it asks for confirmation first', () => {
    const onSubmit = jest.fn()
    render(<ExamReviewSheet {...baseProps} onSubmit={onSubmit} />)
    fireEvent.press(screen.getByRole('button', { name: /submit exam/i }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(alertSpy).toHaveBeenCalledTimes(1)
    const [, message] = alertSpy.mock.calls[0]!
    expect(message).toMatch(/2 unanswered/i)
  })

  it('calls onSubmit once the confirmation is accepted', () => {
    const onSubmit = jest.fn()
    render(<ExamReviewSheet {...baseProps} onSubmit={onSubmit} />)
    fireEvent.press(screen.getByRole('button', { name: /submit exam/i }))
    const buttons = alertSpy.mock.calls[0]![2] as { text: string; onPress?: () => void }[]
    buttons.find(b => b.text.toLowerCase().includes('submit'))!.onPress!()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('closes without submitting via "Back to exam"', () => {
    const onClose = jest.fn()
    const onSubmit = jest.fn()
    render(<ExamReviewSheet {...baseProps} onClose={onClose} onSubmit={onSubmit} />)
    fireEvent.press(screen.getByRole('button', { name: /back to exam/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // Review finding #4 (MEDIUM): the sheet is a full-screen modal — it needs
  // accessibilityViewIsModal (so screen readers don't escape into content
  // behind it), an accessibilityRole="header" title, and initial focus moved
  // onto that title when it opens.
  describe('accessibility', () => {
    let focusSpy: jest.SpyInstance

    beforeEach(() => {
      focusSpy = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => {})
    })
    afterEach(() => focusSpy.mockRestore())

    it('marks the sheet content as a modal view for assistive technology', () => {
      render(<ExamReviewSheet {...baseProps} />)
      const title = screen.getByText('Review your answers')
      // Walk up from the title to find the ancestor flagged as the modal view.
      let node: any = title.parent
      let found = false
      while (node) {
        if (node.props?.accessibilityViewIsModal) { found = true; break }
        node = node.parent
      }
      expect(found).toBe(true)
    })

    it('gives the title an accessibilityRole of "header"', () => {
      render(<ExamReviewSheet {...baseProps} />)
      expect(screen.getByText('Review your answers').props.accessibilityRole).toBe('header')
    })

    it('moves accessibility focus onto the title when the sheet becomes visible', () => {
      render(<ExamReviewSheet {...baseProps} visible={true} />)
      expect(focusSpy).toHaveBeenCalledTimes(1)
    })

    it('does not steal focus while the sheet is closed', () => {
      render(<ExamReviewSheet {...baseProps} visible={false} />)
      expect(focusSpy).not.toHaveBeenCalled()
    })

    it('moves focus again each time the sheet reopens', () => {
      const { rerender } = render(<ExamReviewSheet {...baseProps} visible={false} />)
      expect(focusSpy).not.toHaveBeenCalled()
      rerender(<ExamReviewSheet {...baseProps} visible={true} />)
      expect(focusSpy).toHaveBeenCalledTimes(1)
    })
  })
})
