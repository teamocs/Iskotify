import React from 'react'
import { render, screen, act } from '@testing-library/react-native'
import PracticeReviewScreen from '../[slug]'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ slug: 'upcat' }),
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// useDb returns a chainable stub for the listing-title lookup:
// select().from().where().limit() resolves to the title row.
jest.mock('../../../../hooks/useDb', () => {
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ title: 'UPCAT' }]),
        }),
      }),
    }),
  }
  return { useDb: () => db }
})

const mockUsePracticeData = jest.fn()
jest.mock('../../../../hooks/usePracticeData', () => ({
  usePracticeData: () => mockUsePracticeData(),
}))

const emptyPracticeData = {
  subjects: [],
  topicRows: [],
  recommendedTopics: [],
  totalCards: 0,
  cardCountByTopic: {},
  topicIdsByListingSlug: {},
  refresh: jest.fn(),
}

describe('PracticeReviewScreen', () => {
  afterEach(async () => {
    // Drain the listing-title effect so React doesn't warn between tests.
    await act(async () => {})
  })

  beforeEach(() => {
    mockUsePracticeData.mockReset()
    mockUsePracticeData.mockReturnValue(emptyPracticeData)
  })

  it('renders the subject/topic tagged to the slug', async () => {
    mockUsePracticeData.mockReturnValue({
      ...emptyPracticeData,
      subjects: [{ id: 's1', name: 'Algebra' }],
      topicRows: [
        {
          topic: { id: 't1', name: 'Linear Equations', subjectId: 's1' },
          strength: 'Weak' as const,
          cardCount: 12,
          lastPracticedAt: null,
          accuracy: null,
        },
      ],
      topicIdsByListingSlug: { upcat: ['t1'] },
    })
    render(<PracticeReviewScreen />)
    await act(async () => {})
    // The subject group header renders (and, since the group is "focused" for this
    // slug, it expands to reveal the topic).
    expect(screen.getByText('Algebra')).toBeTruthy()
    expect(screen.getByText('Linear Equations')).toBeTruthy()
  })

  it('renders the empty state when the exam has no tagged topics', async () => {
    mockUsePracticeData.mockReturnValue({
      ...emptyPracticeData,
      subjects: [{ id: 's1', name: 'Algebra' }],
      topicRows: [
        {
          topic: { id: 't1', name: 'Linear Equations', subjectId: 's1' },
          strength: 'Weak' as const,
          cardCount: 12,
          lastPracticedAt: null,
          accuracy: null,
        },
      ],
      // Nothing tagged to this slug → scoped rows are empty → empty state.
      topicIdsByListingSlug: {},
    })
    render(<PracticeReviewScreen />)
    await act(async () => {})
    expect(screen.getByText('No review topics yet')).toBeTruthy()
    // The topic is not in scope, so it must not render.
    expect(screen.queryByText('Linear Equations')).toBeNull()
  })
})
