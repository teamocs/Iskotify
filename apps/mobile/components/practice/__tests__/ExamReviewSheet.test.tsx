import React from 'react'
import { render, fireEvent, screen, act } from '@testing-library/react-native'
import { Alert, AccessibilityInfo } from 'react-native'
import { ExamReviewSheet } from '../ExamReviewSheet'
import { aria } from '../../../test-utils/aria'

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
    expect(screen.getByLabelText('Question 1, answered, current question')).toBeTruthy()
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

  // Review finding #4 (MEDIUM) + iOS redesign P4: the sheet is the P3 Sheet,
  // so it is a modal view for assistive technology, the title is a header,
  // native screen-reader focus moves to the title once it has slid in, and the
  // web focus trap starts at Close with the summary next (never on a cell).
  describe('accessibility (P3 Sheet contract)', () => {
    let focusSpy: jest.SpyInstance
    let nodeSpy: jest.SpyInstance

    beforeEach(() => {
      jest.useFakeTimers()
      focusSpy = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => {})
      nodeSpy = jest.spyOn(require('react-native'), 'findNodeHandle').mockReturnValue(1)
    })
    afterEach(() => {
      focusSpy.mockRestore()
      nodeSpy.mockRestore()
      jest.useRealTimers()
    })

    it('marks the sheet content as a modal view for assistive technology', () => {
      render(<ExamReviewSheet {...baseProps} />)
      const title = screen.getByText('Review your answers')
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

    it('moves accessibility focus onto the title once the sheet is up', () => {
      render(<ExamReviewSheet {...baseProps} visible={true} />)
      act(() => { jest.advanceTimersByTime(300) })
      expect(focusSpy).toHaveBeenCalledTimes(1)
    })

    it('does not steal focus while the sheet is closed', () => {
      render(<ExamReviewSheet {...baseProps} visible={false} />)
      act(() => { jest.advanceTimersByTime(300) })
      expect(focusSpy).not.toHaveBeenCalled()
    })

    it('moves focus again each time the sheet reopens', () => {
      const { rerender } = render(<ExamReviewSheet {...baseProps} visible={false} />)
      rerender(<ExamReviewSheet {...baseProps} visible={true} />)
      act(() => { jest.advanceTimersByTime(300) })
      expect(focusSpy).toHaveBeenCalledTimes(1)
      rerender(<ExamReviewSheet {...baseProps} visible={false} />)
      act(() => { jest.advanceTimersByTime(300) })
      rerender(<ExamReviewSheet {...baseProps} visible={true} />)
      act(() => { jest.advanceTimersByTime(300) })
      expect(focusSpy).toHaveBeenCalledTimes(2)
    })

    // Regression (M2 web visual check): react-native-web's findNodeHandle
    // THROWS, which once unmounted the app when the sheet opened.
    it('opens on web without calling findNodeHandle (it throws there)', () => {
      const RN = require('react-native')
      const restoreOS = jest.replaceProperty(RN.Platform, 'OS', 'web')
      const fnh = nodeSpy.mockImplementation(() => {
        throw new Error('findNodeHandle is not supported on web.')
      })
      try {
        expect(() => render(<ExamReviewSheet {...baseProps} visible />)).not.toThrow()
        act(() => { jest.advanceTimersByTime(300) })
        expect(screen.getByText('Review your answers')).toBeTruthy()
        expect(fnh).not.toHaveBeenCalled()
      } finally {
        restoreOS.restore()
      }
    })

    it('puts Close first and the unanswered summary before any question cell (reading order)', () => {
      render(<ExamReviewSheet {...baseProps} />)
      const nodes = screen.UNSAFE_root.findAll((n: any) => typeof n.type === 'string'
        && (n.props?.accessibilityRole === 'button' || n.props?.children === '2 unanswered.'))
      const labels = nodes.map((n: any) => n.props.accessibilityLabel ?? n.props.children)
      const close = labels.indexOf('Close')
      const summary = labels.indexOf('2 unanswered.')
      const firstCell = labels.findIndex((l: any) => typeof l === 'string' && l.startsWith('Question 1'))
      expect(close).toBeGreaterThanOrEqual(0)
      expect(close).toBeLessThan(summary)
      expect(summary).toBeLessThan(firstCell)
    })
  })

  // A6: a run with nothing answered would write an all-wrong record, so a
  // runner can block the submit with a clear reason.
  it('blocks submit and says why when the runner passes submitBlockedMessage', () => {
    const onSubmit = jest.fn()
    render(<ExamReviewSheet {...baseProps} answeredIdxs={new Set()} onSubmit={onSubmit} submitBlockedMessage="Answer at least one question to submit." />)
    expect(screen.getByText('Answer at least one question to submit.')).toBeTruthy()
    const btn = screen.getByRole('button', { name: /submit exam/i })
    expect(aria(btn, 'aria-disabled')).toBe(true)
    fireEvent.press(btn)
    expect(alertSpy).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
