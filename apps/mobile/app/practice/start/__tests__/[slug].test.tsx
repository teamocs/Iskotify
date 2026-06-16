import React from 'react'
import { render, screen, act } from '@testing-library/react-native'
import PracticeStartScreen from '../[slug]'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ slug: 'upcat' }),
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// useDb returns a chainable stub: select().from().where().limit() resolves to the
// listing title row. Each call returns a fresh chain so .limit() is the awaited tail.
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

// listPublishedBlueprintSlugs is overridden per-test via the hoisted mock.
const mockListPublishedBlueprintSlugs = jest.fn().mockResolvedValue([])
jest.mock('../../../../services/examBlueprints', () => ({
  listPublishedBlueprintSlugs: (...args: any[]) => mockListPublishedBlueprintSlugs(...args),
}))

describe('PracticeStartScreen (chooser)', () => {
  afterEach(async () => {
    // Drain the title + blueprint-slugs effects so React doesn't warn between tests.
    await act(async () => {})
  })

  beforeEach(() => {
    mockListPublishedBlueprintSlugs.mockClear()
    mockListPublishedBlueprintSlugs.mockResolvedValue([])
  })

  it('always renders the "Take a Review" option', async () => {
    render(<PracticeStartScreen />)
    await act(async () => {})
    expect(screen.getByText('Take a Review')).toBeTruthy()
  })

  it('loads and shows the listing title from the db', async () => {
    render(<PracticeStartScreen />)
    await act(async () => {})
    expect(screen.getByText('UPCAT')).toBeTruthy()
  })

  it('shows "Take a Mock Exam" when the slug is a published blueprint', async () => {
    mockListPublishedBlueprintSlugs.mockResolvedValue(['upcat'])
    render(<PracticeStartScreen />)
    await act(async () => {})
    expect(screen.getByText('Take a Mock Exam')).toBeTruthy()
    // No "coming soon" note when a mock is available.
    expect(screen.queryByText(/coming soon/i)).toBeNull()
  })

  it('hides the mock option (shows a coming-soon note) when the slug has no blueprint', async () => {
    mockListPublishedBlueprintSlugs.mockResolvedValue([])
    render(<PracticeStartScreen />)
    await act(async () => {})
    expect(screen.queryByText('Take a Mock Exam')).toBeNull()
    expect(screen.getByText(/coming soon/i)).toBeTruthy()
  })
})
