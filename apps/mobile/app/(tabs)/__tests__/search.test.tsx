/**
 * Search tab (iOS redesign P2a): one field over schools, scholarships and
 * entrance exams from the on-device catalog. Four states — empty (recent and
 * coming up), results, no match, offline — and every scholarship or exam
 * result names its dates and official site only when the data has them.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { listings as listingsTable } from '../../../db/schema'
import SearchScreen from '../search'
import { officialSource, listingMeta, searchCatalog, upcomingListings, type SearchListing } from '../../../components/search/searchModel'
import { addRecent } from '../../../components/search/recentSearches'

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))

const mockStore: Record<string, string> = {}
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockStore[k] = v }),
  },
}))

const mockSync = { value: { isSyncing: false, firstSyncDone: true, lastError: null as string | null } }
jest.mock('../../../hooks/useSyncStatus', () => ({ useSyncStatus: () => mockSync.value }))
jest.mock('../../../components/explore/useSyncSettled', () => ({ useSyncSettled: () => 0 }))
jest.mock('../../../hooks/useProfileName', () => ({ useProfileName: () => 'Ana Reyes' }))
jest.mock('../../../services/settings', () => ({ getSettings: jest.fn().mockResolvedValue({}) }))
const mockSyncOnLaunch = jest.fn().mockResolvedValue(undefined)
jest.mock('../../../services/sync', () => ({ syncOnLaunch: (...a: unknown[]) => mockSyncOnLaunch(...a) }))
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }))

const DAY = 86_400_000
const NOW = Date.now()

const LISTINGS: SearchListing[] = [
  {
    id: 'l1', slug: 'dost-sei', title: 'DOST-SEI Undergraduate Scholarship', type: 'scholarship',
    region: 'National', provider: 'DOST-SEI', province: null, incomeCeiling: null, isVerified: true,
    examDate: null, deadline: NOW + 20 * DAY, externalUrl: 'https://www.sei.dost.gov.ph/apply',
  },
  {
    id: 'l2', slug: 'city-grant', title: 'City Grant', type: 'scholarship',
    region: 'NCR', provider: 'Quezon City', province: null, incomeCeiling: null, isVerified: false,
    examDate: null, deadline: null, externalUrl: '',
  },
  {
    id: 'l3', slug: 'upcat', title: 'UPCAT', type: 'exam',
    region: 'National', provider: 'University of the Philippines', province: null, incomeCeiling: null, isVerified: true,
    examDate: NOW + 60 * DAY, deadline: NOW + 30 * DAY, externalUrl: 'https://upcat.up.edu.ph',
  },
]
const SCHOOLS = [
  { id: 's1', name: 'University of the Philippines Los Baños', acronym: 'UPLB', region: 'CALABARZON', province: 'Laguna', isSuc: true, isLuc: false, freeTuition: true },
]

let mockData: { listings: SearchListing[]; schools: typeof SCHOOLS } = { listings: LISTINGS, schools: SCHOOLS }
const makeDb = () => ({
  select: () => ({
    from: (tbl: unknown) => {
      const rows = tbl === listingsTable ? mockData.listings : mockData.schools
      const p = Promise.resolve(rows) as Promise<unknown> & { leftJoin?: () => Promise<unknown> }
      p.leftJoin = () => Promise.resolve(rows)
      return p
    },
  }),
})
jest.mock('../../../hooks/useDb', () => ({ useDb: () => mockDb }))
let mockDb = makeDb()

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k]
  mockSync.value = { isSyncing: false, firstSyncDone: true, lastError: null }
  mockData = { listings: LISTINGS, schools: SCHOOLS }
  mockDb = makeDb()
  mockSyncOnLaunch.mockClear()
})

describe('Search screen states', () => {
  it('empty: shows what is coming up, soonest first, before anything is typed', async () => {
    render(<SearchScreen />)
    await waitFor(() => expect(screen.getByTestId('search-empty')).toBeTruthy())
    expect(screen.getByText('Coming up')).toBeTruthy()
    expect(screen.getByLabelText(/DOST-SEI Undergraduate Scholarship/)).toBeTruthy()
    expect(screen.queryByText('Recent searches')).toBeNull()
  })

  it('empty: lists recent searches from this device and can clear them', async () => {
    mockStore['iskotify:recent-searches:v1'] = JSON.stringify(['upcat'])
    render(<SearchScreen />)
    await waitFor(() => expect(screen.getByText('Recent searches')).toBeTruthy())
    fireEvent.press(screen.getByLabelText('Search again for upcat'))
    await waitFor(() => expect(screen.getByTestId('search-results')).toBeTruthy())
  })

  it('results: groups matches and shows the deadline and official site', async () => {
    render(<SearchScreen />)
    await waitFor(() => expect(screen.getByTestId('search-empty')).toBeTruthy())
    fireEvent.changeText(screen.getByTestId('search-input'), 'dost')
    await waitFor(() => expect(screen.getByTestId('search-results')).toBeTruthy())
    expect(screen.getByText('Scholarships')).toBeTruthy()
    const card = screen.getByLabelText(/DOST-SEI Undergraduate Scholarship/)
    expect(card.props.accessibilityLabel).toMatch(/Apply by/)
    expect(card.props.accessibilityLabel).toMatch(/Official site: sei\.dost\.gov\.ph/)
  })

  it('results: finds a school by acronym', async () => {
    render(<SearchScreen />)
    await waitFor(() => expect(screen.getByTestId('search-empty')).toBeTruthy())
    fireEvent.changeText(screen.getByTestId('search-input'), 'uplb')
    await waitFor(() => expect(screen.getByText('Schools')).toBeTruthy())
    expect(screen.getByLabelText(/Los Baños/)).toBeTruthy()
  })

  it('no match: says so and offers to clear the search', async () => {
    render(<SearchScreen />)
    await waitFor(() => expect(screen.getByTestId('search-empty')).toBeTruthy())
    fireEvent.changeText(screen.getByTestId('search-input'), 'zzqx')
    await waitFor(() => expect(screen.getByTestId('search-no-match')).toBeTruthy())
    fireEvent.press(screen.getByText('Clear search'))
    await waitFor(() => expect(screen.getByTestId('search-empty')).toBeTruthy())
  })

  it('offline: nothing synced yet and the last sync failed → a calm retry', async () => {
    mockData = { listings: [], schools: [] }
    mockSync.value = { isSyncing: false, firstSyncDone: false, lastError: 'Network request failed' }
    render(<SearchScreen />)
    await waitFor(() => expect(screen.getByTestId('search-offline')).toBeTruthy())
    expect(screen.getByText("You're offline")).toBeTruthy()
    fireEvent.press(screen.getByText('Try again'))
    expect(mockSyncOnLaunch).toHaveBeenCalled()
  })

  it('a failed sync with a catalog already on the device still searches it', async () => {
    mockSync.value = { isSyncing: false, firstSyncDone: true, lastError: 'Network request failed' }
    render(<SearchScreen />)
    await waitFor(() => expect(screen.getByTestId('search-empty')).toBeTruthy())
    expect(screen.queryByTestId('search-offline')).toBeNull()
  })
})

describe('searchModel', () => {
  it('names a source only from a real URL', () => {
    expect(officialSource('https://www.ched.gov.ph/x')).toBe('ched.gov.ph')
    expect(officialSource('')).toBeNull()
    expect(officialSource(null)).toBeNull()
    expect(officialSource('not a url')).toBeNull()
    expect(officialSource('https://localhost')).toBeNull()
  })

  it('leaves out the deadline and source when the listing has neither', () => {
    const meta = listingMeta(LISTINGS[1]!)
    expect(meta).not.toMatch(/Apply by|Official site/)
  })

  it('an exam shows its exam date and its deadline', () => {
    expect(listingMeta(LISTINGS[2]!)).toMatch(/^Exam .+ · Apply by .+ · Official site: upcat\.up\.edu\.ph$/)
  })

  it('an unmatched query returns nothing (not the whole catalog)', () => {
    const r = searchCatalog('zzqx', { listings: LISTINGS, schools: SCHOOLS })
    expect(r.schools.length + r.scholarships.length + r.exams.length).toBe(0)
  })

  it('coming up skips undated and past listings', () => {
    const past = { ...LISTINGS[0]!, id: 'p', slug: 'past', deadline: NOW - DAY }
    expect(upcomingListings([...LISTINGS, past], NOW).map(l => l.id)).toEqual(['l1', 'l3'])
  })

  it('keeps recent searches unique, newest first, at most five', () => {
    let list: string[] = []
    for (const q of ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'B2']) list = addRecent(list, q)
    expect(list).toEqual(['B2', 'f6', 'e5', 'd4', 'c3'])
    expect(addRecent(list, ' ')).toEqual(list)
  })
})
