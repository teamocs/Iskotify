import React from 'react'
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react-native'
import { Alert } from 'react-native'
import PracticeScreen from '../practice'

// Redesign M2 (direction C, "One Next Step"): Practice leads with ONE next
// practice action, then Mock exams, Subjects, Your decks and Tools as flat
// lists. Readiness grids, My Focus and AI feedback moved out (Today and
// Progress own them).

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: jest.fn(),
}))

jest.mock('../../../hooks/useProfileName', () => ({
  useProfileName: () => 'Ana Reyes',
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
  useFocusListings: () => ({ focusListings: mockFocusListings }),
}))

const mockDecks: any[] = []
const mockCreateDeck = jest.fn().mockResolvedValue(undefined)
const mockDeleteDeck = jest.fn().mockResolvedValue(undefined)
jest.mock('../../../hooks/useSavedDecks', () => ({
  useSavedDecks: () => ({ decks: mockDecks, createDeck: mockCreateDeck, deleteDeck: (...a: any[]) => mockDeleteDeck(...a) }),
}))

jest.mock('../../../hooks/useDb', () => {
  const db = {}
  return { useDb: () => db }
})

const mockGetTopicBest = jest.fn()
jest.mock('../../../services/homeAggregates', () => ({
  getTopicBestSessionPercentages: (...a: any[]) => mockGetTopicBest(...a),
  getSubjectSessionPercentages: jest.fn().mockResolvedValue([]),
}))

const mockGetDueCounts = jest.fn()
jest.mock('../../../services/srsAggregates', () => ({
  getDueCounts: (...args: any[]) => mockGetDueCounts(...args),
}))

const mockListPublishedBlueprints = jest.fn()
jest.mock('../../../services/examBlueprints', () => ({
  ...jest.requireActual('../../../services/examBlueprints'),
  listPublishedBlueprints: (...args: any[]) => mockListPublishedBlueprints(...args),
}))

const mockLoadRun = jest.fn()
jest.mock('../../../hooks/useExamRunPersistence', () => ({
  useExamRunPersistence: () => ({ loadRun: (...a: any[]) => mockLoadRun(...a), saveRun: jest.fn(), clearRun: jest.fn() }),
}))

jest.mock('../../../services/queryCache', () => ({
  cachedQuery: async (_key: string, _ttl: number, fetcher: () => Promise<any>) => fetcher(),
  invalidate: jest.fn(),
  subscribe: jest.fn(() => jest.fn()),
}))

jest.mock('../../../services/sync', () => ({ syncOnLaunch: jest.fn() }))

const { router } = require('expo-router')

const emptyPracticeData = {
  subjects: [],
  topicRows: [],
  recommendedTopics: [],
  totalCards: 0,
  cardCountByTopic: {},
  topicIdsByListingSlug: {},
  refresh: jest.fn(),
  loaded: true,
}

const UPCAT = { slug: 'upcat', name: 'UP College Admission Test', acronym: 'UPCAT', totalItems: 180, totalTimeMinutes: 150 }
const ACET = { slug: 'acet', name: 'Ateneo College Entrance Test', acronym: 'ACET', totalItems: 120, totalTimeMinutes: 120 }

async function renderSettled() {
  render(<PracticeScreen />)
  await act(async () => {})
}

