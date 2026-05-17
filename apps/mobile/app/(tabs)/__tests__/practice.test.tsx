import React from 'react'
import { render, screen } from '@testing-library/react-native'
import PracticeScreen from '../practice'

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}))

const mockUsePracticeData = jest.fn()
const mockUseHomeStats = jest.fn()

jest.mock('../../../hooks/usePracticeData', () => ({
  usePracticeData: () => mockUsePracticeData(),
}))

jest.mock('../../../hooks/useHomeStats', () => ({
  useHomeStats: () => mockUseHomeStats(),
}))

const emptyPracticeData = {
  subjects: [],
  topicRows: [],
  selectedSubjectId: null,
  setSelectedSubjectId: jest.fn(),
  totalCards: 0,
}

describe('PracticeScreen', () => {
  beforeEach(() => {
    mockUsePracticeData.mockReturnValue(emptyPracticeData)
    mockUseHomeStats.mockReturnValue({ listing: null })
  })

  it('renders the Practice title', () => {
    render(<PracticeScreen />)
    expect(screen.getByText('Practice')).toBeTruthy()
  })

  it('renders subtitle with total card count', () => {
    render(<PracticeScreen />)
    expect(screen.getByText(/0 cards synced/)).toBeTruthy()
  })

  it('renders All subject chip', () => {
    render(<PracticeScreen />)
    expect(screen.getByText('All')).toBeTruthy()
  })

  it('shows listing title in subtitle when listing is set', () => {
    mockUseHomeStats.mockReturnValue({ listing: { title: 'UPCAT 2025' } })
    render(<PracticeScreen />)
    expect(screen.getByText(/UPCAT 2025/)).toBeTruthy()
  })

  it('renders subject chips for each subject', () => {
    mockUsePracticeData.mockReturnValue({
      ...emptyPracticeData,
      subjects: [
        { id: 's1', name: 'Mathematics' },
        { id: 's2', name: 'Science' },
      ],
    })
    render(<PracticeScreen />)
    expect(screen.getByText('Mathematics')).toBeTruthy()
    expect(screen.getByText('Science')).toBeTruthy()
  })

  it('renders topic cards when topics are present', () => {
    mockUsePracticeData.mockReturnValue({
      ...emptyPracticeData,
      topicRows: [
        {
          topic: { id: 't1', name: 'Algebra' },
          strength: 'Weak' as const,
          cardCount: 12,
          lastPracticedAt: null,
        },
      ],
    })
    render(<PracticeScreen />)
    expect(screen.getByText('Algebra')).toBeTruthy()
    expect(screen.getByText(/12 cards/)).toBeTruthy()
  })
})
