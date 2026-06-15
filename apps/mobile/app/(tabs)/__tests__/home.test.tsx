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

// The Subjects-to-improve grid is now SESSION-based (consistent with Subject
// Details): Home reads per-topic best + subject-level mock best from the
// aggregates. Control them per-test; default to "no sessions" so the flashcard
// accuracy fallback still drives the older grid tests.
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

// Mirror the useHomeStats global-mock pattern for usePracticeData (the
// "Subjects to improve" grid data source). Override per-test via mockReturnValue.
const mockUsePracticeData = jest.fn()

jest.mock('../../../hooks/usePracticeData', () => ({
  usePracticeData: () => mockUsePracticeData(),
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

describe('HomeScreen', () => {
  beforeEach(() => {
    mockUseHomeStats.mockReturnValue(emptyStats)
    mockUsePracticeData.mockReturnValue(emptyPracticeData)
    mockTopicBest.value = []
    mockSubjectBest.value = []
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

  it('does NOT render the Quick Practice CTA (removed)', () => {
    mockUseHomeStats.mockReturnValue({
      ...emptyStats,
      firstTopicId: 'topic-1',
      weakTopics: [{ topicId: 'topic-1', topicName: 'Algebra', accuracy: 40 }],
    })
    render(<HomeScreen />)
    expect(screen.queryByText('Quick Practice')).toBeNull()
  })

  it('renders My Focus section header', () => {
    render(<HomeScreen />)
    expect(screen.getByText('My Focus')).toBeTruthy()
  })

  it('renders the My Focus subheadline (no longer mentions streaks)', () => {
    render(<HomeScreen />)
    expect(screen.getByText('Your readiness for each target exam')).toBeTruthy()
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

  it('renders focus card title + readiness % when focusedListings mocked', () => {
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
    expect(screen.getByText('72%')).toBeTruthy()
  })

  it('focus card does NOT render any streak text (streak removed)', () => {
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
    expect(screen.queryByText(/streak/i)).toBeNull()
    expect(screen.queryByText(/🔥/)).toBeNull()
  })

  it('focus card shows "—" for readiness when the listing has no accuracy yet', () => {
    const futureDate = Date.now() + 10 * 86_400_000
    mockUseHomeStats.mockReturnValue({
      ...emptyStats,
      focusedListings: [
        { slug: 'upcat-2026', priority: 1, title: 'UPCAT 2026', type: 'exam', examDate: futureDate, deadline: null },
      ],
      listingAccuracy: {}, // not practiced → no fill, em-dash
    })
    render(<HomeScreen />)
    expect(screen.getByText('—')).toBeTruthy()
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

  it('Your Progress analytics section is NOT present (removed)', () => {
    mockUseHomeStats.mockReturnValue({
      ...emptyStats,
      weakTopics: [{ topicId: 't1', topicName: 'Algebra', accuracy: 40 }],
      listingAccuracy: { 'upcat-2026': 80 },
    })
    render(<HomeScreen />)
    expect(screen.queryByText('Your Progress')).toBeNull()
    expect(screen.queryByText('READINESS')).toBeNull()
    expect(screen.queryByText('WEAK AREAS')).toBeNull()
    expect(screen.queryByText('By subject')).toBeNull()
    expect(screen.queryByText(/Start practicing to see your readiness/)).toBeNull()
  })

  // ── Section order: Explore renders ABOVE My Focus ────────────────────────────
  it('renders the Explore section before the My Focus section', () => {
    render(<HomeScreen />)
    // Both section headers must be present.
    expect(screen.getByText('Explore')).toBeTruthy()
    expect(screen.getByText('My Focus')).toBeTruthy()
    // Collect rendered text strings in document order (recurse children only,
    // avoiding the circular refreshControl prop that breaks JSON.stringify).
    const texts: string[] = []
    const walk = (node: any): void => {
      if (node == null) return
      if (typeof node === 'string') { texts.push(node); return }
      if (Array.isArray(node)) { node.forEach(walk); return }
      if (node.children) walk(node.children)
    }
    walk(screen.toJSON())
    const exploreIdx = texts.indexOf('Explore')
    const myFocusIdx = texts.indexOf('My Focus')
    expect(exploreIdx).toBeGreaterThanOrEqual(0)
    expect(myFocusIdx).toBeGreaterThanOrEqual(0)
    expect(exploreIdx).toBeLessThan(myFocusIdx)
  })

  // ── My Focus: "add more targets" affordance ──────────────────────────────────
  it('renders an "Add exam or scholarship" target card when there are focused listings', () => {
    const futureDate = Date.now() + 10 * 86_400_000
    mockUseHomeStats.mockReturnValue({
      ...emptyStats,
      focusedListings: [
        { slug: 'upcat-2026', priority: 1, title: 'UPCAT 2026', type: 'exam', examDate: futureDate, deadline: null },
      ],
      listingAccuracy: { 'upcat-2026': 72 },
    })
    render(<HomeScreen />)
    expect(screen.getByText(/Add exam or scholarship/)).toBeTruthy()
  })

  it('pressing the add-target card navigates to the Lists tab', () => {
    const { router } = require('expo-router')
    jest.clearAllMocks()
    const futureDate = Date.now() + 10 * 86_400_000
    mockUseHomeStats.mockReturnValue({
      ...emptyStats,
      focusedListings: [
        { slug: 'upcat-2026', priority: 1, title: 'UPCAT 2026', type: 'exam', examDate: futureDate, deadline: null },
      ],
      listingAccuracy: { 'upcat-2026': 72 },
    })
    render(<HomeScreen />)
    fireEvent.press(screen.getByLabelText('Add exam or scholarship'))
    expect(router.push).toHaveBeenCalledWith('/(tabs)/listings')
  })

  it('does NOT render the add-target card when there are no focused listings', () => {
    render(<HomeScreen />)
    expect(screen.queryByText(/Add exam or scholarship/)).toBeNull()
  })

  // ── Subjects to improve grid ─────────────────────────────────────────────────
  it('renders the Subjects to improve section header when subjects exist', () => {
    mockUsePracticeData.mockReturnValue({
      ...emptyPracticeData,
      subjects: [{ id: 's-math', name: 'Math' }],
      topicRows: [
        { topic: { id: 't1', name: 'Algebra', subjectId: 's-math' }, accuracy: 40 },
      ],
    })
    render(<HomeScreen />)
    expect(screen.getByText('Subjects to improve')).toBeTruthy()
  })

  it('renders a subject card with its name and mastery %', () => {
    mockUsePracticeData.mockReturnValue({
      ...emptyPracticeData,
      subjects: [{ id: 's-math', name: 'Math' }],
      topicRows: [
        { topic: { id: 't1', name: 'Algebra', subjectId: 's-math' }, accuracy: 40 },
        { topic: { id: 't2', name: 'Geometry', subjectId: 's-math' }, accuracy: 60 },
      ],
    })
    render(<HomeScreen />)
    expect(screen.getByText('Math')).toBeTruthy()
    expect(screen.getByText('50%')).toBeTruthy() // (40 + 60) / 2
  })

  it('pressing a subject card navigates to /subjects/:id', () => {
    const { router } = require('expo-router')
    jest.clearAllMocks()
    mockUsePracticeData.mockReturnValue({
      ...emptyPracticeData,
      subjects: [{ id: 's-math', name: 'Math' }],
      topicRows: [
        { topic: { id: 't1', name: 'Algebra', subjectId: 's-math' }, accuracy: 40 },
      ],
    })
    render(<HomeScreen />)
    fireEvent.press(screen.getByLabelText('Math'))
    expect(router.push).toHaveBeenCalledWith('/subjects/s-math')
  })

  it('renders no subject cards when usePracticeData has no subjects with topics', () => {
    render(<HomeScreen />)
    // No subject names, no Subjects-to-improve header content beyond the prompt.
    expect(screen.queryByText('Math')).toBeNull()
    expect(screen.queryByText(/50%/)).toBeNull()
  })

  // ── REGRESSION: mock-practiced subject in the grid (session-based) ───────────
  // A subject practiced ONLY through a mock (subtest session) has flashcard
  // accuracy = null on every topic, but a subject-level mock best keyed by the
  // subject NAME. The grid must show the mock % (was 0% when grid read only
  // flashcard user_progress accuracy — RED before this fix).
  it('shows a mock-practiced subject\'s real % in the grid (Reading Comprehension via mock)', async () => {
    mockUsePracticeData.mockReturnValue({
      ...emptyPracticeData,
      subjects: [{ id: 's-rc', name: 'Reading Comprehension' }],
      topicRows: [
        { topic: { id: 't1', name: 'Main Idea', subjectId: 's-rc' }, accuracy: null },
        { topic: { id: 't2', name: 'Inference', subjectId: 's-rc' }, accuracy: null },
      ],
    })
    // No per-topic review bests; only a subject-level mock best (subtest == name).
    mockTopicBest.value = []
    mockSubjectBest.value = [{ subject: 'Reading Comprehension', bestPct: 68 }]

    render(<HomeScreen />)
    // Mock lifts both topics → average 68% (NOT 0%).
    expect(await screen.findByText('68%')).toBeTruthy()
    expect(screen.queryByText('0%')).toBeNull()
  })

  it('a per-topic review best raises the grid % above the subject mock', async () => {
    mockUsePracticeData.mockReturnValue({
      ...emptyPracticeData,
      subjects: [{ id: 's-math', name: 'Math' }],
      topicRows: [
        { topic: { id: 't1', name: 'Algebra', subjectId: 's-math' }, accuracy: null },
        { topic: { id: 't2', name: 'Geometry', subjectId: 's-math' }, accuracy: null },
      ],
    })
    mockTopicBest.value = [{ topicId: 't1', bestPct: 90 }] // review beats mock
    mockSubjectBest.value = [{ subject: 'Math', bestPct: 50 }]

    render(<HomeScreen />)
    // t1 = max(90,50)=90 ; t2 = max(null,50)=50 → (90+50)/2 = 70
    expect(await screen.findByText('70%')).toBeTruthy()
  })
})
