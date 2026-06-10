import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import PracticeScreen from '../practice'

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: jest.fn(),
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

const mockFocusListings: any[] = []
jest.mock('../../../hooks/useFocusListings', () => ({
  useFocusListings: () => ({
    focusListings: mockFocusListings,
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

// Mock useDb so the screen does not require a real DrizzleProvider
jest.mock('../../../hooks/useDb', () => ({
  useDb: () => ({}),
}))

// Mock listPublishedBlueprints — tests override this via mockListPublishedBlueprints
const mockListPublishedBlueprints = jest.fn().mockResolvedValue([])
jest.mock('../../../services/examBlueprints', () => ({
  ...jest.requireActual('../../../services/examBlueprints'),
  listPublishedBlueprints: (...args: any[]) => mockListPublishedBlueprints(...args),
}))

// Mock queryCache so cachedQuery just calls the fetcher directly (no TTL/SWR in tests)
jest.mock('../../../services/queryCache', () => ({
  cachedQuery: async (_key: string, _ttl: number, fetcher: () => Promise<any>) => fetcher(),
  invalidate: jest.fn(),
  subscribe: jest.fn(() => jest.fn()),
}))

const emptyPracticeData = {
  subjects: [],
  topicRows: [],
  recommendedTopics: [],
  totalCards: 0,
  cardCountByTopic: {},
  topicIdsByListingSlug: {},
}

describe('PracticeScreen', () => {
  // Drain any microtask-queued state updates (e.g. cachedQuery resolving) so React
  // doesn't warn "not wrapped in act" between tests.
  afterEach(async () => {
    await act(async () => {})
  })

  beforeEach(() => {
    mockListPublishedBlueprints.mockClear()
    mockUsePracticeData.mockReturnValue(emptyPracticeData)
    mockUseHomeStats.mockReturnValue({ listing: null })
    mockListPublishedBlueprints.mockResolvedValue([])
    // Reset shared focus listings array
    mockFocusListings.splice(0, mockFocusListings.length)
  })

  it('renders the Practice title', () => {
    render(<PracticeScreen />)
    expect(screen.getByText('Practice')).toBeTruthy()
  })

  it('renders subtitle with total card count', () => {
    render(<PracticeScreen />)
    expect(screen.getByText(/0 cards synced/)).toBeTruthy()
  })

  it('shows listing title in subtitle when listing is set', () => {
    mockUseHomeStats.mockReturnValue({ listing: { title: 'UPCAT 2025' } })
    render(<PracticeScreen />)
    expect(screen.getByText(/UPCAT 2025/)).toBeTruthy()
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

  it('Recommended section renders at most 4 items (sliced from 5)', async () => {
    // 5 focus topics — all Strong; sorted by strength they stay in array order,
    // so StrongFive (5th) must be sliced off. We give each a unique suffix.
    mockUsePracticeData.mockReturnValue({
      ...emptyPracticeData,
      topicRows: [
        { topic: { id: 't1', name: 'StrongOne', subjectId: 's1' }, strength: 'Strong' as const, cardCount: 5, lastPracticedAt: null, accuracy: null },
        { topic: { id: 't2', name: 'StrongTwo', subjectId: 's1' }, strength: 'Strong' as const, cardCount: 3, lastPracticedAt: null, accuracy: null },
        { topic: { id: 't3', name: 'StrongThree', subjectId: 's1' }, strength: 'Strong' as const, cardCount: 8, lastPracticedAt: null, accuracy: null },
        { topic: { id: 't4', name: 'StrongFour', subjectId: 's1' }, strength: 'Strong' as const, cardCount: 6, lastPracticedAt: null, accuracy: null },
        { topic: { id: 't5', name: 'StrongFive', subjectId: 's1' }, strength: 'Strong' as const, cardCount: 4, lastPracticedAt: null, accuracy: null },
      ],
      topicIdsByListingSlug: { 'upcat': ['t1', 't2', 't3', 't4', 't5'] },
    })
    ;(mockFocusListings as any[]).splice(0, mockFocusListings.length, {
      slug: 'upcat', priority: 1, addedAt: 0, title: 'UPCAT', type: 'exam',
    })
    render(<PracticeScreen />)
    await act(async () => {})
    // The recommended grid slices to 4. activeRecommended keeps slice(0,5), but render slices to 4.
    // All 5 have equal strength, so array order is preserved; 5th item StrongFive should not appear
    // in the recommended grid section (it may still appear in the subjects accordion — that's OK).
    // We count occurrences of StrongFive: any in the Recommended section would be bad.
    // The Recommended section shows cards with the topic name + "N cards".
    // The accordion also shows it — so we check how many "Recommended" section cards there are (≤4).
    const allStrongFive = screen.queryAllByText('StrongFive')
    // In the Recommended grid, card shows topic name + "X cards" (RecommendedCard).
    // Accordion rows show topic name too (TopicCard). The grid cards also appear in accordion.
    // What we can assert: the count of "StrongOne" etc. cards = total appearances.
    // Simpler: assert that of the 5 topics, at most 4 appear in a "X cards" (RecommendedCard) context.
    // The safest assertion: the recommended grid was supposed to slice(0,4) meaning StrongFive
    // should only appear once (in accordion) not twice (accordion + recommended).
    expect(allStrongFive.length).toBeLessThanOrEqual(1)
  })

  it('Mock Exams section header and See all renders when blueprints exist', async () => {
    mockListPublishedBlueprints.mockResolvedValue([
      { slug: 'upcat', name: 'UPCAT', acronym: 'UPCAT', totalItems: 180, totalTimeMinutes: 180 },
      { slug: 'acet', name: 'ACET', acronym: 'ACET', totalItems: 120, totalTimeMinutes: 120 },
    ])
    render(<PracticeScreen />)
    await act(async () => {})
    expect(screen.getByText('Mock Exams')).toBeTruthy()
    expect(screen.getByText('See all')).toBeTruthy()
  })

  it('Mock Exams section is hidden when no blueprints', async () => {
    mockListPublishedBlueprints.mockResolvedValue([])
    render(<PracticeScreen />)
    await act(async () => {})
    expect(screen.queryByText('Mock Exams')).toBeNull()
  })

  it('renders at most 4 mock exam cards', async () => {
    mockListPublishedBlueprints.mockResolvedValue([
      { slug: 'upcat', name: 'University of the Philippines', acronym: 'UPCAT', totalItems: 180, totalTimeMinutes: 180 },
      { slug: 'acet', name: 'Ateneo', acronym: 'ACET', totalItems: 120, totalTimeMinutes: 120 },
      { slug: 'ustet', name: 'UST', acronym: 'USTET', totalItems: 100, totalTimeMinutes: 120 },
      { slug: 'dcat', name: 'DLSU', acronym: 'DCAT', totalItems: 80, totalTimeMinutes: 90 },
      { slug: 'extra', name: 'Extra', acronym: 'EXTRA', totalItems: 60, totalTimeMinutes: 60 },
    ])
    render(<PracticeScreen />)
    await act(async () => {})
    // All 4 acronyms should be shown; the 5th should not
    expect(screen.getByText('UPCAT')).toBeTruthy()
    expect(screen.getByText('ACET')).toBeTruthy()
    expect(screen.getByText('USTET')).toBeTruthy()
    expect(screen.getByText('DCAT')).toBeTruthy()
    expect(screen.queryByText('EXTRA')).toBeNull()
  })

  it('Mock exam button never renders on focus cards (regardless of blueprint match)', async () => {
    mockListPublishedBlueprints.mockResolvedValue([
      { slug: 'upcat', name: 'UPCAT', acronym: 'UPCAT', totalItems: 180, totalTimeMinutes: 180 },
    ])
    ;(mockFocusListings as any[]).splice(0, mockFocusListings.length,
      { slug: 'upcat', priority: 1, addedAt: 0, title: 'UPCAT 2025', type: 'exam' },
      { slug: 'acet', priority: 2, addedAt: 0, title: 'ACET 2025', type: 'exam' },
    )
    render(<PracticeScreen />)
    await act(async () => {})
    // Mock exam button must not appear anywhere on focus cards
    expect(screen.queryByText('Mock exam')).toBeNull()
  })

  it('Review button renders on every focus card without tapping', async () => {
    // 2 focus listings — both should show Review without any tap
    ;(mockFocusListings as any[]).splice(0, mockFocusListings.length,
      { slug: 'upcat', priority: 1, addedAt: 0, title: 'UPCAT 2025', type: 'exam' },
      { slug: 'acet', priority: 2, addedAt: 0, title: 'ACET 2025', type: 'exam' },
    )
    render(<PracticeScreen />)
    await act(async () => {})
    const reviewBtns = screen.getAllByText('Review')
    expect(reviewBtns.length).toBe(2)
  })
})
