import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import HomeScreen from '../index'

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('expo-constants', () => ({
  default: { executionEnvironment: 'bare' },
}))

jest.mock('@lineiconshq/react-native-lineicons', () => ({
  Lineicons: () => null,
}))

jest.mock('@lineiconshq/free-icons', () => ({
  Gear1Outlined: {},
  Bolt2Outlined: {},
  SparkOutlined: {},
  Bell1Outlined: {},
  Bell1Solid: {},
  User4Outlined: {},
}))

// Controlled admissions rows — override per-test via mockAdmissionsRows.value
const mockAdmissionsRows = { value: [] as any[] }

jest.mock('../../../hooks/useDb', () => ({
  useDb: () => ({
    insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) }),
    update: jest.fn().mockReturnValue({ set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }) }),
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockImplementation(() => Promise.resolve(mockAdmissionsRows.value)),
      // support chained .where() used by userSettings check inside reminder handlers
      where: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }),
    }),
  }),
}))

jest.mock('../../../services/notifications', () => ({
  scheduleNoteReminder: jest.fn().mockResolvedValue(undefined),
  cancelNoteReminder: jest.fn().mockResolvedValue(undefined),
}))

// Subject preparedness is SESSION-based (Global Constraints): Home reads per-topic
// best + subject-level mock best from the aggregates. Control them per-test.
const mockTopicBest = { value: [] as Array<{ topicId: string; bestPct: number }> }
const mockSubjectBest = { value: [] as Array<{ subject: string; bestPct: number }> }

jest.mock('../../../services/homeAggregates', () => ({
  getTopicBestSessionPercentages: jest.fn(() => Promise.resolve(mockTopicBest.value)),
  getSubjectSessionPercentages: jest.fn(() => Promise.resolve(mockSubjectBest.value)),
}))

const mockUseHomeStats = jest.fn()

jest.mock('../../../hooks/useHomeStats', () => ({
  useHomeStats: () => mockUseHomeStats(),
}))

const mockUsePracticeData = jest.fn()

jest.mock('../../../hooks/usePracticeData', () => ({
  usePracticeData: () => mockUsePracticeData(),
}))

const mockAddListing = jest.fn().mockResolvedValue(undefined)
jest.mock('../../../hooks/useFocusListings', () => ({
  useFocusListings: () => ({
    focusListings: [],
    addListing: mockAddListing,
    removeListing: jest.fn(),
    moveListing: jest.fn(),
    isInFocus: () => false,
    getPriority: () => null,
    refresh: jest.fn().mockResolvedValue(undefined),
  }),
}))

const mockUseHomeCatalog = jest.fn()
jest.mock('../../../hooks/useHomeCatalog', () => ({
  useHomeCatalog: () => mockUseHomeCatalog(),
}))

jest.mock('../../../hooks/useAnalytics', () => ({
  useAnalytics: () => ({ sessionCount: 0, streak: 0 }),
}))

jest.mock('../../../hooks/useNotifications', () => ({
  useNotifications: () => ({
    enabled: true,
    ready: true,
    schedule: jest.fn(),
    toggle: jest.fn(),
  }),
}))

const emptyPracticeData = {
  subjects: [] as Array<{ id: string; name: string }>,
  topicRows: [] as any[],
  recommendedTopics: [],
  totalCards: 0,
  cardCountByTopic: {},
  topicIdsByListingSlug: {},
  refresh: jest.fn().mockResolvedValue(undefined),
}

const emptyStats = {
  listing: null,
  daysLeft: null,
  todayAccuracy: null,
  streakDays: 0,
  weakTopics: [],
  firstTopicId: null,
  fullName: 'Student',
  importantDayIndices: [],
  practiceDayIndices: [],
  focusedListings: [],
  noteReminders: [],
  listingAccuracy: {},
  refresh: jest.fn().mockResolvedValue(undefined),
}

