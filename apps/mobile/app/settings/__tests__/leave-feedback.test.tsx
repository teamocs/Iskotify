import React from 'react'
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native'
import LeaveFeedbackScreen from '../leave-feedback'
import { aria } from '../../../test-utils/aria'

const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: (...a: unknown[]) => mockBack(...a), canGoBack: () => true },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

const mockSubmitFeedback = jest.fn().mockResolvedValue(true)
jest.mock('../../../services/appFeedback', () => ({
  submitFeedback: (...a: unknown[]) => mockSubmitFeedback(...a),
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockSubmitFeedback.mockResolvedValue(true)
})

describe('LeaveFeedbackScreen', () => {
  it('names the page in sentence case with a level-1 heading', () => {
    render(<LeaveFeedbackScreen />)
    expect(aria(screen.getByRole('header', { name: 'Leave feedback' }), 'aria-level')).toBe(1)
  })

  it('the rating is a radio group of drawn stars that expose aria-checked', () => {
    render(<LeaveFeedbackScreen />)
    expect(screen.queryByText('★')).toBeNull()
    expect(screen.queryByText('☆')).toBeNull()
    const four = screen.getByRole('radio', { name: '4 stars' })
    expect(aria(four, 'aria-checked')).toBe(false)
    fireEvent.press(four)
    expect(aria(screen.getByRole('radio', { name: '4 stars' }), 'aria-checked')).toBe(true)
    // Only the chosen value is checked (a radio group), even though 1–4 are drawn filled.
    expect(aria(screen.getByRole('radio', { name: '3 stars' }), 'aria-checked')).toBe(false)
  })

  it('the message is a labelled field and Send stays aria-disabled until it has text', () => {
    render(<LeaveFeedbackScreen />)
    expect(screen.getByLabelText('Your message')).toBeTruthy()
    expect(aria(screen.getByRole('button', { name: 'Send feedback' }), 'aria-disabled')).toBe(true)
    fireEvent.changeText(screen.getByLabelText('Your message'), 'Love it')
    expect(aria(screen.getByRole('button', { name: 'Send feedback' }), 'aria-disabled')).toBe(false)
  })

  it('sends the rating and message, then thanks the student', async () => {
    render(<LeaveFeedbackScreen />)
    fireEvent.press(screen.getByRole('radio', { name: '5 stars' }))
    fireEvent.changeText(screen.getByLabelText('Your message'), 'Love it')
    fireEvent.press(screen.getByRole('button', { name: 'Send feedback' }))
    await waitFor(() => expect(mockSubmitFeedback).toHaveBeenCalledWith({ rating: 5, message: 'Love it' }))
    expect(await screen.findByText(/Salamat/)).toBeTruthy()
  })

  it('announces a send failure as an alert', async () => {
    mockSubmitFeedback.mockResolvedValue(false)
    render(<LeaveFeedbackScreen />)
    fireEvent.changeText(screen.getByLabelText('Your message'), 'Hi')
    fireEvent.press(screen.getByRole('button', { name: 'Send feedback' }))
    const err = await screen.findByText(/couldn't send your feedback/)
    expect(err.props.accessibilityRole).toBe('alert')
  })
})
