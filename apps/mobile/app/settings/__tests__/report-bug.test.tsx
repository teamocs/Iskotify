import React from 'react'
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native'
import ReportBugScreen from '../report-bug'
import { aria } from '../../../test-utils/aria'

const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: (...a: unknown[]) => mockBack(...a), canGoBack: () => true },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

const mockSubmitBugReport = jest.fn().mockResolvedValue(true)
jest.mock('../../../services/appFeedback', () => ({
  submitBugReport: (...a: unknown[]) => mockSubmitBugReport(...a),
}))

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn().mockResolvedValue({ canceled: true }),
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockSubmitBugReport.mockResolvedValue(true)
})

describe('ReportBugScreen', () => {
  it('renders the title and a description field', () => {
    render(<ReportBugScreen />)
    expect(aria(screen.getByRole('header', { name: 'Report a bug' }), 'aria-level')).toBe(1)
    expect(screen.getByPlaceholderText(/describe the bug/i)).toBeTruthy()
  })

  it('does not submit while the description is empty', () => {
    render(<ReportBugScreen />)
    fireEvent.press(screen.getByText('Send report'))
    expect(mockSubmitBugReport).not.toHaveBeenCalled()
    expect(aria(screen.getByRole('button', { name: 'Send report' }), 'aria-disabled')).toBe(true)
  })

  it('submits the report once a description is typed', async () => {
    render(<ReportBugScreen />)
    fireEvent.changeText(screen.getByPlaceholderText(/describe the bug/i), 'It crashed')
    fireEvent.press(screen.getByText('Send report'))

    await waitFor(() => expect(mockSubmitBugReport).toHaveBeenCalledTimes(1))
    expect(mockSubmitBugReport).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'It crashed' }),
    )
  })

  it('asks where it happened using the current tab names, as radios with aria-checked', () => {
    render(<ReportBugScreen />)
    expect(aria(screen.getByRole('radio', { name: 'General' }), 'aria-checked')).toBe(true)
    for (const area of ['Today', 'Practice', 'Explore', 'Progress', 'Settings']) {
      expect(screen.getByRole('radio', { name: area })).toBeTruthy()
    }
    expect(screen.queryByRole('radio', { name: 'Updates' })).toBeNull()
    fireEvent.press(screen.getByRole('radio', { name: 'Practice' }))
    expect(aria(screen.getByRole('radio', { name: 'Practice' }), 'aria-checked')).toBe(true)
    expect(aria(screen.getByRole('radio', { name: 'General' }), 'aria-checked')).toBe(false)
  })

  it('the description is a labelled field (the placeholder is only an example)', () => {
    render(<ReportBugScreen />)
    expect(screen.getByLabelText('What happened?')).toBeTruthy()
  })

  it('offers the screenshot as a real button with a drawn icon, no "+" glyph', () => {
    render(<ReportBugScreen />)
    expect(screen.getByRole('button', { name: 'Attach a screenshot (optional)' })).toBeTruthy()
    expect(screen.queryByText(/^\+ /)).toBeNull()
  })

  it('announces a send failure as an alert', async () => {
    mockSubmitBugReport.mockResolvedValue(false)
    render(<ReportBugScreen />)
    fireEvent.changeText(screen.getByLabelText('What happened?'), 'It crashed')
    fireEvent.press(screen.getByRole('button', { name: 'Send report' }))
    const err = await screen.findByText(/couldn't send your report/)
    expect(err.props.accessibilityRole).toBe('alert')
  })
})