const emptyCatalog = {
  examListings: [] as Array<{ slug: string; title: string; examDate: number | null }>,
  scholarshipListings: [] as any[],
  blueprintSlugs: [] as string[],
  blueprintInfo: new Map<string, { acronym: string; name: string }>(),
  listingMockBest: new Map<string, number>(),
  profile: {},
  clusters: new Set<string>(),
  region: '',
  loaded: true,
  refresh: jest.fn().mockResolvedValue(undefined),
}

describe('HomeScreen', () => {
  beforeEach(() => {
    mockUseHomeStats.mockReturnValue(emptyStats)
    mockUsePracticeData.mockReturnValue(emptyPracticeData)
    mockUseHomeCatalog.mockReturnValue(emptyCatalog)
    mockAddListing.mockClear()
    mockTopicBest.value = []
    mockSubjectBest.value = []
    mockAdmissionsRows.value = []
    // The session-readiness cache is module-level — reset it so each test sees
    // its own mocked aggregate values (not a previous test's cached maps).
    const { _clearForTests } = require('../../../services/queryCache')
    _clearForTests()
  })

  it('renders the uppercase date line', () => {
    render(<HomeScreen />)
    const expected = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      .format(new Date())
      .toUpperCase()
    expect(screen.getByText(expected)).toBeTruthy()
  })

  it('renders the greeting with the first name in a nested bold Text', () => {
    render(<HomeScreen />)
    expect(screen.getByText(/Good (morning|afternoon|evening), /)).toBeTruthy()
    expect(screen.getByText('Student')).toBeTruthy()
  })

  // ── Kuya hero band is gone (Task 3 supersedes it entirely) ───────────────────
  it('does not render the Kuya Baw hero band', () => {
    render(<HomeScreen />)
    expect(screen.queryByText('Kuya Baw')).toBeNull()
    expect(screen.queryByText('AI Coach')).toBeNull()
    expect(screen.queryByLabelText('Ask Kuya Baw')).toBeNull()
  })

  it('does NOT render the Quick Practice CTA (removed)', () => {
    render(<HomeScreen />)
    expect(screen.queryByText('Quick Practice')).toBeNull()
  })

  it('Your Progress analytics section is NOT present (removed)', () => {
    render(<HomeScreen />)
    expect(screen.queryByText('Your Progress')).toBeNull()
    expect(screen.queryByText('READINESS')).toBeNull()
    expect(screen.queryByText('WEAK AREAS')).toBeNull()
  })

  it('settings tile navigates to /settings when pressed', () => {
    const { router } = require('expo-router')
    jest.clearAllMocks()
    mockUseHomeStats.mockReturnValue(emptyStats)
    mockUsePracticeData.mockReturnValue(emptyPracticeData)
    mockUseHomeCatalog.mockReturnValue(emptyCatalog)
    render(<HomeScreen />)
    fireEvent.press(screen.getByLabelText('Settings'))
    expect(router.push).toHaveBeenCalledWith('/settings')
  })

  it('profile tile navigates to the profile tab when pressed', () => {
    const { router } = require('expo-router')
    jest.clearAllMocks()
    mockUseHomeStats.mockReturnValue(emptyStats)
    mockUsePracticeData.mockReturnValue(emptyPracticeData)
    mockUseHomeCatalog.mockReturnValue(emptyCatalog)
    render(<HomeScreen />)
    fireEvent.press(screen.getByLabelText('Profile'))
    expect(router.push).toHaveBeenCalledWith('/(tabs)/profile')
  })

  // ── Explore ───────────────────────────────────────────────────────────────
  it('renders the Explore section header with its subheadline', () => {
    render(<HomeScreen />)
    expect(screen.getByText('Explore')).toBeTruthy()
    expect(screen.getByText('Search or browse university exams, scholarships & in-demand courses')).toBeTruthy()
  })

  it('renders all four explore quick-link cards', () => {
    render(<HomeScreen />)
    expect(screen.getByText('Universities')).toBeTruthy()
    expect(screen.getByText('Scholarships')).toBeTruthy()
    expect(screen.getByText('Courses')).toBeTruthy()
    expect(screen.getByText('Destinations')).toBeTruthy()
  })

  it('pressing the Universities explore card deep-links to the Universities tab', () => {
    const { router } = require('expo-router')
    jest.clearAllMocks()
    mockUseHomeStats.mockReturnValue(emptyStats)
    mockUsePracticeData.mockReturnValue(emptyPracticeData)
    mockUseHomeCatalog.mockReturnValue(emptyCatalog)
    render(<HomeScreen />)
    fireEvent.press(screen.getByText('Universities'))
    expect(router.push).toHaveBeenCalledWith('/(tabs)/listings?tab=universities')
  })

  it('pressing the Destinations explore card deep-links to the Destinations tab', () => {
    const { router } = require('expo-router')
    jest.clearAllMocks()
    mockUseHomeStats.mockReturnValue(emptyStats)
    mockUsePracticeData.mockReturnValue(emptyPracticeData)
    mockUseHomeCatalog.mockReturnValue(emptyCatalog)
    render(<HomeScreen />)
    fireEvent.press(screen.getByText('Destinations'))
    expect(router.push).toHaveBeenCalledWith('/(tabs)/listings?tab=destinations')
  })

  // ── My Entrance Exams (FocusExamsFold) ───────────────────────────────────────
  describe('My Entrance Exams', () => {
    it('renders the section header with a "See more" action to Lists', () => {
      const { router } = require('expo-router')
      jest.clearAllMocks()
      mockUseHomeStats.mockReturnValue(emptyStats)
      mockUsePracticeData.mockReturnValue(emptyPracticeData)
      mockUseHomeCatalog.mockReturnValue(emptyCatalog)
      render(<HomeScreen />)
      expect(screen.getByText('My Entrance Exams')).toBeTruthy()
      fireEvent.press(screen.getByText('See more'))
      expect(router.push).toHaveBeenCalledWith('/(tabs)/listings')
    })

    it('suggests the default exams (with "+ Add") when nothing is focused', () => {
      mockUseHomeCatalog.mockReturnValue({
        ...emptyCatalog,
        examListings: [
          { slug: 'upcat', title: 'UPCAT', examDate: null },
          { slug: 'acet', title: 'ACET', examDate: null },
          { slug: 'dcat-dlsu', title: 'DCAT', examDate: null },
        ],
      })
      render(<HomeScreen />)
      expect(screen.getAllByText('+ Add')).toHaveLength(3)
      expect(screen.getByLabelText('UPCAT')).toBeTruthy()
      expect(screen.getByLabelText('ACET')).toBeTruthy()
      expect(screen.getByLabelText('DCAT')).toBeTruthy()
      // 6 slots − 3 focused/suggested = 3 blanks
      expect(screen.getAllByLabelText('Add an exam')).toHaveLength(3)
    })

    it('adds a suggested exam to Focus when its tile is tapped (does not navigate)', () => {
      const { router } = require('expo-router')
      jest.clearAllMocks()
      mockUseHomeStats.mockReturnValue(emptyStats)
      mockUsePracticeData.mockReturnValue(emptyPracticeData)
      mockUseHomeCatalog.mockReturnValue({
        ...emptyCatalog,
        examListings: [{ slug: 'upcat', title: 'UPCAT', examDate: null }],
      })
      render(<HomeScreen />)
      fireEvent.press(screen.getByLabelText('UPCAT'))
      expect(mockAddListing).toHaveBeenCalledWith('upcat')
      expect(router.push).not.toHaveBeenCalled()
    })

    it('a focused exam tile with no score yet navigates to the diagnostic', () => {
      const { router } = require('expo-router')
      jest.clearAllMocks()
      mockUseHomeStats.mockReturnValue({
        ...emptyStats,
        focusedListings: [{ slug: 'upcat', priority: 1, title: 'UPCAT 2026', type: 'exam', examDate: null, deadline: null }],
      })
      mockUsePracticeData.mockReturnValue(emptyPracticeData)
      mockUseHomeCatalog.mockReturnValue(emptyCatalog)
      render(<HomeScreen />)
      fireEvent.press(screen.getByLabelText('UPCAT 2026'))
      expect(router.push).toHaveBeenCalledWith('/practice/diagnostic')
    })

    it('a focused exam tile with a mock-best score navigates to practice/start/:slug', () => {
      const { router } = require('expo-router')
      jest.clearAllMocks()
      mockUseHomeStats.mockReturnValue({
        ...emptyStats,
        focusedListings: [{ slug: 'upcat', priority: 1, title: 'UPCAT 2026', type: 'exam', examDate: null, deadline: null }],
      })
      mockUsePracticeData.mockReturnValue(emptyPracticeData)
      mockUseHomeCatalog.mockReturnValue({
        ...emptyCatalog,
        listingMockBest: new Map([['upcat', 72]]),
      })
      render(<HomeScreen />)
      expect(screen.getByText('72%')).toBeTruthy()
      fireEvent.press(screen.getByLabelText('UPCAT 2026'))
      expect(router.push).toHaveBeenCalledWith('/practice/start/upcat')
    })

    it('a scoreless ACET tile (non-UPCAT, has its own published blueprint) routes to practice/start/acet, not the UPCAT diagnostic', () => {
      const { router } = require('expo-router')
      jest.clearAllMocks()
      mockUseHomeStats.mockReturnValue({
        ...emptyStats,
        focusedListings: [{ slug: 'acet', priority: 1, title: 'ACET 2026', type: 'exam', examDate: null, deadline: null }],
      })
      mockUsePracticeData.mockReturnValue(emptyPracticeData)
      mockUseHomeCatalog.mockReturnValue({
        ...emptyCatalog,
        blueprintSlugs: ['upcat', 'acet', 'ustet'],
      })
      render(<HomeScreen />)
      fireEvent.press(screen.getByLabelText('ACET 2026'))
      expect(router.push).toHaveBeenCalledWith('/practice/start/acet')
    })

    it('a scoreless exam tile with no published blueprint still routes to the diagnostic', () => {
      const { router } = require('expo-router')
      jest.clearAllMocks()
      mockUseHomeStats.mockReturnValue({
        ...emptyStats,
        focusedListings: [{ slug: 'random-exam', priority: 1, title: 'Random Exam', type: 'exam', examDate: null, deadline: null }],
      })
      mockUsePracticeData.mockReturnValue(emptyPracticeData)
      mockUseHomeCatalog.mockReturnValue({
        ...emptyCatalog,
        blueprintSlugs: ['upcat', 'acet', 'ustet'],
      })
      render(<HomeScreen />)
      fireEvent.press(screen.getByLabelText('Random Exam'))
      expect(router.push).toHaveBeenCalledWith('/practice/diagnostic')
    })

    it('shows "—" for a focused exam with no readiness data', () => {
      mockUseHomeStats.mockReturnValue({
        ...emptyStats,
        focusedListings: [{ slug: 'upcat', priority: 1, title: 'UPCAT 2026', type: 'exam', examDate: null, deadline: null }],
      })
      render(<HomeScreen />)
      // 1 focused (upcat) + 2 suggested defaults to fill the fold to 3 — none have
      // readiness data yet, so all three tiles show the "—" badge.
      expect(screen.getAllByText('—')).toHaveLength(3)
    })

    it('excludes school-level focus entries from the exam tiles', () => {
      mockUseHomeStats.mockReturnValue({
        ...emptyStats,
        focusedListings: [{ slug: 'school:abc123', priority: 1, title: 'Some School', type: 'school', examDate: null, deadline: null }],
      })
      render(<HomeScreen />)
      expect(screen.queryByLabelText('Some School')).toBeNull()
    })

    it('opens the exam picker when a blank tile is tapped, and adds + closes on selection', () => {
      mockUseHomeCatalog.mockReturnValue({
        ...emptyCatalog,
        examListings: [{ slug: 'ustet', title: 'USTET', examDate: null }],
      })
      render(<HomeScreen />)
      fireEvent.press(screen.getAllByLabelText('Add an exam')[0]!)
      expect(screen.getByLabelText('Add USTET to Focus')).toBeTruthy()
      fireEvent.press(screen.getByLabelText('Add USTET to Focus'))
      expect(mockAddListing).toHaveBeenCalledWith('ustet')
    })
  })

  // ── Subject preparedness ──────────────────────────────────────────────────
  describe('Subject preparedness', () => {
    it('renders the section header', () => {
      render(<HomeScreen />)
      expect(screen.getByText('Subject preparedness')).toBeTruthy()
    })

    it('shows an InfoBanner empty state with a Practice CTA when there are no subjects', () => {
      const { router } = require('expo-router')
      jest.clearAllMocks()
      mockUseHomeStats.mockReturnValue(emptyStats)
      mockUsePracticeData.mockReturnValue(emptyPracticeData)
      mockUseHomeCatalog.mockReturnValue(emptyCatalog)
      render(<HomeScreen />)
      expect(screen.getByText(/Practice a subject to see your preparedness/)).toBeTruthy()
      fireEvent.press(screen.getByText('Practice'))
      expect(router.push).toHaveBeenCalledWith('/(tabs)/practice')
    })

    it('renders a subject card with its readiness % and a "Take exam" CTA', async () => {
      mockUsePracticeData.mockReturnValue({
        ...emptyPracticeData,
        subjects: [{ id: 's-math', name: 'Math' }],
        topicRows: [{ topic: { id: 't1', name: 'Algebra', subjectId: 's-math' }, accuracy: null }],
      })
      mockTopicBest.value = [{ topicId: 't1', bestPct: 80 }]
      render(<HomeScreen />)
      expect(screen.getByText('Math')).toBeTruthy()
      expect(await screen.findByText('80%')).toBeTruthy()
      expect(screen.getByText('Take exam ›')).toBeTruthy()
    })

    it('shows 0% (not a flashcard-accuracy fallback) when a subject has no session data', () => {
      mockUsePracticeData.mockReturnValue({
        ...emptyPracticeData,
        subjects: [{ id: 's-math', name: 'Math' }],
        topicRows: [{ topic: { id: 't1', name: 'Algebra', subjectId: 's-math' }, accuracy: 40 }],
      })
      render(<HomeScreen />)
      expect(screen.getByText('0%')).toBeTruthy()
    })

    it('pressing a subject card navigates to the diagnostic scoped to that subject', () => {
      const { router } = require('expo-router')
      jest.clearAllMocks()
      mockUseHomeStats.mockReturnValue(emptyStats)
      mockUseHomeCatalog.mockReturnValue(emptyCatalog)
      mockUsePracticeData.mockReturnValue({
        ...emptyPracticeData,
        subjects: [{ id: 's-math', name: 'Math' }],
        topicRows: [{ topic: { id: 't1', name: 'Algebra', subjectId: 's-math' }, accuracy: null }],
      })
      render(<HomeScreen />)
      fireEvent.press(screen.getByLabelText('Math'))
      expect(router.push).toHaveBeenCalledWith('/practice/diagnostic?subject=Math')
    })
  })

  // ── Recommended Scholarships ──────────────────────────────────────────────
  describe('Recommended Scholarships', () => {
    it('renders the section header with a "See all" action to the scholarships tab', () => {
      const { router } = require('expo-router')
      jest.clearAllMocks()
      mockUseHomeStats.mockReturnValue(emptyStats)
      mockUsePracticeData.mockReturnValue(emptyPracticeData)
      mockUseHomeCatalog.mockReturnValue(emptyCatalog)
      render(<HomeScreen />)
      expect(screen.getByText('Recommended Scholarships')).toBeTruthy()
      // RecommendedScholarships renders before NewsAndDates, so its "See all" is first.
      const seeAlls = screen.getAllByText('See all')
      fireEvent.press(seeAlls[0]!)
      expect(router.push).toHaveBeenCalledWith('/(tabs)/listings?tab=scholarships')
    })

    it('shows an InfoBanner empty state when there are no open/upcoming scholarships', () => {
      render(<HomeScreen />)
      expect(screen.getByText(/Complete your profile/)).toBeTruthy()
    })

    it('renders a scholarship card with title, provider/grant, and a match pill', () => {
      mockUseHomeCatalog.mockReturnValue({
        ...emptyCatalog,
        scholarshipListings: [{
          id: 'sch-1', slug: 'dost-sei', title: 'DOST-SEI Scholarship', type: 'scholarship', status: 'active',
          provider: 'DOST', grantAmount: 'Full tuition + stipend', deadline: null,
          isVerified: true, incomeCeiling: null, gwaRequirement: null, serviceObligationYears: null,
          province: null, city: null, scope: 'national', scholarshipMeta: '{}', targetCourses: ['all'],
        }],
      })
      render(<HomeScreen />)
      expect(screen.getByText('DOST-SEI Scholarship')).toBeTruthy()
      expect(screen.getByText('DOST · Full tuition + stipend')).toBeTruthy()
    })

    it('shows a monthly stipend when grantAmount is blank but monthlyStipend is set', () => {
      mockUseHomeCatalog.mockReturnValue({
        ...emptyCatalog,
        scholarshipListings: [{
          id: 'sch-2', slug: 'sm-foundation', title: 'SM Foundation Scholarship', type: 'scholarship', status: 'active',
          provider: 'SM Foundation', grantAmount: '', monthlyStipend: 5000, deadline: null,
          isVerified: true, incomeCeiling: null, gwaRequirement: null, serviceObligationYears: null,
          province: null, city: null, scope: 'national', scholarshipMeta: '{}', targetCourses: ['all'],
        }],
      })
      render(<HomeScreen />)
      expect(screen.getByText('SM Foundation · ₱5,000/mo stipend')).toBeTruthy()
    })

    it('excludes closed scholarships', () => {
      mockUseHomeCatalog.mockReturnValue({
        ...emptyCatalog,
        scholarshipListings: [{
          id: 'sch-closed', slug: 'closed-sch', title: 'Closed Scholarship', type: 'scholarship', status: 'closed',
          provider: 'Someone', grantAmount: '', deadline: null,
          isVerified: true, incomeCeiling: null, gwaRequirement: null, serviceObligationYears: null,
          province: null, city: null, scope: 'national', scholarshipMeta: '{}', targetCourses: ['all'],
        }],
      })
      render(<HomeScreen />)
      expect(screen.queryByText('Closed Scholarship')).toBeNull()
    })

    // Regression: the old "My Focus" section used to guarantee a focused
    // scholarship always showed on Home. Now that it's gone, a focused
    // scholarship must still surface here even if it doesn't rank in the top 6.
    it('still shows a focused scholarship even when it would rank outside the top 6', () => {
      const makeRow = (i: number) => ({
        id: `sch-${i}`, slug: `sch-${i}`, title: `Scholarship ${i}`, type: 'scholarship', status: 'active',
        provider: 'Provider', grantAmount: '', deadline: null,
        isVerified: true, incomeCeiling: null, gwaRequirement: null, serviceObligationYears: null,
        province: null, city: null, scope: 'national', scholarshipMeta: '{}', targetCourses: ['all'],
      })
      mockUseHomeCatalog.mockReturnValue({
        ...emptyCatalog,
        // 7 equally-ranked scholarships — index 6 ("Scholarship 6") would be
        // sliced off by the default limit-6 cap without focus-pinning.
        scholarshipListings: Array.from({ length: 7 }, (_, i) => makeRow(i)),
      })
      mockUseHomeStats.mockReturnValue({
        ...emptyStats,
        focusedListings: [{ slug: 'sch-6', priority: 1, title: 'Scholarship 6', type: 'scholarship', examDate: null, deadline: null }],
      })
      render(<HomeScreen />)
      expect(screen.getByText('Scholarship 6')).toBeTruthy()
    })
  })

  // ── News & Dates (merged) ─────────────────────────────────────────────────
  describe('News & Dates', () => {
    it('renders the merged section header (old separate sections are gone)', () => {
      render(<HomeScreen />)
      expect(screen.getByText('News & Dates')).toBeTruthy()
      expect(screen.queryByText('Upcoming Dates')).toBeNull()
      expect(screen.queryByText('News & Events')).toBeNull()
    })

    it('shows an empty-state InfoBanner when there is nothing to show', () => {
      render(<HomeScreen />)
      expect(screen.getByText(/Add exams or scholarships to your focus/)).toBeTruthy()
    })

    it('shows a focused listing exam date', () => {
      const futureDate = Date.now() + 10 * 86_400_000
      mockUseHomeStats.mockReturnValue({
        ...emptyStats,
        focusedListings: [{ slug: 'upcat-2026', priority: 1, title: 'UPCAT 2026', type: 'exam', examDate: futureDate, deadline: null }],
      })
      render(<HomeScreen />)
      expect(screen.getAllByText('UPCAT 2026').length).toBeGreaterThanOrEqual(1)
    })

    it('folds an admission event into the merged feed', async () => {
      const futureDate = new Date(Date.now() + 30 * 86_400_000)
      const isoDate = futureDate.toISOString().slice(0, 10)
      mockAdmissionsRows.value = [{
        id: 'au-dost-deadline',
        reportDate: '2026-06-01',
        severity: 'important',
        schoolSlug: null,
        schoolName: 'DOST',
        title: 'DOST SEI Application Deadline',
        body: 'Last day to apply.',
        actionRequired: null,
        eventDate: isoDate,
        eventType: 'deadline',
        sources: '[]',
        verified: false,
        remoteUpdatedAt: null,
      }]
      render(<HomeScreen />)
      const items = await waitFor(() => screen.getAllByText('DOST SEI Application Deadline'))
      expect(items.length).toBeGreaterThan(0)
    })

    it('"See all" navigates to the Updates tab', () => {
      const { router } = require('expo-router')
      jest.clearAllMocks()
      mockUseHomeStats.mockReturnValue(emptyStats)
      mockUsePracticeData.mockReturnValue(emptyPracticeData)
      mockUseHomeCatalog.mockReturnValue(emptyCatalog)
      render(<HomeScreen />)
      // NewsAndDates renders after RecommendedScholarships, so its "See all" is last.
      const seeAlls = screen.getAllByText('See all')
      fireEvent.press(seeAlls[seeAlls.length - 1]!)
      expect(router.push).toHaveBeenCalledWith('/(tabs)/updates')
    })
  })

  // ── Section order: FocusExamsFold → Subject preparedness → Explore → Scholarships → News&Dates ──
  it('renders the sections in the brief-specified order', () => {
    render(<HomeScreen />)
    const texts: string[] = []
    const walk = (node: any): void => {
      if (node == null) return
      if (typeof node === 'string') { texts.push(node); return }
      if (Array.isArray(node)) { node.forEach(walk); return }
      if (node.children) walk(node.children)
    }
    walk(screen.toJSON())
    const idx = (label: string) => texts.indexOf(label)
    expect(idx('My Entrance Exams')).toBeGreaterThanOrEqual(0)
    expect(idx('Subject preparedness')).toBeGreaterThan(idx('My Entrance Exams'))
    expect(idx('Explore')).toBeGreaterThan(idx('Subject preparedness'))
    expect(idx('Recommended Scholarships')).toBeGreaterThan(idx('Explore'))
    expect(idx('News & Dates')).toBeGreaterThan(idx('Recommended Scholarships'))
  })
})
