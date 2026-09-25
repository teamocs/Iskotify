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

  // Redesign M2: the runner's section jumper moved out of the exam header and
  // into this sheet, so the question keeps the screen on a phone.
  it('lists sections when given and jumps to one, closing the sheet', () => {
    const onJumpSection = jest.fn()
    const onClose = jest.fn()
    render(
      <ExamReviewSheet
        {...baseProps}
        onClose={onClose}
        sections={[
          { name: 'Language', start: 0, active: true, disabled: false },
          { name: 'Science', start: 2, active: false, disabled: false },
        ]}
        onJumpSection={onJumpSection}
      />,
    )
    fireEvent.press(screen.getByText('Science'))
    expect(onJumpSection).toHaveBeenCalledWith(2)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('gives every question cell a non-colour answered mark', () => {
    render(<ExamReviewSheet {...baseProps} />)
    expect(screen.getAllByTestId('qgrid-answered-mark', { includeHiddenElements: true })).toHaveLength(2)
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

    // Regression (found in the M2 web visual check): react-native-web's
    // findNodeHandle THROWS ("not supported on web"), which unmounted the whole
    // app the moment "Review & submit" opened the sheet — a web student could
    // never submit a mock. On web, RNW's Modal already moves focus in.
    it('opens on web without calling findNodeHandle (it throws there)', () => {
      const RN = require('react-native')
      const restoreOS = jest.replaceProperty(RN.Platform, 'OS', 'web')
      const fnh = jest.spyOn(RN, 'findNodeHandle').mockImplementation(() => {
        throw new Error('findNodeHandle is not supported on web.')
      })
      try {
        expect(() => render(<ExamReviewSheet {...baseProps} visible />)).not.toThrow()
        expect(screen.getByText('Review your answers')).toBeTruthy()
        expect(fnh).not.toHaveBeenCalled()
      } finally {
        fnh.mockRestore()
        restoreOS.restore()
      }
    })

    // Review finding (HIGH): on web, RNW's ModalFocusTrap focuses the first
    // focusable descendant, which is a question cell, so a keyboard or screen
    // reader user skipped the title and the unanswered summary. On web the
    // title is made programmatically focusable and focused when the sheet opens.
    describe('on web', () => {
      const MockNativeMethods = require('react-native/jest/MockNativeMethods').default
      let restoreOS: { restore: () => void }
      beforeEach(() => {
        restoreOS = jest.replaceProperty(require('react-native').Platform, 'OS', 'web')
        MockNativeMethods.focus.mockClear()
      })
      afterEach(() => restoreOS.restore())

      const titleFocusCalls = () =>
        (MockNativeMethods.focus.mock.contexts as any[]).filter(c => c?.props?.children === 'Review your answers').length

      it('makes the title programmatically focusable (tabIndex -1)', () => {
        render(<ExamReviewSheet {...baseProps} visible />)
        expect(screen.getByText('Review your answers').props.tabIndex).toBe(-1)
      })

      it('focuses the title when the sheet opens, and again on each reopen', () => {
        const { rerender } = render(<ExamReviewSheet {...baseProps} visible={false} />)
        expect(titleFocusCalls()).toBe(0)
        rerender(<ExamReviewSheet {...baseProps} visible />)
        expect(titleFocusCalls()).toBe(1)
        rerender(<ExamReviewSheet {...baseProps} visible={false} />)
        rerender(<ExamReviewSheet {...baseProps} visible />)
        expect(titleFocusCalls()).toBe(2)
        expect(focusSpy).not.toHaveBeenCalled()
      })
    })

    it('leaves the native title out of the tab order (native focus is unchanged)', () => {
      render(<ExamReviewSheet {...baseProps} visible />)
      expect(screen.getByText('Review your answers').props.tabIndex).toBeUndefined()
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
