import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native'
import SchoolsDirectoryScreen from '../schools/index'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}))

const mockDb = (rows: any[] = []) => ({
  select: jest.fn(() => ({
    from: jest.fn(() => ({
      leftJoin: jest.fn(() => Promise.resolve(rows)),
      where: jest.fn(() => ({
        limit: jest.fn().mockResolvedValue([]),
      })),
    })),
  })),
})

jest.mock('../../hooks/useDb', () => ({
  useDb: jest.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSchool(overrides?: Partial<{
  id: string; name: string; acronym: string | null; region: string | null
  province: string | null; type: string | null; dataConfidence: string | null; freeTuition: boolean | null
}>) {
  return {
    id: 'up-diliman',
    name: 'University of the Philippines Diliman',
    acronym: 'UPD',
    region: 'NCR',
    province: null,
    type: 'State University',
    dataConfidence: 'HIGH',
    freeTuition: true,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests — Directory Screen
// ---------------------------------------------------------------------------

describe('SchoolsDirectoryScreen', () => {
  beforeEach(() => {
    const { useDb } = require('../../hooks/useDb')
    useDb.mockReturnValue(mockDb())
  })

  it('renders screen title', () => {
    render(<SchoolsDirectoryScreen />)
    expect(screen.getByText('Schools Directory')).toBeTruthy()
  })

  it('renders search input', async () => {
    render(<SchoolsDirectoryScreen />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search by name or acronym...')).toBeTruthy()
    })
  })

  it('renders Free Tuition filter chip', async () => {
    render(<SchoolsDirectoryScreen />)
    await waitFor(() => {
      expect(screen.getByText('Free Tuition')).toBeTruthy()
    })
  })

  it('shows empty state when no schools', async () => {
    render(<SchoolsDirectoryScreen />)
    await waitFor(() => {
      expect(screen.getByText('No schools found.')).toBeTruthy()
    })
  })

  it('renders a school card when data is present', async () => {
    const { useDb } = require('../../hooks/useDb')
    useDb.mockReturnValue(mockDb([makeSchool()]))
    render(<SchoolsDirectoryScreen />)
    await waitFor(() => {
      expect(screen.getByText('University of the Philippines Diliman')).toBeTruthy()
    })
  })

  it('filters schools by search query', async () => {
    const { useDb } = require('../../hooks/useDb')
    useDb.mockReturnValue(mockDb([
      makeSchool({ id: 'upd', name: 'UP Diliman', acronym: 'UPD' }),
      makeSchool({ id: 'ust', name: 'UST', acronym: 'UST' }),
    ]))
    render(<SchoolsDirectoryScreen />)
    await waitFor(() => expect(screen.getByText('UP Diliman')).toBeTruthy())
    fireEvent.changeText(screen.getByPlaceholderText('Search by name or acronym...'), 'UST')
    await waitFor(() => {
      expect(screen.queryByText('UP Diliman')).toBeNull()
      expect(screen.getByText('UST')).toBeTruthy()
    })
  })

  it('shows HIGH confidence badge for HIGH data_confidence', async () => {
    const { useDb } = require('../../hooks/useDb')
    useDb.mockReturnValue(mockDb([makeSchool({ dataConfidence: 'HIGH' })]))
    render(<SchoolsDirectoryScreen />)
    await waitFor(() => {
      expect(screen.getByText('HIGH')).toBeTruthy()
    })
  })

  it('shows MEDIUM confidence badge for MEDIUM data_confidence', async () => {
    const { useDb } = require('../../hooks/useDb')
    useDb.mockReturnValue(mockDb([makeSchool({ dataConfidence: 'MEDIUM' })]))
    render(<SchoolsDirectoryScreen />)
    await waitFor(() => {
      expect(screen.getByText('MED')).toBeTruthy()
    })
  })
})
