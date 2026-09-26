import React from 'react'
import { render, screen, act, fireEvent, within } from '@testing-library/react-native'
import PracticeStartScreen from '../[slug]'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ slug: 'upcat' }),
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))

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

  it('always renders the "Take a review" option', async () => {
    render(<PracticeStartScreen />)
    await act(async () => {})
    expect(screen.getByText('Take a review')).toBeTruthy()
  })

  it('loads and shows the listing title from the db', async () => {
    render(<PracticeStartScreen />)
    await act(async () => {})
    expect(screen.getByRole('header', { name: 'UPCAT' })).toBeTruthy()
  })

  it('shows "Take a mock exam" when the slug is a published blueprint', async () => {
    mockListPublishedBlueprintSlugs.mockResolvedValue(['upcat'])
    render(<PracticeStartScreen />)
    await act(async () => {})
    expect(screen.getByText('Take a mock exam')).toBeTruthy()
    // No "coming soon" note when a mock is available.
    expect(screen.queryByText(/coming soon/i)).toBeNull()
  })

  it('hides the mock option (shows a coming-soon note) when the slug has no blueprint', async () => {
    mockListPublishedBlueprintSlugs.mockResolvedValue([])
    render(<PracticeStartScreen />)
    await act(async () => {})
    expect(screen.queryByText('Take a mock exam')).toBeNull()
    expect(screen.getByText(/coming soon/i)).toBeTruthy()
  })

  // Redesign M3 — One Next Step: the mock exam (when there is one) is the hero
  // with the screen's only primary button; the review is a quiet row.
  it('recommends the mock exam when one is published, and starts it from the primary button', async () => {
    const { router } = require('expo-router')
    mockListPublishedBlueprintSlugs.mockResolvedValue(['upcat'])
    render(<PracticeStartScreen />)
    await act(async () => {})
    const hero = screen.getByTestId('chooser-recommended')
    fireEvent.press(within(hero).getByRole('button', { name: /Start mock exam/ }))
    expect(router.push).toHaveBeenCalledWith('/practice/exam/upcat')
  })

  it('recommends the review when there is no mock yet', async () => {
    const { router } = require('expo-router')
    render(<PracticeStartScreen />)
    await act(async () => {})
    const hero = screen.getByTestId('chooser-recommended')
    fireEvent.press(within(hero).getByRole('button', { name: /Start review/ }))
    expect(router.push).toHaveBeenCalledWith('/practice/review/upcat')
  })
})