describe('PracticeScreen (redesign M2)', () => {
  afterEach(async () => { await act(async () => {}) })

  beforeEach(() => {
    router.push.mockClear()
    mockUsePracticeData.mockReturnValue(emptyPracticeData)
    mockListPublishedBlueprints.mockReset().mockResolvedValue([])
    mockGetDueCounts.mockReset().mockResolvedValue({ total: 0, byTopic: {} })
    mockGetTopicBest.mockReset().mockResolvedValue([])
    mockLoadRun.mockReset().mockResolvedValue(null)
    mockCreateDeck.mockClear()
    mockFocusListings.splice(0)
    mockDecks.splice(0)
  })

  describe('header', () => {
    it('is titled Practice with the Profile avatar', async () => {
      await renderSettled()
      expect(screen.getByRole('header', { name: 'Practice' })).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: 'Profile' }))
      expect(router.push).toHaveBeenCalledWith('/profile')
    })

    it('opens search in a sheet and finds subjects, topics and mock exams', async () => {
      mockUsePracticeData.mockReturnValue({
        ...emptyPracticeData,
        subjects: [{ id: 's1', name: 'Algebra' }],
        topicRows: [{ topic: { id: 't1', name: 'Linear Equations', subjectId: 's1' }, strength: 'Weak', cardCount: 12, lastPracticedAt: null, accuracy: null }],
      })
      mockListPublishedBlueprints.mockResolvedValue([UPCAT])
      await renderSettled()
      fireEvent.press(screen.getByRole('button', { name: 'Search practice' }))
      const input = screen.getByPlaceholderText('Search subjects, topics, or mock exams')
      expect(screen.getByText(/Type to search/)).toBeTruthy()
      fireEvent.changeText(input, 'linear')
      fireEvent.press(screen.getByRole('button', { name: 'Topic: Linear Equations' }))
      expect(router.push).toHaveBeenCalledWith('/practice/t1')
    })

    it('says so when search finds nothing', async () => {
      await renderSettled()
      fireEvent.press(screen.getByRole('button', { name: 'Search practice' }))
      fireEvent.changeText(screen.getByPlaceholderText('Search subjects, topics, or mock exams'), 'zzz')
      expect(screen.getByText('No matches for “zzz”')).toBeTruthy()
    })
  })

  describe('next step', () => {
    it('offers the diagnostic to a brand-new student', async () => {
      await renderSettled()
      expect(screen.getByRole('header', { name: 'Find your starting point' })).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: 'Take the diagnostic' }))
      expect(router.push).toHaveBeenCalledWith('/practice/diagnostic')
    })

    it('leads with due cards when any are due', async () => {
      mockGetDueCounts.mockResolvedValue({ total: 7, byTopic: { t1: 7 } })
      await renderSettled()
      expect(screen.getByRole('header', { name: 'Review 7 due cards' })).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: 'Start review' }))
      expect(router.push).toHaveBeenCalledWith('/practice/due')
    })

    it('drills the weakest focus topic when nothing is due', async () => {
      mockUsePracticeData.mockReturnValue({
        ...emptyPracticeData,
        subjects: [{ id: 's1', name: 'Math' }],
        topicRows: [
          { topic: { id: 't1', name: 'Fractions', subjectId: 's1' }, strength: 'Weak', cardCount: 5, lastPracticedAt: 1, accuracy: 30 },
          { topic: { id: 't2', name: 'Ratios', subjectId: 's1' }, strength: 'Strong', cardCount: 5, lastPracticedAt: 1, accuracy: 90 },
        ],
        topicIdsByListingSlug: { upcat: ['t1', 't2'] },
      })
      mockFocusListings.push({ slug: 'upcat', priority: 1, addedAt: 0, title: 'UPCAT', type: 'exam' })
      await renderSettled()
      expect(screen.getByRole('header', { name: 'Drill Fractions' })).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: 'Start drill' }))
      expect(router.push).toHaveBeenCalledWith('/practice/t1')
    })

    it('suggests the focus exam mock when there is no weak topic', async () => {
      mockFocusListings.push({ slug: 'upcat', priority: 1, addedAt: 0, title: 'UPCAT', type: 'exam' })
      mockListPublishedBlueprints.mockResolvedValue([ACET, UPCAT])
      await renderSettled()
      expect(screen.getByRole('header', { name: 'Take a UPCAT mock' })).toBeTruthy()
    })

    it('resumes an unfinished focus mock first', async () => {
      mockFocusListings.push({ slug: 'upcat', priority: 1, addedAt: 0, title: 'UPCAT', type: 'exam' })
      mockListPublishedBlueprints.mockResolvedValue([UPCAT])
      mockGetDueCounts.mockResolvedValue({ total: 4, byTopic: {} })
      mockLoadRun.mockImplementation(async (key: string) => key === 'exam:upcat'
        ? { runKey: key, questionIds: ['a', 'b', 'c'], answers: { 0: 1, 1: 2 } }
        : null)
      await renderSettled()
      await waitFor(() => expect(screen.getByRole('header', { name: 'Finish your UPCAT mock' })).toBeTruthy())
      expect(screen.getByText('2 of 3 answered. Your answers and timer were saved.')).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: 'Resume mock' }))
      expect(router.push).toHaveBeenCalledWith('/practice/exam/upcat')
    })
  })

  describe('mock exams', () => {
    it('lists up to four mock exams, focus exams first, with a See all', async () => {
      mockFocusListings.push({ slug: 'upcat', priority: 1, addedAt: 0, title: 'UPCAT', type: 'exam' })
      mockListPublishedBlueprints.mockResolvedValue([
        ACET, UPCAT,
        { slug: 'ustet', name: 'UST', acronym: 'USTET', totalItems: 100, totalTimeMinutes: 120 },
        { slug: 'dcat', name: 'DLSU', acronym: 'DCAT', totalItems: 80, totalTimeMinutes: 90 },
        { slug: 'extra', name: 'Extra', acronym: 'EXTRA', totalItems: 60, totalTimeMinutes: 60 },
      ])
      await renderSettled()
      const section = screen.getByTestId('practice-mocks')
      const rows = within(section).getAllByRole('button').filter(b => /items/.test(b.props.accessibilityLabel ?? ''))
      expect(rows).toHaveLength(4)
      expect(rows[0]!.props.accessibilityLabel).toMatch(/^UPCAT/)
      expect(within(section).queryByText('EXTRA')).toBeNull()
      fireEvent.press(within(section).getByRole('button', { name: 'See all' }))
      expect(router.push).toHaveBeenCalledWith('/practice/exam')
    })

    it('opens a mock from its row', async () => {
      mockListPublishedBlueprints.mockResolvedValue([UPCAT])
      await renderSettled()
      fireEvent.press(within(screen.getByTestId('practice-mocks')).getByText('UPCAT'))
      expect(router.push).toHaveBeenCalledWith('/practice/exam/upcat')
    })

    it('shows an empty state when no mock is published yet', async () => {
      await renderSettled()
      expect(within(screen.getByTestId('practice-mocks')).getByText('No mock exams yet')).toBeTruthy()
    })

    it('shows a retryable error when mocks fail to load', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
      mockListPublishedBlueprints.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([UPCAT])
      await renderSettled()
      const section = screen.getByTestId('practice-mocks')
      expect(within(section).getByText("Couldn't load mock exams")).toBeTruthy()
      fireEvent.press(within(section).getByRole('button', { name: 'Try again' }))
      await act(async () => {})
      expect(within(screen.getByTestId('practice-mocks')).getByText('UPCAT')).toBeTruthy()
      warn.mockRestore()
    })

    it('shows skeletons (announced once) while mocks load', async () => {
      mockListPublishedBlueprints.mockReturnValue(new Promise(() => {}))
      render(<PracticeScreen />)
      expect(within(screen.getByTestId('practice-mocks')).getByLabelText('Loading mock exams')).toBeTruthy()
    })
  })

  describe('subjects', () => {
    const data = {
      ...emptyPracticeData,
      subjects: [{ id: 's2', name: 'Science' }, { id: 's1', name: 'Algebra' }],
      topicRows: [
        { topic: { id: 't1', name: 'Linear', subjectId: 's1' }, strength: 'Review', cardCount: 12, lastPracticedAt: null, accuracy: null },
        { topic: { id: 't3', name: 'Quadratics', subjectId: 's1' }, strength: 'Review', cardCount: 4, lastPracticedAt: null, accuracy: null },
        { topic: { id: 't2', name: 'Cells', subjectId: 's2' }, strength: 'New', cardCount: 3, lastPracticedAt: null, accuracy: null },
      ],
    }

    it('lists subjects A–Z with topic count and readiness as a number', async () => {
      mockUsePracticeData.mockReturnValue(data)
      mockGetTopicBest.mockResolvedValue([{ topicId: 't1', bestPct: 80 }, { topicId: 't3', bestPct: 60 }])
      await renderSettled()
      const section = screen.getByTestId('practice-subjects')
      const rows = within(section).getAllByRole('button')
      expect(rows[0]!.props.accessibilityLabel).toBe('Algebra, 2 topics, ready 70%')
      expect(rows[1]!.props.accessibilityLabel).toBe('Science, 1 topic, not practised yet')
      fireEvent.press(rows[0]!)
      expect(router.push).toHaveBeenCalledWith('/subjects/s1')
    })

    it('shows skeletons until practice data has loaded', async () => {
      mockUsePracticeData.mockReturnValue({ ...emptyPracticeData, loaded: false })
      await renderSettled()
      expect(within(screen.getByTestId('practice-subjects')).getByLabelText('Loading subjects')).toBeTruthy()
    })

    it('shows an empty state that points to Explore when there are no subjects', async () => {
      await renderSettled()
      const section = screen.getByTestId('practice-subjects')
      expect(within(section).getByText('No subjects on this device yet')).toBeTruthy()
      fireEvent.press(within(section).getByRole('button', { name: 'Choose an exam' }))
      expect(router.push).toHaveBeenCalledWith('/(tabs)/explore')
    })

    it('shows a retryable error when readiness fails to load', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
      mockUsePracticeData.mockReturnValue(data)
      mockGetTopicBest.mockRejectedValueOnce(new Error('db'))
      await renderSettled()
      const section = screen.getByTestId('practice-subjects')
      expect(within(section).getByText("Couldn't load your subjects")).toBeTruthy()
      fireEvent.press(within(section).getByRole('button', { name: 'Try again' }))
      await act(async () => {})
      expect(within(screen.getByTestId('practice-subjects')).getByText('Algebra')).toBeTruthy()
      warn.mockRestore()
    })
  })

  describe('decks', () => {
    it('lists saved decks with a due count, and opens one', async () => {
      mockDecks.push({ id: 'deck1', name: 'My Deck', topicIds: ['t1', 't2'], createdAt: 0 })
      mockGetDueCounts.mockResolvedValue({ total: 5, byTopic: { t1: 3, t2: 2 } })
      await renderSettled()
      const section = screen.getByTestId('practice-decks')
      expect(within(section).getByText('My Deck')).toBeTruthy()
      expect(within(section).getByText('5 due')).toBeTruthy()
      fireEvent.press(within(section).getByText('My Deck'))
      expect(router.push).toHaveBeenCalledWith('/practice/deck/deck1')
    })

    it('deletes a deck only after confirming', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
      mockDecks.push({ id: 'deck1', name: 'My Deck', topicIds: ['t1'], createdAt: 0 })
      await renderSettled()
      fireEvent.press(screen.getByRole('button', { name: 'Delete My Deck' }))
      expect(mockDeleteDeck).not.toHaveBeenCalled()
      const buttons = alertSpy.mock.calls[0]![2] as { text: string; onPress?: () => void }[]
      await act(async () => { buttons.find(b => b.text === 'Delete')!.onPress!() })
      expect(mockDeleteDeck).toHaveBeenCalledWith('deck1')
      alertSpy.mockRestore()
    })

    it('shows no due badge on a deck with nothing due', async () => {
      mockDecks.push({ id: 'deck1', name: 'My Deck', topicIds: ['t1'], createdAt: 0 })
      await renderSettled()
      expect(within(screen.getByTestId('practice-decks')).queryByText(/due$/)).toBeNull()
    })

    it('explains decks when there are none, with a way to make one', async () => {
      await renderSettled()
      const section = screen.getByTestId('practice-decks')
      expect(within(section).getByText(/Bundle topics into a deck/)).toBeTruthy()
    })

    it('creates a deck in a two-step sheet', async () => {
      mockUsePracticeData.mockReturnValue({
        ...emptyPracticeData,
        subjects: [{ id: 's1', name: 'Algebra' }],
        topicRows: [{ topic: { id: 't1', name: 'Linear Equations', subjectId: 's1' }, strength: 'Weak', cardCount: 12, lastPracticedAt: null, accuracy: null }],
      })
      await renderSettled()
      fireEvent.press(screen.getByRole('button', { name: 'New deck' }))
      fireEvent.changeText(screen.getByPlaceholderText('e.g. UPCAT Science finals'), 'Finals')
      fireEvent.press(screen.getByRole('button', { name: 'Next: pick topics' }))
      fireEvent.press(screen.getByRole('checkbox', { name: 'Linear Equations, 12 cards' }))
      await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Create deck' })) })
      expect(mockCreateDeck).toHaveBeenCalledWith('Finals', ['t1'])
    })
  })

  describe('tools', () => {
    it.each([
      ['Estimated Admission Score', '/estimator'],
      ['Notes', '/notes'],
      ['Requirements', '/requirements'],
    ])('opens %s', async (name, href) => {
      await renderSettled()
      fireEvent.press(within(screen.getByTestId('practice-tools')).getByText(name))
      expect(router.push).toHaveBeenCalledWith(href)
    })

    it('frames the admission score as an estimate', async () => {
      await renderSettled()
      expect(within(screen.getByTestId('practice-tools')).getByText(/based on historical cutoffs/)).toBeTruthy()
    })
  })

  describe('focus and duplication', () => {
    it('has exactly one primary next-step action and no duplicated readiness blocks', async () => {
      mockFocusListings.push({ slug: 'upcat', priority: 1, addedAt: 0, title: 'UPCAT', type: 'exam' })
      await renderSettled()
      for (const gone of ['Subject readiness', 'My Focus', 'AI Study Feedback', 'Recommended']) {
        expect(screen.queryByText(gone)).toBeNull()
      }
    })
  })
})
