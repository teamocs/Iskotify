import React from 'react'
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native'
import ReportBugScreen from '../report-bug'

const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: (...a: unknown[]) => mockBack(...a) },
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
    expect(screen.getByText('Report a Bug')).toBeTruthy()
    expect(screen.getByPlaceholderText(/describe the bug/i)).toBeTruthy()
  })

  it('does not submit while the description is empty', () => {
    render(<ReportBugScreen />)
    fireEvent.press(screen.getByText('Submit report'))
    expect(mockSubmitBugReport).not.toHaveBeenCalled()
  })

  it('submits the report once a description is typed', async () => {
    render(<ReportBugScreen />)
    fireEvent.changeText(screen.getByPlaceholderText(/describe the bug/i), 'It crashed')
    fireEvent.press(screen.getByText('Submit report'))

    await waitFor(() => expect(mockSubmitBugReport).toHaveBeenCalledTimes(1))
    expect(mockSubmitBugReport).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'It crashed' }),
    )
  })
})
