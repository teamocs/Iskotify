import React from 'react'
import { render, screen, act, fireEvent, within } from '@testing-library/react-native'
import PracticeReviewScreen from '../[slug]'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ slug: 'upcat' }),
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))

const mockBp = { value: 'compact' as 'compact' | 'medium' | 'expanded' }
jest.mock('../../../../hooks/useBreakpoint', () => {
  const actual = jest.requireActual('../../../../hooks/useBreakpoint')
  return { ...actual, useBreakpoint: () => mockBp.value }
})

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
  loaded: true,
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
    // The topic row (the hero may also name it as the next step).
    expect(screen.getByRole('button', { name: /^Linear Equations, 12 cards/ })).toBeTruthy()
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

  // ── Redesign M3 ────────────────────────────────────────────────────────────
  const twoTopics = {
    ...emptyPracticeData,
    loaded: true,
    subjects: [{ id: 's1', name: 'Algebra' }],
    topicRows: [
      { topic: { id: 't1', name: 'Linear Equations', subjectId: 's1' }, strength: 'Strong' as const, cardCount: 12, lastPracticedAt: 1, accuracy: 90 },
      { topic: { id: 't2', name: 'Quadratics', subjectId: 's1' }, strength: 'Weak' as const, cardCount: 8, lastPracticedAt: 1, accuracy: 40 },
    ],
    topicIdsByListingSlug: { upcat: ['t1', 't2'] },
  }

  it('titles the page with the exam name as the only level-1 heading', async () => {
    mockBp.value = 'compact'
    mockUsePracticeData.mockReturnValue(twoTopics)
    render(<PracticeReviewScreen />)
    await act(async () => {})
    expect(screen.getByRole('header', { name: 'UPCAT' })).toBeTruthy()
  })

  it('recommends the weakest topic as the one next step', async () => {
    const { router } = require('expo-router')
    mockBp.value = 'compact'
    mockUsePracticeData.mockReturnValue(twoTopics)
    render(<PracticeReviewScreen />)
    await act(async () => {})
    const hero = screen.getByTestId('review-next-step')
    expect(within(hero).getByText('Quadratics')).toBeTruthy()
    fireEvent.press(within(hero).getByRole('button', { name: /Review Quadratics/ }))
    expect(router.push).toHaveBeenCalledWith('/practice/t2')
  })

  it('draws the subject chevron as an icon, never a ▼/▶ glyph', async () => {
    mockUsePracticeData.mockReturnValue(twoTopics)
    render(<PracticeReviewScreen />)
    await act(async () => {})
    expect(screen.queryByText(/[▼▶]/)).toBeNull()
  })

  it('puts the next step beside the topics on desktop', async () => {
    mockBp.value = 'expanded'
    mockUsePracticeData.mockReturnValue(twoTopics)
    render(<PracticeReviewScreen />)
    await act(async () => {})
    expect(screen.getByTestId('two-column').props.style.flexDirection).toBe('row')
  })

  it('shows a skeleton until the practice data has loaded', async () => {
    mockUsePracticeData.mockReturnValue({ ...emptyPracticeData, loaded: false })
    render(<PracticeReviewScreen />)
    await act(async () => {})
    expect(screen.getByLabelText('Loading review topics')).toBeTruthy()
  })

  it('the empty state offers one way back', async () => {
    mockUsePracticeData.mockReturnValue({ ...emptyPracticeData, loaded: true })
    render(<PracticeReviewScreen />)
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Back to Practice' })).toBeTruthy()
  })
})
