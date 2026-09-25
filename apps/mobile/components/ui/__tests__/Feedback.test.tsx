/**
 * EmptyState, ErrorState, Skeleton (reduced-motion aware), Sheet.
 */
import React from 'react'
import { Text, Modal, Animated, AccessibilityInfo } from 'react-native'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { EmptyState } from '../EmptyState'
import { ErrorState } from '../ErrorState'
import { Skeleton } from '../Skeleton'
import { Sheet, sheetPresentation } from '../Sheet'
import { aria } from '../../../test-utils/aria'

describe('EmptyState', () => {
  it('shows icon, title as header, body and one action', () => {
    const onAction = jest.fn()
    render(
      <EmptyState
        icon={<Text testID="icon">i</Text>}
        title="Wala pang exam sa Focus"
        body="Pick an entrance exam to see your countdown here."
        actionLabel="Browse exams"
        onAction={onAction}
      />,
    )
    expect(screen.getByTestId('icon', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Wala pang exam sa Focus' })).toBeTruthy()
    expect(screen.getByText('Pick an entrance exam to see your countdown here.')).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Browse exams' }))
    expect(onAction).toHaveBeenCalled()
  })

  it('renders no button without an action', () => {
    render(<EmptyState title="Nothing yet" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('ErrorState', () => {
  it('announces itself and offers a retry', () => {
    const onRetry = jest.fn()
    render(<ErrorState onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('accepts a specific message', () => {
    render(<ErrorState title="Couldn't load scholarships" body="Check your data connection." onRetry={() => {}} />)
    expect(screen.getByText("Couldn't load scholarships")).toBeTruthy()
    expect(screen.getByText('Check your data connection.')).toBeTruthy()
  })
})

describe('Skeleton', () => {
  let loopSpy: jest.SpyInstance
  beforeEach(() => {
    loopSpy = jest.spyOn(Animated, 'loop')
  })
  afterEach(() => {
    loopSpy.mockRestore()
    jest.restoreAllMocks()
  })

  it('is silent by default, so a group of bars does not announce "Loading" per bar', () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    render(<><Skeleton /><Skeleton /><Skeleton /></>)
    expect(screen.queryAllByLabelText('Loading')).toHaveLength(0)
  })

  it('announces loading (busy) only when marked accessible — the one group/container', () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    render(<><Skeleton accessible /><Skeleton /></>)
    const els = screen.getAllByLabelText('Loading')
    expect(els).toHaveLength(1)
    expect(aria(els[0], 'aria-busy')).toBe(true)
  })

  it('accepts a custom label when accessible', () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    render(<Skeleton accessible label="Loading your exams" />)
    expect(screen.getByLabelText('Loading your exams')).toBeTruthy()
  })

  it('does not animate when the OS asks for reduced motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true)
    render(<Skeleton />)
    await act(async () => {})
    expect(loopSpy).not.toHaveBeenCalled()
  })

  it('pulses when motion is allowed', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    render(<Skeleton />)
    await act(async () => {})
    expect(loopSpy).toHaveBeenCalled()
  })
})

describe('sheetPresentation', () => {
  it('is a bottom sheet on compact and a centered dialog from medium up', () => {
    expect(sheetPresentation('compact')).toBe('bottom')
    expect(sheetPresentation('medium')).toBe('dialog')
    expect(sheetPresentation('expanded')).toBe('dialog')
  })
})

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    render(<Sheet visible={false} title="Review answers" onClose={() => {}}><Text>Body</Text></Sheet>)
    expect(screen.queryByText('Body')).toBeNull()
  })

  it('shows a titled panel with a named close button when open', () => {
    const onClose = jest.fn()
    render(<Sheet visible title="Review answers" onClose={onClose}><Text>Body</Text></Sheet>)
    expect(screen.getByText('Body')).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Review answers' })).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on the Android back button / web Escape (onRequestClose)', () => {
    const onClose = jest.fn()
    render(<Sheet visible title="Filters" onClose={onClose}><Text>Body</Text></Sheet>)
    act(() => { screen.UNSAFE_getByType(Modal).props.onRequestClose() })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps the backdrop out of the accessibility tree', () => {
    render(<Sheet visible title="Filters" onClose={() => {}}><Text>Body</Text></Sheet>)
    const backdrop = screen.getByTestId('sheet-backdrop', { includeHiddenElements: true })
    expect(backdrop.props.accessible).toBe(false)
    expect(backdrop.props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('marks the panel as modal for assistive tech', () => {
    render(<Sheet visible title="Filters" onClose={() => {}}><Text>Body</Text></Sheet>)
    expect(screen.getByTestId('sheet-panel').props.accessibilityViewIsModal).toBe(true)
  })
})
