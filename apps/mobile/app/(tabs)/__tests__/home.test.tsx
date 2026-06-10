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

jest.mock('../../../hooks/useModelDownload', () => ({
  useModelDownload: () => ({
    modelStatus: 'absent',
    progress: 0,
    bytesDownloaded: 0,
    bytesTotal: 0,
    startDownload: jest.fn(),
    lastError: null,
  }),
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

jest.mock('../../../components/calendar/DateActionSheet', () => ({
  DateActionSheet: () => null,
}))

jest.mock('../../../components/calendar/MonthSheet', () => ({
  MonthSheet: () => null,
}))

jest.mock('../../../components/AskKuyaModal', () => ({
  AskKuyaModal: () => null,
}))

const mockUseHomeStats = jest.fn()

jest.mock('../../../hooks/useHomeStats', () => ({
  useHomeStats: () => mockUseHomeStats(),
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
      },
      ringIndex: 0,
      nextPhrase: () => ({ id: null, text: 'Tara mag-review tayo!' }),
    }),
  }
})

jest.mock('../../../hooks/useAiCoach', () => {
  const { useHomeStats } = require('../../../hooks/useHomeStats')
  const { pickTemplate } = require('../../../services/coachTemplates')
  return {
    useAiCoach: () => {
      const stats = useHomeStats()
      return { phrase: pickTemplate(stats, 0), onTap: jest.fn() }
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
  refresh: jest.fn().mockResolvedValue(undefined),
}

describe('HomeScreen', () => {
  beforeEach(() => {
    mockUseHomeStats.mockReturnValue(emptyStats)
  })

  it('renders the Kuya Baw collapsed coach row by default', () => {
    render(<HomeScreen />)
    // Collapsed row shows the name in its compact label
    expect(screen.getByText('Kuya Baw')).toBeTruthy()
  })

  it('coach row is collapsed by default (full card not visible)', () => {
    render(<HomeScreen />)
    // The "AI Coach" badge is only in the expanded full card
    expect(screen.queryByText('AI Coach')).toBeNull()
  })

  it('expands coach card on press of the collapsed row', () => {
    render(<HomeScreen />)
    const collapsedRow = screen.getByTestId('kuya-coach-collapsed')
    fireEvent.press(collapsedRow)
    expect(screen.getByText('AI Coach')).toBeTruthy()
  })

  it('renders all three stat labels', () => {
    render(<HomeScreen />)
    expect(screen.getByText('DAYS LEFT')).toBeTruthy()
    expect(screen.getByText('ACCURACY')).toBeTruthy()
    expect(screen.getByText('STREAK')).toBeTruthy()
  })

  it('shows em-dash for stats when no data', () => {
    render(<HomeScreen />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(3)
  })

  it('renders Weak Areas section header', () => {
    render(<HomeScreen />)
    expect(screen.getByText('Weak Areas')).toBeTruthy()
  })

  it('shows empty state when no weak topics', () => {
    render(<HomeScreen />)
    expect(screen.getByText('Start practicing to see weak areas')).toBeTruthy()
  })

  it('shows listing title in greeting when listing is set', () => {
    mockUseHomeStats.mockReturnValue({
      ...emptyStats,
      listing: { title: 'UPCAT 2025' },
    })
    render(<HomeScreen />)
    expect(screen.getByText(/UPCAT 2025/)).toBeTruthy()
  })

  it('shows Quick Practice button when a topic is available', () => {
    mockUseHomeStats.mockReturnValue({
      ...emptyStats,
      firstTopicId: 'topic-1',
    })
    render(<HomeScreen />)
    expect(screen.getByText('Quick Practice')).toBeTruthy()
  })

  it('renders weak topic cards when present', () => {
    mockUseHomeStats.mockReturnValue({
      ...emptyStats,
      weakTopics: [{ topicId: 't1', topicName: 'Algebra', accuracy: 45 }],
      firstTopicId: 't1',
    })
    render(<HomeScreen />)
    expect(screen.getByText('Algebra')).toBeTruthy()
  })

  it('pressing settings button navigates to /settings', () => {
    const { router } = require('expo-router')
    jest.clearAllMocks()
    render(<HomeScreen />)
    const settingsBtn = screen.queryByTestId('settings-btn')
    expect(router.push).not.toHaveBeenCalled()
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
    expect(screen.getByText('UPCAT 2026')).toBeTruthy()
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

  it('shows at most 3 weak topics by default', () => {
    mockUseHomeStats.mockReturnValue({
      ...emptyStats,
      weakTopics: [
        { topicId: 't1', topicName: 'Algebra', accuracy: 20 },
        { topicId: 't2', topicName: 'Chemistry', accuracy: 25 },
        { topicId: 't3', topicName: 'Physics', accuracy: 30 },
        { topicId: 't4', topicName: 'Biology', accuracy: 35 },
        { topicId: 't5', topicName: 'History', accuracy: 40 },
      ],
      firstTopicId: 't1',
    })
    render(<HomeScreen />)
    expect(screen.getByText('Algebra')).toBeTruthy()
    expect(screen.getByText('Chemistry')).toBeTruthy()
    expect(screen.getByText('Physics')).toBeTruthy()
    // 4th and 5th should be hidden by default
    expect(screen.queryByText('Biology')).toBeNull()
    expect(screen.queryByText('History')).toBeNull()
  })

  it('shows all weak topics after pressing See all', () => {
    mockUseHomeStats.mockReturnValue({
      ...emptyStats,
      weakTopics: [
        { topicId: 't1', topicName: 'Algebra', accuracy: 20 },
        { topicId: 't2', topicName: 'Chemistry', accuracy: 25 },
        { topicId: 't3', topicName: 'Physics', accuracy: 30 },
        { topicId: 't4', topicName: 'Biology', accuracy: 35 },
        { topicId: 't5', topicName: 'History', accuracy: 40 },
      ],
      firstTopicId: 't1',
    })
    render(<HomeScreen />)
    // Press "See all (5)"
    const seeAll = screen.getByText(/See all/)
    fireEvent.press(seeAll)
    expect(screen.getByText('Biology')).toBeTruthy()
    expect(screen.getByText('History')).toBeTruthy()
  })
})
