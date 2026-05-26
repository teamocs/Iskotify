import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import ListingsScreen from '../listings'

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
  Funnel1Outlined: {},
}))

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: jest.fn((cb: any) => { cb(); return () => {} }),
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
      leftJoin: jest.fn(() => ({
        orderBy: jest.fn().mockResolvedValue([]),
      })),
      orderBy: jest.fn().mockResolvedValue([]),
      then: jest.fn((cb: any) => Promise.resolve().then(() => cb(rows))),
    })),
  })),
  delete: jest.fn(() => ({
    where: jest.fn().mockResolvedValue(undefined),
  })),
  insert: jest.fn(() => ({
    values: jest.fn(() => ({
      onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
    })),
  })),
})

describe('ListingsScreen', () => {
  beforeEach(() => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb())
  })

  it('renders the Listings title', () => {
    render(<ListingsScreen />)
    expect(screen.getByText('Listings')).toBeTruthy()
  })

  it('renders the subtitle', () => {
    render(<ListingsScreen />)
    expect(screen.getByText('Exams & Scholarships')).toBeTruthy()
  })

  it('renders segment control buttons', () => {
    render(<ListingsScreen />)
    expect(screen.getByText('All')).toBeTruthy()
    expect(screen.getByText('Exams')).toBeTruthy()
    expect(screen.getByText('Scholarships')).toBeTruthy()
  })

  it('renders search input', () => {
    render(<ListingsScreen />)
    expect(screen.getByPlaceholderText('Search listings...')).toBeTruthy()
  })

  it('shows empty state when no listings', async () => {
    render(<ListingsScreen />)
    await waitFor(() => {
      expect(screen.getByText('No listings found.')).toBeTruthy()
    })
  })

  it('filters by segment when Exams tab is pressed', async () => {
    render(<ListingsScreen />)
    fireEvent.press(screen.getByText('Exams'))
    await waitFor(() => {
      expect(screen.getByText('No listings found.')).toBeTruthy()
    })
  })

  it('filters by search query', async () => {
    render(<ListingsScreen />)
    fireEvent.changeText(screen.getByPlaceholderText('Search listings...'), 'UPCAT')
    await waitFor(() => {
      expect(screen.getByText('No listings found.')).toBeTruthy()
    })
  })

  it('renders a listing card when data is present', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb([
      { id: '1', slug: 'upcat', title: 'UPCAT 2025', type: 'exam', status: 'active', examDate: null },
    ]))
    render(<ListingsScreen />)
    await waitFor(() => {
      expect(screen.getByText('UPCAT 2025')).toBeTruthy()
    })
  })
})
