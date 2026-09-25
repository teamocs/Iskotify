import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import RequirementsScreen from '../requirements'

const mockBack = jest.fn()
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  router: { back: () => mockBack(), push: (p: string) => mockPush(p), canGoBack: () => true, replace: jest.fn() },
}))

jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// useFocusListings drives which listings appear — overridden per test.
let mockFocus: Array<{ slug: string; title: string; type: string }> = []
jest.mock('../../hooks/useFocusListings', () => ({
  useFocusListings: () => ({ focusListings: mockFocus }),
}))

// useDb returns the requirements JSON for the focus slugs (select→from→where).
// The db object MUST be stable across renders — the screen's load effect depends
// on the db reference, so a fresh object per render would re-fire it forever
// (infinite loop → heap OOM). Build it once inside the factory; read mockRows
// lazily at call time. Real useDb() is likewise a stable reference.
let mockRows: Array<{ slug: string; requirements: string | null }> = []
let mockPending = false
jest.mock('../../hooks/useDb', () => {
  const db = {
    select: () => ({ from: () => ({ where: () => (mockPending ? new Promise(() => {}) : Promise.resolve(mockRows)) }) }),
  }
  return { useDb: () => db }
})

// Reuses the SAME checklist component as the listing-details screen; stub it out.
jest.mock('../../components/RequirementsChecklist', () => ({
  RequirementsChecklist: () => null,
}))

// Minimal InfoBanner stub so we can assert the empty-state copy deterministically.
jest.mock('../../components/ui/InfoBanner', () => {
  const React = require('react')
  const { Text } = require('react-native')
  return { InfoBanner: ({ message }: any) => React.createElement(Text, null, message) }
})

describe('RequirementsScreen', () => {
  beforeEach(() => {
    mockFocus = []
    mockRows = []
    mockPending = false
    mockBack.mockClear()
    mockPush.mockClear()
  })

  it('renders the screen title as its header', () => {
    render(<RequirementsScreen />)
    expect(screen.getByRole('header', { name: 'Requirements' })).toBeTruthy()
  })

  it('has a labelled back button (a drawn icon, not a glyph)', () => {
    render(<RequirementsScreen />)
    expect(screen.getByRole('button', { name: 'Go back' })).toBeTruthy()
    expect(screen.queryByText('‹')).toBeNull()
  })

  it('with nothing in Focus, the empty state points to Explore (the Lists tab is gone)', async () => {
    mockFocus = []
    render(<RequirementsScreen />)
    expect(await screen.findByText('Nothing to track yet')).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Browse Explore' }))
    expect(mockPush).toHaveBeenCalledWith('/explore')
  })

  it('shows a skeleton while requirements load', () => {
    mockFocus = [{ slug: 'upcat', title: 'UPCAT', type: 'exam' }]
    mockPending = true
    render(<RequirementsScreen />)
    expect(screen.getByTestId('requirements-skeleton')).toBeTruthy()
  })

  it('lists each focus listing with its acquired progress', async () => {
    mockFocus = [{ slug: 'upcat', title: 'UPCAT', type: 'exam' }]
    mockRows = [
      { slug: 'upcat', requirements: JSON.stringify(['Form 138', 'PSA Birth Certificate']) },
    ]
    render(<RequirementsScreen />)
    expect(await screen.findByText('UPCAT')).toBeTruthy()
    expect(await screen.findByText('0/2 done')).toBeTruthy()
  })
})
