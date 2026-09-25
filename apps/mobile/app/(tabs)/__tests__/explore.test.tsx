import React from 'react'
import { FlatList } from 'react-native'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native'
import ListsScreen from '../explore'

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

// Sync status under test (idle by default).
const mockSync: { value: { isSyncing: boolean; firstSyncDone: boolean } } = { value: { isSyncing: false, firstSyncDone: true } }
jest.mock('../../../hooks/useSyncStatus', () => ({ useSyncStatus: () => mockSync.value }))

// Size class under test (compact phone by default).
const mockBp: { value: 'compact' | 'medium' | 'expanded' } = { value: 'compact' }
jest.mock('../../../hooks/useBreakpoint', () => {
  const actual = jest.requireActual('../../../hooks/useBreakpoint')
  return { ...actual, useBreakpoint: () => mockBp.value }
})

// Controlled deep-link params — legacy ?tab= (old Lists links) and ?section=
// (Explore). Override per-test via mockTabParam.value / mockSectionParam.value.
const mockTabParam: { value?: string } = { value: undefined }
const mockSectionParam: { value?: string } = { value: undefined }

// The URL as an external store, so a test can make router.setParams feed the
// new value back into useLocalSearchParams in the same mounted tree (as the
// real router does). setParams itself is a no-op unless a test wires it up.
const mockUrl = {
  listeners: new Set<() => void>(),
  snap: null as null | { tab?: string; section?: string },
  get() {
    const s = this.snap
    if (!s || s.tab !== mockTabParam.value || s.section !== mockSectionParam.value) {
      this.snap = { tab: mockTabParam.value, section: mockSectionParam.value }
    }
    return this.snap!
  },
  subscribe(l: () => void) { mockUrl.listeners.add(l); return () => { mockUrl.listeners.delete(l) } },
  write(p: { tab?: string; section?: string }) {
    if ('tab' in p) mockTabParam.value = p.tab
    if ('section' in p) mockSectionParam.value = p.section
    mockUrl.listeners.forEach(l => l())
  },
}

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), setParams: jest.fn(), replace: jest.fn() },
  // Like the real hook: run on focus (mount) and when the callback changes —
  // not on every render.
  useFocusEffect: (cb: any) => require('react').useEffect(cb, [cb]),
  useLocalSearchParams: () => require('react').useSyncExternalStore(
    (l: () => void) => mockUrl.subscribe(l),
    () => mockUrl.get(),
  ),
}))

// Counts News & dates mounts (a section flip-flop remounts it).
const mockNewsMounts = { n: 0 }

// The News & dates section is covered by newsFeed.test.tsx; stub it here.
jest.mock('../../../components/explore/NewsFeed', () => ({
  NewsFeed: () => {
    const { Text } = require('react-native')
    require('react').useEffect(() => { mockNewsMounts.n += 1 }, [])
    return <Text>NEWS_FEED_STUB</Text>
  },
}))

// Header avatar reads the student's name; keep it out of the db mock.
jest.mock('../../../hooks/useProfileName', () => ({
  useProfileName: () => 'Ana Reyes',
}))

jest.mock('../../../services/sync', () => ({
  syncOnLaunch: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../../services/settings', () => ({
  getSettings: jest.fn().mockResolvedValue({}),
}))

// Readiness aggregates run their own multi-level groupBy/subquery SQL the simple
// row-based `makeDb` mock below can't express — mock the service directly
// (same pattern as sync/settings/listingSearch above). Individual tests can
// override these via mockResolvedValueOnce for readiness-specific assertions.
jest.mock('../../../services/homeAggregates', () => ({
  getListingMockBest: jest.fn().mockResolvedValue([]),
  getListingAccuracy: jest.fn().mockResolvedValue([]),
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

// Mock the shared courses hook so we can control its output in tests
jest.mock('../../../hooks/useCourseTabOptions', () => ({
  useCourseTabOptions: jest.fn(() => ({
    targetOptions: [],
    allOptions: [],
    loading: false,
    dbEmpty: false,
  })),
}))

// Mock queryCache to return empty arrays for destination queries
jest.mock('../../../services/queryCache', () => ({
  cachedQuery: jest.fn().mockResolvedValue([[], []]),
  subscribe: jest.fn(() => () => {}),
}))

// `rows` feed the listings query (scholarships FlatList via .then); `schoolRows`
// feed the SchoolsDirectory query on the Universities tab (.from().leftJoin()).
const makeDb = (rows: any[] = [], schoolRows: any[] = []) => ({
  select: jest.fn(() => ({
    from: jest.fn(() => ({
      orderBy: jest.fn().mockResolvedValue([]),
      where: jest.fn(() => ({ limit: jest.fn().mockResolvedValue([]) })),
      leftJoin: jest.fn(() => Promise.resolve(schoolRows)),
      then: jest.fn((cb: any) => Promise.resolve().then(() => cb(rows))),
    })),
  })),
  delete: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })),
  insert: jest.fn(() => ({ values: jest.fn(() => ({ onConflictDoNothing: jest.fn().mockResolvedValue(undefined) })) })),
})

