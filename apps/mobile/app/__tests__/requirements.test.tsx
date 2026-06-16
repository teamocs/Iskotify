import React from 'react'
import { render, screen } from '@testing-library/react-native'
import RequirementsScreen from '../requirements'

const mockBack = jest.fn()
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  router: { back: () => mockBack(), push: (p: string) => mockPush(p) },
}))

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
jest.mock('../../hooks/useDb', () => {
  const db = {
    select: () => ({ from: () => ({ where: () => Promise.resolve(mockRows) }) }),
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
    mockBack.mockClear()
    mockPush.mockClear()
  })

  it('renders the screen title', () => {
    render(<RequirementsScreen />)
    expect(screen.getByText('Requirements')).toBeTruthy()
  })

  it('shows a back arrow button', () => {
    render(<RequirementsScreen />)
    expect(screen.getByText('‹')).toBeTruthy()
  })

  it('shows the Lists empty-state when there are no focus listings', async () => {
    mockFocus = []
    render(<RequirementsScreen />)
    expect(
      await screen.findByText(
        'Add an exam or scholarship from the Lists tab to track its requirements here.',
      ),
    ).toBeTruthy()
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
