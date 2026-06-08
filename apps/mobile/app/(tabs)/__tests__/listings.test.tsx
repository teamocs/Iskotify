import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import ExamsScreen from '../listings'

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('@lineiconshq/react-native-lineicons', () => ({
  Lineicons: () => null,
}))

jest.mock('@lineiconshq/free-icons', () => ({
  GraduationCap1Outlined: {},
  SparkOutlined: {},
}))

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: jest.fn((cb: any) => { cb(); return () => {} }),
}))

jest.mock('../../../services/sync', () => ({
  syncOnLaunch: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../../services/settings', () => ({
  getSettings: jest.fn().mockResolvedValue({}),
}))

// Isolate the screen from the on-device LLM import chain.
jest.mock('../../../services/listingSearch', () => ({
  aiSearchListings: jest.fn().mockResolvedValue(null),
}))

jest.mock('../../../hooks/useDb', () => ({
  useDb: jest.fn(),
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

const makeDb = (rows: any[] = []) => ({
  select: jest.fn(() => ({
    from: jest.fn(() => ({
      orderBy: jest.fn().mockResolvedValue([]),
      where: jest.fn(() => ({ limit: jest.fn().mockResolvedValue([]) })),
      then: jest.fn((cb: any) => Promise.resolve().then(() => cb(rows))),
    })),
  })),
  delete: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })),
  insert: jest.fn(() => ({ values: jest.fn(() => ({ onConflictDoNothing: jest.fn().mockResolvedValue(undefined) })) })),
})

const SEARCH_PLACEHOLDER = "Search or ask, e.g. 'free nursing scholarships near me'"

describe('ExamsScreen', () => {
  beforeEach(() => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb())
  })

  it('renders the Exams title and subtitle', () => {
    render(<ExamsScreen />)
    expect(screen.getByText('Exams')).toBeTruthy()
    expect(screen.getByText('College entrance exams & scholarships')).toBeTruthy()
  })

  it('renders exactly the two tabs', () => {
    render(<ExamsScreen />)
    expect(screen.getByText('College Entrance Exams')).toBeTruthy()
    expect(screen.getByText('Scholarships')).toBeTruthy()
  })

  it('renders the smart search input', () => {
    render(<ExamsScreen />)
    expect(screen.getByPlaceholderText(SEARCH_PLACEHOLDER)).toBeTruthy()
  })

  it('shows the empty state when there are no exams', async () => {
    render(<ExamsScreen />)
    await waitFor(() => {
      expect(screen.getByText('No exams yet.')).toBeTruthy()
    })
  })

  it('switches to the Scholarships tab', async () => {
    render(<ExamsScreen />)
    fireEvent.press(screen.getByText('Scholarships'))
    await waitFor(() => {
      expect(screen.getByText('No scholarships yet.')).toBeTruthy()
    })
  })

  it('renders a listing card when data is present', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb([
      { id: '1', slug: 'upcat', title: 'UPCAT 2025', type: 'exam', examDate: null, region: 'NCR', provider: 'UP' },
    ]))
    render(<ExamsScreen />)
    await waitFor(() => {
      expect(screen.getByText('UPCAT 2025')).toBeTruthy()
    })
  })
})