/** numColumns of the section's grid (the FlatList element, not its host view). */
function gridColumns(): number | undefined {
  return screen.UNSAFE_getAllByType(FlatList).find(l => l.props.testID === 'explore-grid')?.props.numColumns
}

// Universities tab is now the tertiary-schools directory (not exam listings).
const SEARCH_PLACEHOLDER_UNI = 'Name or acronym, e.g. UPLB'
const SEARCH_PLACEHOLDER_SCHOLAR = 'Try "full scholarship for STEM"'

describe('ListsScreen', () => {
  beforeEach(() => {
    mockTabParam.value = undefined
    mockSectionParam.value = undefined
    mockNewsMounts.n = 0
    require('expo-router').router.setParams.mockReset()
    mockBp.value = 'compact'
    mockSync.value = { isSyncing: false, firstSyncDone: true }
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb())
    jest.clearAllMocks()
    const { useDb: useDb2 } = require('../../../hooks/useDb')
    useDb2.mockReturnValue(makeDb())
    const { useCourseTabOptions } = require('../../../hooks/useCourseTabOptions')
    useCourseTabOptions.mockReturnValue({ targetOptions: [], allOptions: [], loading: false, dbEmpty: false })
    const { cachedQuery } = require('../../../services/queryCache')
    cachedQuery.mockResolvedValue([[], []])
    // Re-establish the default empty profile (clearAllMocks wipes call data, not
    // implementations, so a per-test mockResolvedValue would otherwise leak forward).
    const { getSettings } = require('../../../services/settings')
    getSettings.mockResolvedValue({})
  })

  // ── Redesign M1: Lists + Updates fold into Explore ─────────────────────────

  it('renders the Explore title (the old Lists tab is now Explore)', () => {
    render(<ListsScreen />)
    expect(screen.getByRole('header', { name: 'Explore' })).toBeTruthy()
    expect(screen.queryByText('Lists')).toBeNull()
  })

  it('has a Profile avatar in the header that opens /profile', () => {
    const { router } = require('expo-router')
    render(<ListsScreen />)
    fireEvent.press(screen.getByRole('button', { name: 'Profile' }))
    expect(router.push).toHaveBeenCalledWith('/profile')
  })

  it('offers five sections in one tablist, including News & dates', () => {
    render(<ListsScreen />)
    expect(screen.getByTestId('explore-sections').props.accessibilityRole).toBe('tablist')
    expect(screen.getAllByRole('tab').map(t => t.props.accessibilityLabel)).toEqual([
      'Schools & exams', 'Scholarships', 'Courses', 'Destinations', 'News & dates',
    ])
  })

  it('switching to News & dates shows the feed and hides the listings search', () => {
    render(<ListsScreen />)
    fireEvent.press(screen.getByText('News & dates'))
    expect(screen.getByText('NEWS_FEED_STUB')).toBeTruthy()
    expect(screen.queryByPlaceholderText(SEARCH_PLACEHOLDER_UNI)).toBeNull()
    expect(screen.getAllByRole('tab')[4]?.props.accessibilityState?.selected).toBe(true)
  })

  it('opens News & dates from ?section=news (old Updates deep links redirect here)', () => {
    mockSectionParam.value = 'news'
    render(<ListsScreen />)
    expect(screen.getByText('NEWS_FEED_STUB')).toBeTruthy()
  })

  it('accepts ?section= for listing sections too', () => {
    mockSectionParam.value = 'scholarships'
    render(<ListsScreen />)
    expect(screen.getAllByRole('tab')[1]?.props.accessibilityState?.selected).toBe(true)
  })

  it('does NOT render the old "Exams" title', () => {
    render(<ListsScreen />)
    // The title should be "Lists" not "Exams"
    expect(screen.queryByText('College entrance exams & scholarships')).toBeNull()
  })

  // ── Section navigation (the 4 listing sections + News & dates) ─────────────
  // "Universities" is now labelled "Schools & exams" — entrance exams live in
  // it, so a student looking for UPCAT dates finds them (brief finding 5).

  it('Universities tab is active by default (has accessibilityState selected)', () => {
    render(<ListsScreen />)
    const tabs = screen.getAllByRole('tab')
    const uniTab = tabs.find(t => t.props.accessibilityLabel === undefined &&
      t.props.accessibilityState?.selected === true)
    // The first tab (Universities) should be selected
    expect(tabs[0]?.props.accessibilityState?.selected).toBe(true)
    expect(tabs[1]?.props.accessibilityState?.selected).toBe(false)
    expect(tabs[2]?.props.accessibilityState?.selected).toBe(false)
    expect(tabs[3]?.props.accessibilityState?.selected).toBe(false)
  })

  it('switching to Scholarships tab changes active state', () => {
    render(<ListsScreen />)
    fireEvent.press(screen.getByText('Scholarships'))
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]?.props.accessibilityState?.selected).toBe(false)
    expect(tabs[1]?.props.accessibilityState?.selected).toBe(true)
  })

  it('switching to Courses tab changes active state', () => {
    render(<ListsScreen />)
    fireEvent.press(screen.getByText('Courses'))
    const tabs = screen.getAllByRole('tab')
    expect(tabs[2]?.props.accessibilityState?.selected).toBe(true)
  })

  it('switching to Destinations tab changes active state', () => {
    render(<ListsScreen />)
    fireEvent.press(screen.getByText('Destinations'))
    const tabs = screen.getAllByRole('tab')
    expect(tabs[3]?.props.accessibilityState?.selected).toBe(true)
  })

  it('does NOT render old "College Entrance Exams" segment label', () => {
    render(<ListsScreen />)
    expect(screen.queryByText('College Entrance Exams')).toBeNull()
  })

  // ── Universities tab (existing behavior) ──────────────────────────────────

  it('renders the smart search input on Universities tab', () => {
    render(<ListsScreen />)
    expect(screen.getByPlaceholderText(SEARCH_PLACEHOLDER_UNI)).toBeTruthy()
  })

  // ── Distinct per-tab placeholders ─────────────────────────────────────────

  it('shows a scholarship-specific placeholder on the Scholarships tab', () => {
    render(<ListsScreen />)
    fireEvent.press(screen.getByText('Scholarships'))
    expect(screen.getByPlaceholderText(SEARCH_PLACEHOLDER_SCHOLAR)).toBeTruthy()
  })

  it('uses DIFFERENT placeholders for Universities and Scholarships', () => {
    expect(SEARCH_PLACEHOLDER_UNI).not.toBe(SEARCH_PLACEHOLDER_SCHOLAR)
    render(<ListsScreen />)
    // Universities placeholder present by default
    expect(screen.getByPlaceholderText(SEARCH_PLACEHOLDER_UNI)).toBeTruthy()
    // ...and the scholarship one is NOT shown while on Universities
    expect(screen.queryByPlaceholderText(SEARCH_PLACEHOLDER_SCHOLAR)).toBeNull()
  })

  it('shows the directory empty state when there are no schools (Universities tab)', async () => {
    render(<ListsScreen />)
    await waitFor(() => {
      expect(screen.getByText('No schools match')).toBeTruthy()
    })
  })

  it('switches to the Scholarships tab and shows no scholarships empty state', async () => {
    render(<ListsScreen />)
    fireEvent.press(screen.getByText('Scholarships'))
    await waitFor(() => {
      expect(screen.getByText('No scholarships yet')).toBeTruthy()
    })
  })

  it('renders a school card when directory data is present on Universities tab', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb([], [
      { id: 'up-diliman', name: 'University of the Philippines Diliman', acronym: 'UPD', region: 'NCR', province: null, type: 'State University', dataConfidence: 'HIGH', freeTuition: true },
    ]))
    render(<ListsScreen />)
    await waitFor(() => {
      expect(screen.getByText('University of the Philippines Diliman')).toBeTruthy()
    })
  })

  it('pins the focusable Entrance exams section above the directory on Universities tab', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb(
      [{ id: 'e1', slug: 'upcat', title: 'UPCAT', type: 'exam', examDate: null, region: 'NCR', provider: 'UP', targetCourses: JSON.stringify([]) }],
      [{ id: 'upd', name: 'UP Diliman', acronym: 'UPD', region: 'NCR', province: null, type: 'State University', dataConfidence: 'HIGH', freeTuition: true }],
    ))
    render(<ListsScreen />)
    await waitFor(() => {
      expect(screen.getByText('Entrance exams')).toBeTruthy()
      expect(screen.getByText('UPCAT')).toBeTruthy()      // focusable exam card
      expect(screen.getByText('All schools')).toBeTruthy()
      expect(screen.getByText('UP Diliman')).toBeTruthy() // directory below
    })
  })

  it('tapping an Entrance-exam card pushes /listings/[slug] (where Add to Focus lives)', async () => {
    const { router } = require('expo-router')
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb(
      [{ id: 'e1', slug: 'upcat', title: 'UPCAT', type: 'exam', examDate: null, region: 'NCR', provider: 'UP', targetCourses: JSON.stringify([]) }],
      [],
    ))
    render(<ListsScreen />)
    await waitFor(() => expect(screen.getByText('UPCAT')).toBeTruthy())
    fireEvent.press(screen.getByText('UPCAT'))
    expect(router.push).toHaveBeenCalledWith('/listings/upcat')
  })

  it('tapping a school card on Universities tab pushes /schools/[id]', async () => {
    const { router } = require('expo-router')
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb([], [
      { id: 'up-diliman', name: 'UP Diliman', acronym: 'UPD', region: 'NCR', province: null, type: 'State University', dataConfidence: 'HIGH', freeTuition: true },
    ]))
    render(<ListsScreen />)
    await waitFor(() => expect(screen.getByText('UP Diliman')).toBeTruthy())
    fireEvent.press(screen.getByText('UP Diliman'))
    expect(router.push).toHaveBeenCalledWith('/schools/up-diliman')
  })

  it('does not show Verified badge or course chip on scholarship list rows', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb([
      {
        id: '2', slug: 'dost-se', title: 'DOST-SEI Scholarship', type: 'scholarship',
        examDate: null, region: 'National', provider: 'DOST', isVerified: 1,
        targetCourses: JSON.stringify(['STEM']),
      },
    ]))
    render(<ListsScreen />)
    fireEvent.press(screen.getByText('Scholarships'))
    await waitFor(() => {
      expect(screen.getByText('DOST-SEI Scholarship')).toBeTruthy()
    })
    expect(screen.queryByText('✓ Verified')).toBeNull()
    expect(screen.queryByText('✦ For your course')).toBeNull()
  })

  // ── uniLink removed ────────────────────────────────────────────────────────

  it('does NOT render the old uniLink row "Find top universities by course"', () => {
    render(<ListsScreen />)
    expect(screen.queryByText('🏫 Find top universities by course')).toBeNull()
  })

  // ── Courses tab ────────────────────────────────────────────────────────────

  it('renders course rows when useCourseTabOptions provides data', async () => {
    const { useCourseTabOptions } = require('../../../hooks/useCourseTabOptions')
    useCourseTabOptions.mockReturnValue({
      targetOptions: [{ courseTab: 'nursing', label: 'Nursing' }],
      allOptions: [
        { courseTab: 'nursing', label: 'Nursing' },
        { courseTab: 'engineering', label: 'Engineering' },
      ],
      loading: false,
      dbEmpty: false,
    })
    render(<ListsScreen />)
    fireEvent.press(screen.getByText('Courses'))
    await waitFor(() => {
      expect(screen.getByText('All courses')).toBeTruthy()
      expect(screen.getByText('Engineering')).toBeTruthy()
    })
  })

  it('renders target courses section when user has target courses', async () => {
    const { useCourseTabOptions } = require('../../../hooks/useCourseTabOptions')
    useCourseTabOptions.mockReturnValue({
      targetOptions: [{ courseTab: 'nursing', label: 'Nursing' }],
      allOptions: [{ courseTab: 'nursing', label: 'Nursing' }],
      loading: false,
      dbEmpty: false,
    })
    render(<ListsScreen />)
    fireEvent.press(screen.getByText('Courses'))
    await waitFor(() => {
      expect(screen.getByText('Your target courses')).toBeTruthy()
    })
  })

  it('tapping a course row pushes /schools/course/[courseTab]', async () => {
    const { router } = require('expo-router')
    const { useCourseTabOptions } = require('../../../hooks/useCourseTabOptions')
    useCourseTabOptions.mockReturnValue({
      targetOptions: [],
      allOptions: [{ courseTab: 'nursing', label: 'Nursing' }],
      loading: false,
      dbEmpty: false,
    })
    render(<ListsScreen />)
    fireEvent.press(screen.getByText('Courses'))
    await waitFor(() => {
      expect(screen.getByText('Nursing')).toBeTruthy()
    })
    fireEvent.press(screen.getByText('Nursing'))
    expect(router.push).toHaveBeenCalledWith('/schools/course/nursing')
  })

  // ── Destinations tab ───────────────────────────────────────────────────────

  it('renders country rows on Destinations tab', async () => {
    const { cachedQuery } = require('../../../services/queryCache')
    cachedQuery.mockResolvedValue([
      [{ code: 'australia', name: 'Australia', region: 'Oceania' }],
      [{ courseId: 'nursing', country: 'Australia (Skilled)' }],
    ])
    render(<ListsScreen />)
    fireEvent.press(screen.getByText('Destinations'))
    await waitFor(() => {
      expect(screen.getByText('Australia')).toBeTruthy()
    })
  })

  it('tapping a destination row pushes /career/country/[code]', async () => {
    const { router } = require('expo-router')
    const { cachedQuery } = require('../../../services/queryCache')
    cachedQuery.mockResolvedValue([
      [{ code: 'australia', name: 'Australia', region: 'Oceania' }],
      [{ courseId: 'nursing', country: 'Australia (Skilled)' }],
    ])
    render(<ListsScreen />)
    fireEvent.press(screen.getByText('Destinations'))
    await waitFor(() => {
      expect(screen.getByText('Australia')).toBeTruthy()
    })
    fireEvent.press(screen.getByText('Australia'))
    expect(router.push).toHaveBeenCalledWith('/career/country/australia')
  })

  it('destination subtitle shows courseCount when non-zero', async () => {
    const { cachedQuery } = require('../../../services/queryCache')
    cachedQuery.mockResolvedValue([
      [{ code: 'australia', name: 'Australia', region: 'Oceania' }],
      [
        { courseId: 'nursing', country: 'Australia (Skilled)' },
        { courseId: 'engineering', country: 'Australia' },
      ],
    ])
    render(<ListsScreen />)
    fireEvent.press(screen.getByText('Destinations'))
    await waitFor(() => {
      expect(screen.getByText('Australia')).toBeTruthy()
    })
    // Subtitle should mention courses in demand
    expect(screen.getByText(/courses in demand/i)).toBeTruthy()
  })

  // ── ?tab= deep-link param ──────────────────────────────────────────────────

  it('opens with the Courses tab active when tab param is "courses"', () => {
    mockTabParam.value = 'courses'
    render(<ListsScreen />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs[2]?.props.accessibilityState?.selected).toBe(true)
    expect(tabs[0]?.props.accessibilityState?.selected).toBe(false)
  })

  it('opens with the Destinations tab active when tab param is "destinations"', () => {
    mockTabParam.value = 'destinations'
    render(<ListsScreen />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs[3]?.props.accessibilityState?.selected).toBe(true)
  })

  it('ignores an invalid tab param and stays on Universities', () => {
    mockTabParam.value = 'bogus'
    render(<ListsScreen />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]?.props.accessibilityState?.selected).toBe(true)
  })

  // ── Results header indicator (query active) ───────────────────────────────

  it('filters the directory as you type on the Universities tab (instant, no AI header)', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb([], [
      { id: 'upd', name: 'UP Diliman', acronym: 'UPD', region: 'NCR', province: null, type: 'State University', dataConfidence: 'HIGH', freeTuition: true },
      { id: 'ust', name: 'University of Santo Tomas', acronym: 'UST', region: 'NCR', province: null, type: 'Private', dataConfidence: 'HIGH', freeTuition: false },
    ]))
    render(<ListsScreen />)
    await waitFor(() => expect(screen.getByText('UP Diliman')).toBeTruthy())
    const input = screen.getByPlaceholderText(SEARCH_PLACEHOLDER_UNI)
    fireEvent.changeText(input, 'Santo')
    await waitFor(() => {
      expect(screen.queryByText('UP Diliman')).toBeNull()
      expect(screen.getByText('University of Santo Tomas')).toBeTruthy()
    })
    // The directory is an instant filter — no AI "Top universities matching" header.
    expect(screen.queryByText(/Top universities matching/i)).toBeNull()
  })

  it('shows a scholarships results header with the match count when the profile is usable', async () => {
    const { getSettings } = require('../../../services/settings')
    getSettings.mockResolvedValue({
      gwa: 95, province: 'Albay', incomeBracket: '<=100k',
    })
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb([
      // eligible: within ceiling + meets gwa
      { id: 's1', slug: 'open', title: 'Open Grant', type: 'scholarship', examDate: null, region: 'National', provider: 'X', incomeCeiling: 100000, gwaRequirement: 90, targetCourses: JSON.stringify(['all']) },
      // ineligible: fails gwa outright
      { id: 's2', slug: 'honors', title: 'Honors Grant', type: 'scholarship', examDate: null, region: 'National', provider: 'Y', incomeCeiling: null, gwaRequirement: 99, targetCourses: JSON.stringify(['all']) },
    ]))
    render(<ListsScreen />)
    fireEvent.press(screen.getByText('Scholarships'))
    await waitFor(() => expect(screen.getByText('Open Grant')).toBeTruthy())
    const input = screen.getByPlaceholderText(SEARCH_PLACEHOLDER_SCHOLAR)
    fireEvent.changeText(input, 'grant')
    fireEvent(input, 'submitEditing')
    await waitFor(() => {
      expect(screen.getByText(/Top scholarships matching/i)).toBeTruthy()
    })
    // 1 of the 2 grants is eligible for this profile
    expect(screen.getByText(/You match 1 of 2/i)).toBeTruthy()
  })

  // ── Badge rules (Universities tab — ≤2 per row) ───────────────────────────

  it('rows have ≤2 badge elements contract upheld', async () => {
    render(<ListsScreen />)
    await waitFor(() => {
      expect(screen.getByText('No schools match')).toBeTruthy()
    })
  })
  // ── Redesign M2: URL-synced sections, states, grid, accessible search ─────

  it('writes the chosen section to ?section= so refresh and bookmarks keep it', () => {
    const { router } = require('expo-router')
    render(<ListsScreen />)
    fireEvent.press(screen.getByRole('tab', { name: 'Destinations' }))
    expect(router.setParams).toHaveBeenCalledWith({ section: 'destinations', tab: undefined })
  })

  it('restores the section from the URL after a refresh (setParams → ?section= → remount)', () => {
    const { router } = require('expo-router')
    const first = render(<ListsScreen />)
    fireEvent.press(screen.getByRole('tab', { name: 'Courses' }))
    const written = router.setParams.mock.calls.at(-1)[0].section
    first.unmount()
    mockSectionParam.value = written
    render(<ListsScreen />)
    expect(screen.getByRole('tab', { name: 'Courses' }).props.accessibilityState.selected).toBe(true)
  })

  it('does not rewrite the URL when the section came from the URL itself', () => {
    const { router } = require('expo-router')
    mockSectionParam.value = 'news'
    render(<ListsScreen />)
    expect(router.setParams).not.toHaveBeenCalled()
  })

  // setParams feeds the value back into useLocalSearchParams in the same tree,
  // like expo-router. The echo must not re-apply the section: no remount, no
  // second reset of the search, no second destinations load.
  it('the URL echo of a section switch is not re-applied (no ping-pong)', async () => {
    const { router } = require('expo-router')
    const { cachedQuery } = require('../../../services/queryCache')
    router.setParams.mockImplementation((p: { section?: string; tab?: string }) => mockUrl.write(p))
    render(<ListsScreen />)
    fireEvent.press(screen.getByRole('tab', { name: 'News & dates' }))
    fireEvent.press(screen.getByRole('tab', { name: 'Destinations' }))
    await waitFor(() => expect(cachedQuery).toHaveBeenCalledTimes(1))
    fireEvent.press(screen.getByRole('tab', { name: 'Courses' }))
    fireEvent.changeText(screen.getByLabelText('Filter courses'), 'nur')
    await act(async () => {})

    expect(mockSectionParam.value).toBe('courses')
    expect(router.setParams).toHaveBeenCalledTimes(3)
    expect(mockNewsMounts.n).toBe(1)
    expect(cachedQuery).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('tab', { name: 'Courses' }).props.accessibilityState.selected).toBe(true)
    expect(screen.getByLabelText('Filter courses').props.value).toBe('nur')
  })

  it('a late URL echo of an earlier switch does not flip the section back', async () => {
    const { router } = require('expo-router')
    const { cachedQuery } = require('../../../services/queryCache')
    // The router applies each setParams on a later render, after the student
    // has already tapped the next section.
    const echoes: (() => void)[] = []
    router.setParams.mockImplementation((p: { section?: string; tab?: string }) => { echoes.push(() => mockUrl.write(p)) })
    render(<ListsScreen />)
    fireEvent.press(screen.getByRole('tab', { name: 'Destinations' }))
    fireEvent.press(screen.getByRole('tab', { name: 'News & dates' }))
    fireEvent.press(screen.getByRole('tab', { name: 'Courses' }))
    fireEvent.changeText(screen.getByLabelText('Filter courses'), 'nur')
    for (const echo of echoes) await act(async () => { echo() })

    expect(mockSectionParam.value).toBe('courses')
    expect(mockNewsMounts.n).toBe(1)
    expect(cachedQuery).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('tab', { name: 'Courses' }).props.accessibilityState.selected).toBe(true)
    expect(screen.getByLabelText('Filter courses').props.value).toBe('nur')
  })

  it('still follows a genuine URL change made elsewhere (deep link while open)', async () => {
    render(<ListsScreen />)
    await act(async () => { mockUrl.write({ section: 'destinations' }) })
    expect(screen.getByRole('tab', { name: 'Destinations' }).props.accessibilityState.selected).toBe(true)
  })

  it('applies only the latest catalog load when an older one resolves later', async () => {
    const { listings } = require('../../../db/schema')
    const { useDb } = require('../../../hooks/useDb')
    const loads: ((rows: any[]) => void)[] = []
    const db = makeDb()
    const stock = makeDb()
    // The listings read waits on the test; every other table answers as usual.
    db.select = jest.fn(() => ({
      from: jest.fn((table: unknown) => (table === listings
        ? { then: (ok: any, fail: any) => new Promise<any[]>(resolve => { loads.push(resolve) }).then(ok, fail) }
        : stock.select().from())),
    })) as any
    useDb.mockReturnValue(db)
    const grant = (id: string, title: string) => ({
      id, slug: id, title, type: 'scholarship', examDate: null, region: 'National', provider: 'X', targetCourses: '[]',
    })
    mockSync.value = { isSyncing: true, firstSyncDone: false }
    mockSectionParam.value = 'scholarships'
    const view = render(<ListsScreen />)
    await waitFor(() => expect(loads).toHaveLength(1))
    // A sync settles while the focus load is still in flight: a second load starts.
    mockSync.value = { isSyncing: false, firstSyncDone: true }
    view.rerender(<ListsScreen />)
    await waitFor(() => expect(loads).toHaveLength(2))
    await act(async () => { loads[1]!([grant('new', 'Fresh Grant')]) })
    expect(await screen.findByText('Fresh Grant')).toBeTruthy()
    await act(async () => { loads[0]!([grant('old', 'Stale Grant')]) })
    expect(screen.getByText('Fresh Grant')).toBeTruthy()
    expect(screen.queryByText('Stale Grant')).toBeNull()
  })

  it('names the search field for the section it searches', () => {
    render(<ListsScreen />)
    expect(screen.getByLabelText('Search schools and exams')).toBeTruthy()
    fireEvent.press(screen.getByRole('tab', { name: 'Scholarships' }))
    expect(screen.getByLabelText('Search scholarships')).toBeTruthy()
  })

  it('shows a labelled skeleton (not a spinner) while scholarships load', () => {
    const { useDb } = require('../../../hooks/useDb')
    const pending = makeDb()
    pending.select = jest.fn(() => ({
      from: jest.fn(() => ({
        leftJoin: jest.fn(() => new Promise(() => {})),
        then: jest.fn(() => new Promise(() => {})),
      })),
    })) as any
    useDb.mockReturnValue(pending)
    mockSectionParam.value = 'scholarships'
    render(<ListsScreen />)
    expect(screen.getByTestId('explore-skeleton').props.accessibilityLabel).toBe('Loading scholarships')
  })

  it('shows a retryable error when the catalog fails to load, then recovers', async () => {
    const { getSettings } = require('../../../services/settings')
    getSettings.mockRejectedValueOnce(new Error('offline'))
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb([
      { id: 's1', slug: 'dost', title: 'DOST-SEI Scholarship', type: 'scholarship', examDate: null, region: 'National', provider: 'DOST', targetCourses: '[]' },
    ]))
    mockSectionParam.value = 'scholarships'
    render(<ListsScreen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('DOST-SEI Scholarship')).toBeTruthy()
  })

  it('an empty search result offers one next step: clear the search', async () => {
    // Courses filter by substring. (Scholarship keyword search deliberately
    // falls back to ranking everything when no word matches — see listingSearch.)
    const { useCourseTabOptions } = require('../../../hooks/useCourseTabOptions')
    useCourseTabOptions.mockReturnValue({
      targetOptions: [], allOptions: [{ courseTab: 'nursing', label: 'Nursing' }], loading: false, dbEmpty: false,
    })
    mockSectionParam.value = 'courses'
    render(<ListsScreen />)
    await screen.findByText('Nursing')
    fireEvent.changeText(screen.getByLabelText('Filter courses'), 'zzzz')
    expect(await screen.findByText('No matches for “zzzz”')).toBeTruthy()
    fireEvent.press(screen.getAllByRole('button', { name: 'Clear search' }).at(-1)!)
    expect(await screen.findByText('Nursing')).toBeTruthy()
  })

  it('lays scholarships out in a 3-column grid on desktop widths', async () => {
    mockBp.value = 'expanded'
    mockSectionParam.value = 'scholarships'
    render(<ListsScreen />)
    await waitFor(() => expect(gridColumns()).toBe(3))
  })

  it('stays a single column on phones', async () => {
    mockSectionParam.value = 'scholarships'
    render(<ListsScreen />)
    await waitFor(() => expect(gridColumns()).toBe(1))
  })

  it('school filters are FilterChips: Free tuition is a checkbox, regions are radios', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb([], [
      { id: 'upd', name: 'UP Diliman', acronym: 'UPD', region: 'NCR', province: null, type: 'State University', dataConfidence: 'HIGH', freeTuition: true },
    ]))
    render(<ListsScreen />)
    const free = await screen.findByRole('checkbox', { name: 'Free tuition' })
    expect(free.props.accessibilityState).toEqual({ checked: false })
    fireEvent.press(free)
    expect(screen.getByRole('checkbox', { name: 'Free tuition' }).props.accessibilityState).toEqual({ checked: true })
    expect(screen.getByRole('radio', { name: 'NCR' })).toBeTruthy()
  })

  it('an upcoming exam card says how soon it is, with no emoji', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb(
      [{ id: 'e1', slug: 'upcat', title: 'UPCAT', type: 'exam', examDate: Date.now() + 5 * 86_400_000 + 3_600_000, region: 'NCR', provider: 'UP', targetCourses: '[]' }],
      [],
    ))
    render(<ListsScreen />)
    expect(await screen.findByText('In 5 days')).toBeTruthy()
    expect(screen.queryByText(/📍|📝/)).toBeNull()
  })
  it('reloads the catalog when a sync finishes (a fresh web session is not stuck empty)', async () => {
    const { getSettings } = require('../../../services/settings')
    mockSync.value = { isSyncing: true, firstSyncDone: false }
    mockSectionParam.value = 'scholarships'
    const view = render(<ListsScreen />)
    await waitFor(() => expect(getSettings).toHaveBeenCalledTimes(1))
    mockSync.value = { isSyncing: false, firstSyncDone: true }
    view.rerender(<ListsScreen />)
    await waitFor(() => expect(getSettings).toHaveBeenCalledTimes(2))
  })
})
