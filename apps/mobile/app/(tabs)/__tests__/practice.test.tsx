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

jest.mock('../../../hooks/usePracticeData', () => ({
  usePracticeData: () => mockUsePracticeData(),
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

// Mock useDb so the screen does not require a real DrizzleProvider.
// IMPORTANT: return a STABLE singleton — the screen's readiness effects depend on
// `db`, so a fresh object every render would change the effect's deps each render
// and spin a re-render loop (state set to a new Map each pass never bails out).
jest.mock('../../../hooks/useDb', () => {
  const db = {}
  return { useDb: () => db }
})

// Mock the SQL aggregates so the readiness effects don't hit a real DB. cachedQuery
// (mocked below) calls the fetcher directly, which calls these.
// getListingMockBest is a capturable, per-test-seedable mock (the `mock` prefix makes
// it hoist-safe inside the jest.mock factory) so tests can drive the My Focus % readiness.
const mockGetListingMockBest = jest.fn()
jest.mock('../../../services/homeAggregates', () => ({
  getTopicBestSessionPercentages: jest.fn().mockResolvedValue([]),
  getSubjectSessionPercentages: jest.fn().mockResolvedValue([]),
  getListingMockBest: (...args: any[]) => mockGetListingMockBest(...args),
}))

const mockOpenKuya = jest.fn()
jest.mock('../../../providers/KuyaChatProvider', () => ({
  useKuyaChatModal: () => ({ open: mockOpenKuya }),
}))

// Kuya Baw kill-switch — default enabled=true so the pre-existing "AI Chat" study-tools
// card assertions below reflect the pre-kill-switch behavior. A dedicated describe block
// further down covers the disabled case.
const mockUseKuyaEnabled = jest.fn(() => ({ enabled: true, loading: false }))
jest.mock('../../../hooks/useKuyaEnabled', () => ({
  useKuyaEnabled: () => mockUseKuyaEnabled(),
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

const { router } = require('expo-router')

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
    mockOpenKuya.mockClear()
    router.push.mockClear()
    mockUsePracticeData.mockReturnValue(emptyPracticeData)
    mockListPublishedBlueprints.mockResolvedValue([])
    // Reset the My Focus mock-readiness aggregate (default: nothing practiced)
    mockGetListingMockBest.mockReset()
    mockGetListingMockBest.mockResolvedValue([])
    // Reset shared focus listings array
    mockFocusListings.splice(0, mockFocusListings.length)
  })

  it('renders the Exams title', () => {
    render(<PracticeScreen />)
    expect(screen.getByText('Exams')).toBeTruthy()
  })

  it('renders the Subject readiness section header', () => {
    render(<PracticeScreen />)
    expect(screen.getByText('Subject readiness')).toBeTruthy()
  })

  it('renders the subject-readiness empty state when no subjects', () => {
    render(<PracticeScreen />)
    expect(screen.getByText(/Practice to see your subject readiness/)).toBeTruthy()
  })

  it('renders a subject-readiness card when subjects/topics are present', async () => {
    mockUsePracticeData.mockReturnValue({
      ...emptyPracticeData,
      subjects: [{ id: 's1', name: 'Algebra' }],
      topicRows: [
        { topic: { id: 't1', name: 'Linear Equations', subjectId: 's1' }, strength: 'Weak' as const, cardCount: 12, lastPracticedAt: null, accuracy: null },
      ],
    })
    render(<PracticeScreen />)
    await act(async () => {})
    expect(screen.getByText('Algebra')).toBeTruthy()
  })

  it('does not render the removed stats header row', () => {
    render(<PracticeScreen />)
    expect(screen.queryByText('Accuracy')).toBeNull()
    expect(screen.queryByText('Streak')).toBeNull()
    expect(screen.queryByText('Exams taken')).toBeNull()
  })

  it('does not render the removed Subjects accordion section', () => {
    render(<PracticeScreen />)
    expect(screen.queryByText('Subjects')).toBeNull()
  })

  it('renders the search bar', () => {
    render(<PracticeScreen />)
    expect(screen.getByText('Search subjects, topics, or mock exams')).toBeTruthy()
  })

  it('opens the search modal and shows seeded subject / topic / mock results', async () => {
    mockUsePracticeData.mockReturnValue({
      ...emptyPracticeData,
      subjects: [{ id: 's1', name: 'Algebra' }],
      topicRows: [
        { topic: { id: 't1', name: 'Linear Equations', subjectId: 's1' }, strength: 'Weak' as const, cardCount: 12, lastPracticedAt: null, accuracy: null },
      ],
    })
    mockListPublishedBlueprints.mockResolvedValue([
      { slug: 'upcat', name: 'UPCAT', acronym: 'UPCAT', totalItems: 180, totalTimeMinutes: 180 },
    ])
    render(<PracticeScreen />)
    await act(async () => {})

    // Open modal via the search bar
    fireEvent.press(screen.getByText('Search subjects, topics, or mock exams'))

    // Empty-query prompt is shown
    expect(screen.getByText(/Type to search/)).toBeTruthy()

    // Find the TextInput (placeholder) and type a query that matches a subject.
    // "Algebra" also appears as a Subject readiness card behind the modal, so the
    // search result makes it appear an ADDITIONAL time (≥2 total).
    const input = screen.getByPlaceholderText('Search subjects, topics, or mock exams')
    fireEvent.changeText(input, 'algebra')
    expect(screen.getAllByText('Algebra').length).toBeGreaterThanOrEqual(2)

    // A topic query — "Linear Equations" is only a search result (no topic cards
    // in this layout), so it appears exactly once.
    fireEvent.changeText(input, 'linear')
    expect(screen.getByText('Linear Equations')).toBeTruthy()

    // A mock-exam query — result row label is "UPCAT · UPCAT".
    fireEvent.changeText(input, 'upcat')
    expect(screen.getByText('UPCAT · UPCAT')).toBeTruthy()
  })

  it('tapping a search result navigates and closes the modal', async () => {
    mockUsePracticeData.mockReturnValue({
      ...emptyPracticeData,
      subjects: [{ id: 's1', name: 'Algebra' }],
    })
    render(<PracticeScreen />)
    await act(async () => {})
    fireEvent.press(screen.getByText('Search subjects, topics, or mock exams'))
    const input = screen.getByPlaceholderText('Search subjects, topics, or mock exams')
    fireEvent.changeText(input, 'algebra')
    fireEvent.press(screen.getByText('Algebra'))
    expect(router.push).toHaveBeenCalledWith('/subjects/s1')
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

  it('Study Tools expands to Notes + AI Chat — GWA Calculator removed', () => {
    render(<PracticeScreen />)
    const collapsed = screen.getByTestId('study-tools-collapsed')
    fireEvent.press(collapsed)
    // Kept cards present
    expect(screen.getByText('Notes')).toBeTruthy()
    expect(screen.getByText('AI Chat')).toBeTruthy()
    // Removed card absent
    expect(screen.queryByText('GWA Calculator')).toBeNull()
  })

  it('AI Chat card in Study Tools calls openKuya on press', () => {
    render(<PracticeScreen />)
    fireEvent.press(screen.getByTestId('study-tools-collapsed'))
    fireEvent.press(screen.getByText('AI Chat'))
    expect(mockOpenKuya).toHaveBeenCalledTimes(1)
  })

  describe('Kuya Baw kill-switch — chat disabled', () => {
    beforeEach(() => {
      mockUseKuyaEnabled.mockReturnValue({ enabled: false, loading: false })
    })
    afterEach(() => {
      mockUseKuyaEnabled.mockReturnValue({ enabled: true, loading: false })
    })

    it('hides the AI Chat card in Study Tools while keeping Notes/Requirements', () => {
      render(<PracticeScreen />)
      fireEvent.press(screen.getByTestId('study-tools-collapsed'))
      expect(screen.getByText('Notes')).toBeTruthy()
      expect(screen.getByText('Requirements')).toBeTruthy()
      expect(screen.queryByText('AI Chat')).toBeNull()
    })

    it('drops "AI Chat" from the collapsed Study Tools subtitle', () => {
      render(<PracticeScreen />)
      expect(screen.getByText('Requirements · Notes')).toBeTruthy()
      expect(screen.queryByText('Requirements · Notes · AI Chat')).toBeNull()
    })
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

  it('Recommended section renders at most 4 items (grid slices to 4)', async () => {
    // 5 focus topics — all Strong; sorted by strength they stay in array order,
    // so StrongFive (5th) must be sliced off by the recommended grid's slice(0,4).
    // The Subjects accordion is gone, so StrongFive must not appear at all.
    mockUsePracticeData.mockReturnValue({
      ...emptyPracticeData,
      subjects: [{ id: 's1', name: 'Science' }],
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
    // The recommended grid slices to 4. All 5 share equal strength, so array order
    // is preserved; StrongFive (5th) is sliced off and — with no accordion — should
    // not appear anywhere on the screen.
    expect(screen.queryByText('StrongFive')).toBeNull()
    // The first four DO render in the Recommended grid.
    expect(screen.getByText('StrongOne')).toBeTruthy()
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

  it('My Focus empty banner navigates to the Lists tab', () => {
    render(<PracticeScreen />)
    // No focus listings → empty banner with a "Lists" action
    fireEvent.press(screen.getByText('Lists'))
    expect(router.push).toHaveBeenCalledWith('/(tabs)/listings')
  })

  it('My Focus card navigates to the start chooser (no inline Review button)', async () => {
    ;(mockFocusListings as any[]).splice(0, mockFocusListings.length,
      { slug: 'upcat', priority: 1, addedAt: 0, title: 'UPCAT 2025', type: 'exam' },
    )
    render(<PracticeScreen />)
    await act(async () => {})
    // The inline Review button is gone.
    expect(screen.queryByText('Review')).toBeNull()
    // Tapping the card navigates to the new start chooser.
    fireEvent.press(screen.getByText('UPCAT 2025'))
    expect(router.push).toHaveBeenCalledWith('/practice/start/upcat')
  })

  it('My Focus card shows the mock-exam readiness % from getListingMockBest', async () => {
    ;(mockFocusListings as any[]).splice(0, mockFocusListings.length,
      { slug: 'upcat', priority: 1, addedAt: 0, title: 'UPCAT', type: 'exam' },
    )
    mockGetListingMockBest.mockResolvedValue([{ listingSlug: 'upcat', bestPct: 72 }])
    render(<PracticeScreen />)
    await act(async () => {})
    // The readiness % for the seeded focus listing renders on its My Focus card.
    expect(screen.getByText('72%')).toBeTruthy()
  })

  it('My Focus "Add exam or scholarship" ghost card navigates to the Lists tab', async () => {
    ;(mockFocusListings as any[]).splice(0, mockFocusListings.length,
      { slug: 'upcat', priority: 1, addedAt: 0, title: 'UPCAT 2025', type: 'exam' },
    )
    render(<PracticeScreen />)
    await act(async () => {})
    fireEvent.press(screen.getByText('＋ Add exam or scholarship'))
    expect(router.push).toHaveBeenCalledWith('/(tabs)/listings')
  })
})
