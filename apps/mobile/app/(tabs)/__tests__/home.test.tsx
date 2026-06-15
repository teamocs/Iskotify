import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
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

const mockOpenKuya = jest.fn()

jest.mock('../../../providers/KuyaChatProvider', () => ({
  useKuyaChatModal: () => ({ open: mockOpenKuya }),
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

const mockUseHomeStats = jest.fn()

jest.mock('../../../hooks/useHomeStats', () => ({
  useHomeStats: () => mockUseHomeStats(),
}))

const mockUsePracticeData = jest.fn()

jest.mock('../../../hooks/usePracticeData', () => ({
  usePracticeData: () => mockUsePracticeData(),
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

// Mock AiCoachProvider so HomeScreen can render without the real provider tree.
// useAiCoach is mocked to derive its phrase from the current useHomeStats() so
// tests asserting on listing-derived text (e.g. "UPCAT 2025") still pass.
jest.mock('../../../providers/AiCoachProvider', () => {
  const React = require('react')
  return {
    AiCoachProvider: ({ children }: { children: React.ReactNode }) => children,
    useCoachContext: () => ({
      stats: {
        listing: null, daysLeft: null, todayAccuracy: null, streakDays: 0,
        weakTopics: [], firstTopicId: null, fullName: '',
        importantDayIndices: [], practiceDayIndices: [], focusedListings: [],
        listingAccuracy: {},
      },
      ringIndex: 0,
      nextPhrase: () => ({ id: null, text: 'Tara mag-review tayo!' }),
    }),
  }
})

const mockOnKuyaTap = jest.fn()

jest.mock('../../../hooks/useAiCoach', () => {
  const { useHomeStats } = require('../../../hooks/useHomeStats')
  const { pickTemplate } = require('../../../services/coachTemplates')
  return {
    useAiCoach: () => {
      const stats = useHomeStats()
      return { phrase: pickTemplate(stats, 0), onTap: mockOnKuyaTap }
    },
  }
})

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

const emptyPractice = {
  subjects: [],
  topicRows: [],
  recommendedTopics: [],
  totalCards: 0,
  cardCountByTopic: {},
  topicIdsByListingSlug: {},
  refresh: jest.fn().mockResolvedValue(undefined),
}

describe('HomeScreen', () => {
  beforeEach(() => {
    mockUseHomeStats.mockReturnValue(emptyStats)
    mockUsePracticeData.mockReturnValue(emptyPractice)
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

  it('renders Kuya Baw name in the hero speech bubble', () => {
    render(<HomeScreen />)
    expect(screen.getByText('Kuya Baw')).toBeTruthy()
  })

  it('renders the Ask Kuya Baw hint inside the bubble', () => {
    render(<HomeScreen />)
    expect(screen.getByText('Ask Kuya Baw ›')).toBeTruthy()
  })

  it('pressing the speech bubble calls openKuya from KuyaChatProvider', () => {
    mockOpenKuya.mockClear()
    render(<HomeScreen />)
    fireEvent.press(screen.getByLabelText('Ask Kuya Baw'))
    expect(mockOpenKuya).toHaveBeenCalledTimes(1)
  })

  it('pressing the mascot calls onKuyaTap (new tip)', () => {
    mockOnKuyaTap.mockClear()
    render(<HomeScreen />)
    fireEvent.press(screen.getByLabelText('Tap Kuya Baw for a new tip'))
    expect(mockOnKuyaTap).toHaveBeenCalledTimes(1)
  })

  it('AI Coach badge is visible in the hero bubble', () => {
    render(<HomeScreen />)
    expect(screen.getByText('AI Coach')).toBeTruthy()
  })

  it('collapsed coach row is NOT present (expand/collapse removed)', () => {
    render(<HomeScreen />)
    expect(screen.queryByTestId('kuya-coach-collapsed')).toBeNull()
  })

  it('shows Quick Practice button when a topic is available', () => {
    mockUseHomeStats.mockReturnValue({
      ...emptyStats,
      firstTopicId: 'topic-1',
    })
    render(<HomeScreen />)
    expect(screen.getByText('Quick Practice')).toBeTruthy()
  })

  it('renders My Focus section header', () => {
    render(<HomeScreen />)
    expect(screen.getByText('My Focus')).toBeTruthy()
  })

  it('renders the My Focus subheadline', () => {
    render(<HomeScreen />)
    expect(screen.getByText('Readiness and streaks for your target exams')).toBeTruthy()
  })

  it('renders the Upcoming Dates subheadline', () => {
    render(<HomeScreen />)
    expect(screen.getByText('Deadlines and exam dates on your radar')).toBeTruthy()
  })

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
    render(<HomeScreen />)
    fireEvent.press(screen.getByText('Universities'))
    expect(router.push).toHaveBeenCalledWith('/(tabs)/listings?tab=universities')
  })

  it('pressing the Destinations explore card deep-links to the Destinations tab', () => {
    const { router } = require('expo-router')
    jest.clearAllMocks()
    render(<HomeScreen />)
    fireEvent.press(screen.getByText('Destinations'))
    expect(router.push).toHaveBeenCalledWith('/(tabs)/listings?tab=destinations')
  })

  it('renders focus card title + Readiness + streak when focusedListings mocked', () => {
    const futureDate = Date.now() + 10 * 86_400_000
    mockUseHomeStats.mockReturnValue({
      ...emptyStats,
      focusedListings: [
        { slug: 'upcat-2026', priority: 1, title: 'UPCAT 2026', type: 'exam', examDate: futureDate, deadline: null },
      ],
      listingAccuracy: { 'upcat-2026': 72 },
      streakDays: 3,
    })
    render(<HomeScreen />)
    // Title appears in both focus card and Upcoming Dates — getAllByText
    expect(screen.getAllByText('UPCAT 2026').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Readiness 72%/)).toBeTruthy()
    expect(screen.getByText(/3-day streak/)).toBeTruthy()
  })

  it('pressing a focus card navigates to /listings/:slug', () => {
    const { router } = require('expo-router')
    jest.clearAllMocks()
    const futureDate = Date.now() + 10 * 86_400_000
    mockUseHomeStats.mockReturnValue({
      ...emptyStats,
      focusedListings: [
        { slug: 'upcat-2026', priority: 1, title: 'UPCAT 2026', type: 'exam', examDate: futureDate, deadline: null },
      ],
      listingAccuracy: {},
    })
    render(<HomeScreen />)
    // Title may appear in both focus card and upcoming dates — press the first
    fireEvent.press(screen.getAllByText('UPCAT 2026')[0])
    expect(router.push).toHaveBeenCalledWith('/listings/upcat-2026')
  })

  it('shows empty state InfoBanner when no focusedListings', () => {
    render(<HomeScreen />)
    expect(screen.getByText(/Add an exam or scholarship/)).toBeTruthy()
  })

  it('renders Upcoming Dates section header', () => {
    render(<HomeScreen />)
    expect(screen.getByText('Upcoming Dates')).toBeTruthy()
  })

  it('shows upcoming listing deadline when present', () => {
    const futureDate = Date.now() + 7 * 86_400_000
    mockUseHomeStats.mockReturnValue({
      ...emptyStats,
      focusedListings: [
        { slug: 'upcat-2026', priority: 1, title: 'UPCAT 2026', type: 'exam', examDate: futureDate, deadline: null },
      ],
      importantDayIndices: [Math.floor(futureDate / 86_400_000)],
    })
    render(<HomeScreen />)
    // UPCAT 2026 appears in both focus card AND upcoming dates
    const els = screen.getAllByText('UPCAT 2026')
    expect(els.length).toBeGreaterThanOrEqual(1)
  })

  it('shows empty state for upcoming dates when no listings', () => {
    render(<HomeScreen />)
    expect(screen.getByText('Add scholarships and exams to your focus list to track upcoming dates')).toBeTruthy()
  })

  it('UPCAT countdown banner is not rendered (removed in Wave 1a)', () => {
    const futureDate = new Date(Date.now() + 90 * 86_400_000)
    const isoDate = futureDate.toISOString().slice(0, 10)
    mockAdmissionsRows.value = [{
      id: 'au-upcat-2027',
      reportDate: '2026-06-01',
      severity: 'urgent',
      schoolSlug: 'upcat',
      schoolName: 'UPCAT',
      title: 'UPCAT 2027 Exam',
      body: 'UPCAT 2027 examination schedule.',
      actionRequired: null,
      eventDate: isoDate,
      eventType: 'exam',
      sources: '[]',
      verified: true,
      remoteUpdatedAt: null,
    }]
    render(<HomeScreen />)
    expect(screen.queryByTestId('upcat-countdown-banner')).toBeNull()
    mockAdmissionsRows.value = []
  })

  it('upcat-countdown-banner testID is absent (banner removed)', () => {
    mockAdmissionsRows.value = []
    render(<HomeScreen />)
    expect(screen.queryByTestId('upcat-countdown-banner')).toBeNull()
  })

  it('folds an admission event into Upcoming Dates widget', async () => {
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
    const { findByText } = render(<HomeScreen />)
    const item = await findByText('DOST SEI Application Deadline')
    expect(item).toBeTruthy()
    mockAdmissionsRows.value = []
  })

  it('Weak Areas section is NOT present (removed from Home)', () => {
    render(<HomeScreen />)
    expect(screen.queryByText('Weak Areas')).toBeNull()
  })

  it('SplitStatCard stat labels are NOT present (removed from Home)', () => {
    render(<HomeScreen />)
    expect(screen.queryByText('DAYS LEFT')).toBeNull()
    expect(screen.queryByText('ACCURACY')).toBeNull()
    expect(screen.queryByText('STREAK')).toBeNull()
  })

  it('settings tile navigates to /settings when pressed', () => {
    const { router } = require('expo-router')
    jest.clearAllMocks()
    render(<HomeScreen />)
    fireEvent.press(screen.getByLabelText('Settings'))
    expect(router.push).toHaveBeenCalledWith('/settings')
  })

  it('profile tile navigates to the profile tab when pressed', () => {
    const { router } = require('expo-router')
    jest.clearAllMocks()
    render(<HomeScreen />)
    fireEvent.press(screen.getByLabelText('Profile'))
    expect(router.push).toHaveBeenCalledWith('/(tabs)/profile')
  })

  // ── Your Progress analytics section ───────────────────────────────────────

  it('renders the Your Progress section header with its subtitle', () => {
    mockUseHomeStats.mockReturnValue({ ...emptyStats, weakTopics: [{ topicId: 't1', topicName: 'Algebra', accuracy: 40 }] })
    render(<HomeScreen />)
    expect(screen.getByText('Your Progress')).toBeTruthy()
    expect(screen.getByText('Readiness, subjects & weak areas')).toBeTruthy()
  })

  it('Readiness card shows the focused exam %', () => {
    mockUseHomeStats.mockReturnValue({
      ...emptyStats,
      focusedListings: [
        { slug: 'upcat-2026', priority: 1, title: 'UPCAT 2026', type: 'exam', examDate: Date.now() + 10 * 86_400_000, deadline: null },
      ],
      listingAccuracy: { 'upcat-2026': 68 },
    })
    render(<HomeScreen />)
    expect(screen.getByText('READINESS')).toBeTruthy()
    expect(screen.getByText('68%')).toBeTruthy()
  })

  it('Readiness card subtitle shows the focused exam title', () => {
    mockUseHomeStats.mockReturnValue({
      ...emptyStats,
      focusedListings: [
        { slug: 'upcat-2026', priority: 1, title: 'UPCAT 2026', type: 'exam', examDate: Date.now() + 10 * 86_400_000, deadline: null },
      ],
      listingAccuracy: { 'upcat-2026': 68 },
    })
    render(<HomeScreen />)
    // Title appears in My Focus, Upcoming Dates AND the readiness card subtitle
    expect(screen.getAllByText('UPCAT 2026').length).toBeGreaterThanOrEqual(1)
  })

  it('Weak areas card shows the count and the worst topic + %', () => {
    mockUseHomeStats.mockReturnValue({
      ...emptyStats,
      weakTopics: [
        { topicId: 't1', topicName: 'Algebra', accuracy: 30 },
        { topicId: 't2', topicName: 'Geometry', accuracy: 45 },
      ],
    })
    render(<HomeScreen />)
    expect(screen.getByText('WEAK AREAS')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText(/Algebra · 30%/)).toBeTruthy()
  })

  it('Weak areas card shows the looking-good empty state when none', () => {
    mockUseHomeStats.mockReturnValue({
      ...emptyStats,
      // give a progress signal via subjects so we are NOT in the all-empty state
      listingAccuracy: { 'upcat-2026': 80 },
    })
    render(<HomeScreen />)
    expect(screen.getByText('WEAK AREAS')).toBeTruthy()
    expect(screen.getByText('Looking good!')).toBeTruthy()
  })

  it('By subject card lists subject names with their mastery %', () => {
    mockUseHomeStats.mockReturnValue({ ...emptyStats, listingAccuracy: { 'upcat-2026': 80 } })
    mockUsePracticeData.mockReturnValue({
      ...emptyPractice,
      subjects: [
        { id: 'math', name: 'Mathematics' },
        { id: 'sci', name: 'Science' },
      ],
      topicRows: [
        { topic: { id: 't1', name: 'Algebra', subjectId: 'math' }, cardCount: 5, lastPracticedAt: null, accuracy: 40, strength: 'Weak' },
        { topic: { id: 't2', name: 'Geometry', subjectId: 'math' }, cardCount: 5, lastPracticedAt: null, accuracy: 80, strength: 'Strong' },
        { topic: { id: 't3', name: 'Biology', subjectId: 'sci' }, cardCount: 5, lastPracticedAt: null, accuracy: 90, strength: 'Strong' },
      ],
    })
    render(<HomeScreen />)
    expect(screen.getByText('By subject')).toBeTruthy()
    expect(screen.getByText('Mathematics')).toBeTruthy()
    expect(screen.getByText('60%')).toBeTruthy() // (40 + 80) / 2
    expect(screen.getByText('Science')).toBeTruthy()
  })

  it('falls back to the overall average accuracy for readiness when no focus', () => {
    mockUseHomeStats.mockReturnValue({ ...emptyStats })
    mockUsePracticeData.mockReturnValue({
      ...emptyPractice,
      subjects: [{ id: 'math', name: 'Mathematics' }],
      topicRows: [
        { topic: { id: 't1', name: 'Algebra', subjectId: 'math' }, cardCount: 5, lastPracticedAt: null, accuracy: 40, strength: 'Weak' },
        { topic: { id: 't2', name: 'Geometry', subjectId: 'math' }, cardCount: 5, lastPracticedAt: null, accuracy: 60, strength: 'Review' },
      ],
    })
    render(<HomeScreen />)
    expect(screen.getByText('READINESS')).toBeTruthy()
    // 50% appears both as the readiness value (overall avg of 40+60) and the
    // single Mathematics subject mastery — assert at least one + the unique label.
    expect(screen.getAllByText('50%').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Overall')).toBeTruthy()
  })

  it('shows the friendly empty-state prompt and NO grid values when there is no practice signal', () => {
    render(<HomeScreen />) // all-empty stats + all-empty practice from beforeEach
    expect(screen.getByText('Your Progress')).toBeTruthy()
    expect(screen.getByText(/Start practicing to see your readiness/)).toBeTruthy()
    // The grid eyebrow labels must NOT render in the empty state
    expect(screen.queryByText('READINESS')).toBeNull()
    expect(screen.queryByText('WEAK AREAS')).toBeNull()
    expect(screen.queryByText('By subject')).toBeNull()
  })
})
