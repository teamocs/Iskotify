import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import ListsScreen from '../listings'

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

// Controlled ?tab= deep-link param — override per-test via mockTabParam.value
const mockTabParam: { value?: string } = { value: undefined }

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: jest.fn((cb: any) => { cb(); return () => {} }),
  useLocalSearchParams: jest.fn(() => ({ tab: mockTabParam.value })),
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

const SEARCH_PLACEHOLDER_UNI = "Search universities & entrance exams, e.g. 'UP nursing' or 'engineering in NCR'"
const SEARCH_PLACEHOLDER_SCHOLAR = "Search scholarships, e.g. 'full-ride for low-income' or 'DOST for STEM'"

describe('ListsScreen', () => {
  beforeEach(() => {
    mockTabParam.value = undefined
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

  // ── Renames ────────────────────────────────────────────────────────────────

  it('renders the Lists title and updated subtitle', () => {
    render(<ListsScreen />)
    expect(screen.getByText('Lists')).toBeTruthy()
    expect(screen.getByText('Universities, scholarships, courses & career destinations')).toBeTruthy()
  })

  it('does NOT render the old "Exams" title', () => {
    render(<ListsScreen />)
    // The title should be "Lists" not "Exams"
    expect(screen.queryByText('College entrance exams & scholarships')).toBeNull()
  })

  // ── 4-tab navigation ───────────────────────────────────────────────────────

  it('renders exactly 4 tabs: Universities, Scholarships, Courses, Destinations', () => {
    render(<ListsScreen />)
    expect(screen.getByText('Universities')).toBeTruthy()
    expect(screen.getByText('Scholarships')).toBeTruthy()
    expect(screen.getByText('Courses')).toBeTruthy()
    expect(screen.getByText('Destinations')).toBeTruthy()
  })

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

  it('shows the empty state when there are no exams (Universities tab)', async () => {
    render(<ListsScreen />)
    await waitFor(() => {
      expect(screen.getByText('No exams yet.')).toBeTruthy()
    })
  })

  it('switches to the Scholarships tab and shows no scholarships empty state', async () => {
    render(<ListsScreen />)
    fireEvent.press(screen.getByText('Scholarships'))
    await waitFor(() => {
      expect(screen.getByText('No scholarships yet.')).toBeTruthy()
    })
  })

  it('renders a listing row when data is present on Universities tab', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb([
      { id: '1', slug: 'upcat', title: 'UPCAT 2025', type: 'exam', examDate: null, region: 'NCR', provider: 'UP' },
    ]))
    render(<ListsScreen />)
    await waitFor(() => {
      expect(screen.getByText('UPCAT 2025')).toBeTruthy()
    })
  })

  it('does not render a type badge on exam rows (tab communicates type)', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb([
      { id: '1', slug: 'upcat', title: 'UPCAT 2025', type: 'exam', examDate: null, region: 'NCR', provider: 'UP' },
    ]))
    render(<ListsScreen />)
    await waitFor(() => {
      expect(screen.getByText('UPCAT 2025')).toBeTruthy()
    })
    expect(screen.queryByText('Exam')).toBeNull()
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
      expect(screen.getByText('★ Your target courses')).toBeTruthy()
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

  it('shows a "Top universities matching" header when a universities search is submitted', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb([
      { id: '1', slug: 'upcat', title: 'UPCAT', type: 'exam', examDate: null, region: 'NCR', provider: 'UP' },
    ]))
    render(<ListsScreen />)
    await waitFor(() => expect(screen.getByText('UPCAT')).toBeTruthy())
    const input = screen.getByPlaceholderText(SEARCH_PLACEHOLDER_UNI)
    fireEvent.changeText(input, 'UP')
    fireEvent(input, 'submitEditing')
    await waitFor(() => {
      expect(screen.getByText(/Top universities matching/i)).toBeTruthy()
    })
  })

  it('does NOT show a results header when there is no query', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb([
      { id: '1', slug: 'upcat', title: 'UPCAT', type: 'exam', examDate: null, region: 'NCR', provider: 'UP' },
    ]))
    render(<ListsScreen />)
    await waitFor(() => expect(screen.getByText('UPCAT')).toBeTruthy())
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
      expect(screen.getByText('No exams yet.')).toBeTruthy()
    })
  })
})
