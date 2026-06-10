import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import PracticeScreen from '../practice'

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

const mockUsePracticeData = jest.fn()
const mockUseHomeStats = jest.fn()

jest.mock('../../../hooks/usePracticeData', () => ({
  usePracticeData: () => mockUsePracticeData(),
}))

jest.mock('../../../hooks/useHomeStats', () => ({
  useHomeStats: () => mockUseHomeStats(),
}))

jest.mock('../../../hooks/useFocusListings', () => ({
  useFocusListings: () => ({
    focusListings: [],
    addListing: jest.fn(),
    removeListing: jest.fn(),
    moveListing: jest.fn(),
    isInFocus: jest.fn().mockReturnValue(false),
    getPriority: jest.fn().mockReturnValue(null),
  }),
}))

jest.mock('../../../hooks/useSavedDecks', () => ({
  useSavedDecks: () => ({
    decks: [],
    createDeck: jest.fn(),
    deleteDeck: jest.fn(),
  }),
}))

jest.mock('../../../hooks/useAnalytics', () => ({
  useAnalytics: () => ({
    sessionCount: 0,
    avgAccuracy: null,
    streak: 0,
    weeklyData: [],
    topicMastery: [],
    recentSessions: [],
    isLoading: false,
    refresh: jest.fn(),
  }),
}))

// Stub AiModelBanner so we don't pull in expo-notifications /
// react-native-background-downloader native modules during tests.
jest.mock('../../../components/AiModelBanner', () => ({
  AiModelBanner: () => null,
}))

const emptyPracticeData = {
  subjects: [],
  topicRows: [],
  recommendedTopics: [],
  selectedSubjectId: null,
  setSelectedSubjectId: jest.fn(),
  totalCards: 0,
  cardCountByTopic: {},
  topicIdsByListingSlug: {},
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

  it('renders stats header row', () => {
    render(<PracticeScreen />)
    expect(screen.getByText('Accuracy')).toBeTruthy()
    expect(screen.getByText('Streak')).toBeTruthy()
    expect(screen.getByText('Exams taken')).toBeTruthy()
  })

  it('renders Subjects section header (promoted)', () => {
    render(<PracticeScreen />)
    expect(screen.getByText('Subjects')).toBeTruthy()
  })

  it('AI Study Feedback is collapsed by default — shows collapsed row', () => {
    render(<PracticeScreen />)
    // The collapsed row title is visible
    expect(screen.getAllByText('AI Study Feedback').length).toBeGreaterThanOrEqual(1)
    // The collapsed testID is present
    expect(screen.getByTestId('ai-feedback-collapsed')).toBeTruthy()
  })

  it('AI Study Feedback expands on press', () => {
    render(<PracticeScreen />)
    const collapsed = screen.getByTestId('ai-feedback-collapsed')
    fireEvent.press(collapsed)
    // After expand, the full card is shown with the no-data prompt
    expect(screen.getByText(/Take a few quizzes/)).toBeTruthy()
  })

  it('Study Tools is collapsed by default — shows collapsed row', () => {
    render(<PracticeScreen />)
    expect(screen.getByTestId('study-tools-collapsed')).toBeTruthy()
    expect(screen.getByText('Study Tools')).toBeTruthy()
  })

  it('Study Tools expands to show 3 links on press', () => {
    render(<PracticeScreen />)
    const collapsed = screen.getByTestId('study-tools-collapsed')
    fireEvent.press(collapsed)
    expect(screen.getByText('UPCAT Mock Exam')).toBeTruthy()
    expect(screen.getByText('GWA Calculator')).toBeTruthy()
    expect(screen.getByText('Career Paths')).toBeTruthy()
  })

  it('Saved Decks section header always shown (create deck reachable)', () => {
    render(<PracticeScreen />)
    expect(screen.getByText('Saved Decks')).toBeTruthy()
  })

  it('Saved Decks empty placeholder is not shown when decks are empty', () => {
    render(<PracticeScreen />)
    // The old "No decks yet. Tap ＋ to create one." placeholder is removed
    expect(screen.queryByText(/No decks yet/)).toBeNull()
  })

  it('does not render Quick Start or Full Review Deck', () => {
    render(<PracticeScreen />)
    expect(screen.queryByText('Quick Start')).toBeNull()
    expect(screen.queryByText('Full Review Deck')).toBeNull()
    expect(screen.queryByText('Weak Topics Only')).toBeNull()
  })
})
