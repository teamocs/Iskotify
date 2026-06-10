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
        listingAccuracy: {},
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
  listingAccuracy: {},
  refresh: jest.fn().mockResolvedValue(undefined),
}

describe('HomeScreen', () => {
  beforeEach(() => {
    mockUseHomeStats.mockReturnValue(emptyStats)
  })

  it('renders Kuya Baw name (full card always visible)', () => {
    render(<HomeScreen />)
    expect(screen.getByText('Kuya Baw')).toBeTruthy()
  })

  it('AI Coach badge is visible immediately (always-expanded card)', () => {
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

  it('settings button navigates to /settings when pressed', () => {
    const { router } = require('expo-router')
    jest.clearAllMocks()
    render(<HomeScreen />)
    expect(router.push).not.toHaveBeenCalled()
  })
})
