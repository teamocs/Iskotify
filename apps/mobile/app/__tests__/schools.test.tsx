import React from 'react'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react-native'
import SchoolsDirectoryScreen from '../schools/index'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
}))

jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))

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

// Sync status under test (idle by default); flipping isSyncing true → false
// makes the directory re-read (useSyncSettled).
const mockSync: { value: { isSyncing: boolean; firstSyncDone: boolean } } = { value: { isSyncing: false, firstSyncDone: true } }
jest.mock('../../hooks/useSyncStatus', () => ({ useSyncStatus: () => mockSync.value }))

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
    mockSync.value = { isSyncing: false, firstSyncDone: true }
    const { useDb } = require('../../hooks/useDb')
    useDb.mockReturnValue(mockDb())
  })

  it('renders screen title', () => {
    render(<SchoolsDirectoryScreen />)
    expect(screen.getByRole('header', { name: 'Schools directory' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Go back' })).toBeTruthy()
  })

  it('renders search input', async () => {
    render(<SchoolsDirectoryScreen />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search by name or acronym')).toBeTruthy()
    })
  })

  it('renders the Free tuition filter as a checkbox chip', async () => {
    render(<SchoolsDirectoryScreen />)
    expect(await screen.findByRole('checkbox', { name: 'Free tuition' })).toBeTruthy()
  })

  it('shows empty state when no schools', async () => {
    render(<SchoolsDirectoryScreen />)
    await waitFor(() => {
      expect(screen.getByText('No schools match')).toBeTruthy()
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
    fireEvent.changeText(screen.getByPlaceholderText('Search by name or acronym'), 'UST')
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
      expect(screen.getByText('High confidence')).toBeTruthy()
    })
  })

  it('shows MEDIUM confidence badge for MEDIUM data_confidence', async () => {
    const { useDb } = require('../../hooks/useDb')
    useDb.mockReturnValue(mockDb([makeSchool({ dataConfidence: 'MEDIUM' })]))
    render(<SchoolsDirectoryScreen />)
    await waitFor(() => {
      expect(screen.getByText('Medium confidence')).toBeTruthy()
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

  it('shows the "Requirements listed" indicator only when requirements is a non-empty array', async () => {
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
    expect(screen.getAllByText('Requirements listed')).toHaveLength(1)
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
    fireEvent.press(screen.getByRole('checkbox', { name: 'Free tuition' }))
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
      screen.getByPlaceholderText('Search by name or acronym'),
      'free tuition universities in bicol',
    )
    await waitFor(() => {
      expect(screen.getByText('Bicol University')).toBeTruthy()
      expect(screen.queryByText('UP Diliman')).toBeNull()
    })
  })
  // ── Redesign M2: states ───────────────────────────────────────────────────

  it('shows a skeleton while the directory loads', () => {
    const { useDb } = require('../../hooks/useDb')
    useDb.mockReturnValue({ select: jest.fn(() => ({ from: jest.fn(() => ({ leftJoin: jest.fn(() => new Promise(() => {})) })) })) })
    render(<SchoolsDirectoryScreen />)
    expect(screen.getByTestId('explore-skeleton').props.accessibilityLabel).toBe('Loading schools')
  })

  it('a failed load offers a retry', async () => {
    const { useDb } = require('../../hooks/useDb')
    let calls = 0
    useDb.mockReturnValue({
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          leftJoin: jest.fn(() => (calls++ === 0 ? Promise.reject(new Error('offline')) : Promise.resolve([makeSchool()]))),
        })),
      })),
    })
    render(<SchoolsDirectoryScreen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('University of the Philippines Diliman')).toBeTruthy()
  })

  it('when filters hide every school, the empty state offers to clear them', async () => {
    const { useDb } = require('../../hooks/useDb')
    useDb.mockReturnValue(mockDb([
      makeSchool({ id: 'p', name: 'Private U', isSuc: false, isLuc: false, freeTuition: false, type: 'Private' }),
    ]))
    render(<SchoolsDirectoryScreen />)
    await screen.findByText('Private U')
    fireEvent.press(screen.getByRole('checkbox', { name: 'Free tuition' }))
    fireEvent.press(await screen.findByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText('Private U')).toBeTruthy()
  })

  it('the type filter is a radio group with an "All types" choice, like Region', async () => {
    const { useDb } = require('../../hooks/useDb')
    useDb.mockReturnValue(mockDb([
      makeSchool({ id: 's', name: 'State U', type: 'State University', isSuc: true }),
      makeSchool({ id: 'p', name: 'Private U', type: 'Private', isSuc: false, isLuc: false, freeTuition: false }),
    ]))
    render(<SchoolsDirectoryScreen />)
    await screen.findByText('Private U')
    const checked = (name: string) => screen.getByRole('radio', { name }).props.accessibilityState?.selected
    expect(checked('All types')).toBe(true)

    fireEvent.press(screen.getByRole('radio', { name: 'SUC' }))
    expect(checked('SUC')).toBe(true)
    expect(checked('All types')).toBe(false)
    expect(screen.queryByText('Private U')).toBeNull()

    // Re-selecting the checked radio keeps it checked (radios do not toggle off).
    fireEvent.press(screen.getByRole('radio', { name: 'SUC' }))
    expect(checked('SUC')).toBe(true)
    expect(screen.queryByText('Private U')).toBeNull()

    fireEvent.press(screen.getByRole('radio', { name: 'All types' }))
    expect(checked('All types')).toBe(true)
    expect(checked('SUC')).toBe(false)
    expect(await screen.findByText('Private U')).toBeTruthy()
  })

  it('applies only the latest load when an older one resolves later', async () => {
    const { useDb } = require('../../hooks/useDb')
    const loads: ((rows: any[]) => void)[] = []
    useDb.mockReturnValue({
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          leftJoin: jest.fn(() => new Promise<any[]>(resolve => { loads.push(resolve) })),
        })),
      })),
    })
    mockSync.value = { isSyncing: true, firstSyncDone: false }
    const view = render(<SchoolsDirectoryScreen />)
    expect(loads).toHaveLength(1)
    // A sync settles while the first read is still in flight: a second read starts.
    mockSync.value = { isSyncing: false, firstSyncDone: true }
    view.rerender(<SchoolsDirectoryScreen />)
    await waitFor(() => expect(loads).toHaveLength(2))
    // The newer read lands first; the older one resolves afterwards with stale rows.
    await act(async () => { loads[1]!([makeSchool({ id: 'new', name: 'Fresh School' })]) })
    await act(async () => { loads[0]!([makeSchool({ id: 'old', name: 'Stale School' })]) })
    expect(screen.getByText('Fresh School')).toBeTruthy()
    expect(screen.queryByText('Stale School')).toBeNull()
  })

  it('a school card is one labelled button that opens the school', async () => {
    const { router } = require('expo-router')
    const { useDb } = require('../../hooks/useDb')
    useDb.mockReturnValue(mockDb([makeSchool()]))
    render(<SchoolsDirectoryScreen />)
    fireEvent.press(await screen.findByRole('button', { name: /^University of the Philippines Diliman, UPD/ }))
    expect(router.push).toHaveBeenCalledWith('/schools/up-diliman')
  })
})
