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
  isSuc: boolean; isLuc: boolean; entranceExamAcronym: string | null; requirements: string | null
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
    isSuc: true,
    isLuc: false,
    entranceExamAcronym: 'UPCAT',
    requirements: '["Form 138", "Barangay Certificate"]',
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

  // ── Task 5: richer card + working filters ─────────────────────────────────

  it('shows the entrance-exam acronym chip on the card', async () => {
    const { useDb } = require('../../hooks/useDb')
    useDb.mockReturnValue(mockDb([makeSchool({ entranceExamAcronym: 'UPCAT' })]))
    render(<SchoolsDirectoryScreen />)
    await waitFor(() => {
      expect(screen.getByText('UPCAT')).toBeTruthy()
    })
  })

  it('shows the "Requirements ✓" indicator only when requirements is a non-empty array', async () => {
    const { useDb } = require('../../hooks/useDb')
    useDb.mockReturnValue(mockDb([
      makeSchool({ id: 'has-reqs', name: 'Has Reqs U', requirements: '["Form 138"]' }),
      makeSchool({ id: 'no-reqs', name: 'No Reqs U', requirements: '[]' }),
    ]))
    render(<SchoolsDirectoryScreen />)
    await waitFor(() => {
      expect(screen.getByText('Has Reqs U')).toBeTruthy()
      expect(screen.getByText('No Reqs U')).toBeTruthy()
    })
    expect(screen.getAllByText('Requirements ✓')).toHaveLength(1)
  })

  it('Free Tuition filter includes SUC/LUC schools with no profile row (freeTuition null)', async () => {
    const { useDb } = require('../../hooks/useDb')
    useDb.mockReturnValue(mockDb([
      // Profile-less SUC: freeTuition is null (LEFT JOIN with no matching profile row).
      makeSchool({ id: 'suc-no-profile', name: 'SUC No Profile', isSuc: true, isLuc: false, freeTuition: null }),
      // Private, no free-tuition flag — should be excluded.
      makeSchool({ id: 'private-school', name: 'Private School', isSuc: false, isLuc: false, freeTuition: null, type: 'Private' }),
    ]))
    render(<SchoolsDirectoryScreen />)
    await waitFor(() => expect(screen.getByText('SUC No Profile')).toBeTruthy())
    fireEvent.press(screen.getByText('Free Tuition'))
    await waitFor(() => {
      expect(screen.getByText('SUC No Profile')).toBeTruthy()
      expect(screen.queryByText('Private School')).toBeNull()
    })
  })

  it('type chips are normalized buckets (SUC), not raw free-text strings', async () => {
    const { useDb } = require('../../hooks/useDb')
    useDb.mockReturnValue(mockDb([
      makeSchool({ id: 'a', name: 'School A', type: 'State College (SUC)', isSuc: true }),
      makeSchool({ id: 'b', name: 'School B', type: 'State University', isSuc: true }),
    ]))
    render(<SchoolsDirectoryScreen />)
    await waitFor(() => expect(screen.getByText('School A')).toBeTruthy())
    // Both raw strings normalize to the same "SUC" bucket — only one chip, not two.
    expect(screen.getAllByText('SUC')).toHaveLength(1)
  })

  it('search intent parse: "free tuition universities in bicol" filters to Bicol SUC/LUC/free schools', async () => {
    const { useDb } = require('../../hooks/useDb')
    useDb.mockReturnValue(mockDb([
      makeSchool({ id: 'bu', name: 'Bicol University', region: 'Region V (Bicol)', isSuc: true, freeTuition: null }),
      makeSchool({ id: 'upd', name: 'UP Diliman', region: 'NCR', isSuc: true, freeTuition: null }),
    ]))
    render(<SchoolsDirectoryScreen />)
    await waitFor(() => expect(screen.getByText('Bicol University')).toBeTruthy())
    fireEvent.changeText(
      screen.getByPlaceholderText('Search by name or acronym...'),
      'free tuition universities in bicol',
    )
    await waitFor(() => {
      expect(screen.getByText('Bicol University')).toBeTruthy()
      expect(screen.queryByText('UP Diliman')).toBeNull()
    })
  })
})
