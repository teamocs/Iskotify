import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react-native'
import HomeScreen from '../index'
import { aria } from '../../../test-utils/aria'

// Redesign M2 (direction C, "One Next Step"): Today answers "what should I do
// now?" first — one hero next step with the screen's only primary action —
// then at most three supporting sections (plan, exams + countdown, coming up).
// Readiness moved to Progress, scholarships and quick links to Explore, the
// estimator entry to Practice, and settings into Profile.

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

// Breakpoint is controllable per test (390 phone by default; 1440 desktop).
const mockBp = { value: 'compact' as 'compact' | 'medium' | 'expanded' }
jest.mock('../../../hooks/useBreakpoint', () => {
  const actual = jest.requireActual('../../../hooks/useBreakpoint')
  return { ...actual, useBreakpoint: () => mockBp.value }
})

// Controlled admissions rows — override per-test via mockAdmissionsRows.
const mockAdmissionsRows = { value: [] as any[], fail: false }

jest.mock('../../../hooks/useDb', () => ({
  useDb: () => ({
    insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) }),
    update: jest.fn().mockReturnValue({ set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }) }),
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockImplementation(() => (mockAdmissionsRows.fail
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(mockAdmissionsRows.value))),
      where: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }),
    }),
  }),
}))

jest.mock('../../../services/notifications', () => ({
  scheduleNoteReminder: jest.fn().mockResolvedValue(undefined),
  cancelNoteReminder: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../../services/sync', () => ({ syncOnLaunch: jest.fn().mockResolvedValue(undefined) }))

const mockUseHomeStats = jest.fn()
jest.mock('../../../hooks/useHomeStats', () => ({
  useHomeStats: () => mockUseHomeStats(),
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

const mockUsePracticeData = jest.fn()
jest.mock('../../../hooks/usePracticeData', () => ({
  usePracticeData: () => mockUsePracticeData(),
}))

const mockUseHomeCatalog = jest.fn()
jest.mock('../../../hooks/useHomeCatalog', () => ({
  useHomeCatalog: () => mockUseHomeCatalog(),
}))

const mockToggle = jest.fn()
jest.mock('../../../hooks/useNotifications', () => ({
  useNotifications: () => ({ enabled: true, ready: true, schedule: jest.fn(), toggle: mockToggle }),
}))

const mockUseStudyPlan = jest.fn()
jest.mock('../../../hooks/useStudyPlan', () => ({
  useStudyPlan: () => mockUseStudyPlan(),
}))

const DAY = 86_400_000

const emptyStudyPlan = {
  items: [] as any[],
  loading: false,
  error: false,
  allDone: false,
  tomorrowItemCount: 0,
  markComplete: jest.fn().mockResolvedValue(undefined),
  refresh: jest.fn().mockResolvedValue(undefined),
}

const emptyPracticeData = {
  subjects: [{ id: 's-math', name: 'Math' }],
  topicRows: [{ topic: { id: 't1', name: 'Algebra', subjectId: 's-math' }, accuracy: null }],
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
  focusedListings: [] as any[],
  noteReminders: [],
  listingAccuracy: {},
  loading: false,
  error: false,
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
  error: false,
  refresh: jest.fn().mockResolvedValue(undefined),
}

const planItem = (o: Partial<{ id: number; kind: string; refId: string; targetCount: number; completedAt: number | null }> = {}) => ({
  id: 1, kind: 'topic_practice', refId: 't1', targetCount: 10, completedAt: null, ...o,
})

function allText(): string[] {
  const texts: string[] = []
  const walk = (node: any): void => {
    if (node == null) return
    if (typeof node === 'string') { texts.push(node); return }
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (node.children) walk(node.children)
  }
  walk(screen.toJSON())
  return texts
}

describe('Today', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockBp.value = 'compact'
    mockUseHomeStats.mockReturnValue(emptyStats)
    mockUsePracticeData.mockReturnValue(emptyPracticeData)
    mockUseHomeCatalog.mockReturnValue(emptyCatalog)
    mockUseStudyPlan.mockReturnValue(emptyStudyPlan)
    mockAdmissionsRows.value = []
    mockAdmissionsRows.fail = false
  })

  // ── Header ────────────────────────────────────────────────────────────────
  describe('header', () => {
    it('greets the student by first name (nested bold Text) as the screen heading', () => {
      mockUseHomeStats.mockReturnValue({ ...emptyStats, fullName: 'Ana Reyes' })
      render(<HomeScreen />)
      expect(screen.getByText(/Good (morning|afternoon|evening), /)).toBeTruthy()
      expect(screen.getByText('Ana')).toBeTruthy()
      expect(screen.getByRole('header', { name: /Good (morning|afternoon|evening), Ana/ })).toBeTruthy()
    })

    it('shows the date in sentence case, not an uppercase eyebrow', () => {
      render(<HomeScreen />)
      const date = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())
      expect(screen.getByText(date)).toBeTruthy()
      expect(screen.queryByText(date.toUpperCase())).toBeNull()
    })

    it('the avatar opens Profile; Settings now lives in Profile, not on Today', () => {
      const { router } = require('expo-router')
      render(<HomeScreen />)
      fireEvent.press(screen.getByRole('button', { name: 'Profile' }))
      expect(router.push).toHaveBeenCalledWith('/profile')
      expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull()
    })

    it('ends with the tagline instead of repeating the logo tile', () => {
      render(<HomeScreen />)
      expect(screen.getByText('Para sa mga Iskolar ng Bayan')).toBeTruthy()
    })
  })

  // ── Study reminders sheet (was a hand-rolled Modal) ───────────────────────
  describe('study reminders', () => {
    it('opens a Sheet with a labelled switch and plain-text reminder rows', () => {
      render(<HomeScreen />)
      expect(screen.queryByText('Daily practice reminder')).toBeNull()
      fireEvent.press(screen.getByRole('button', { name: 'Study reminders' }))
      expect(screen.getByRole('header', { name: 'Study reminders' })).toBeTruthy()
      expect(screen.getByText('Daily practice reminder')).toBeTruthy()
      expect(screen.getByText('Weekly weak-areas nudge')).toBeTruthy()
      expect(screen.getByText('Exam countdown alerts')).toBeTruthy()
      fireEvent(screen.getByRole('switch', { name: 'Send study reminders' }), 'valueChange', false)
      expect(mockToggle).toHaveBeenCalled()
    })

    it('closes from the Sheet close button', () => {
      render(<HomeScreen />)
      fireEvent.press(screen.getByRole('button', { name: 'Study reminders' }))
      fireEvent.press(screen.getByRole('button', { name: 'Close' }))
      expect(screen.queryByText('Daily practice reminder')).toBeNull()
    })
  })

  // ── Hero: your next step ──────────────────────────────────────────────────
  describe('your next step', () => {
    it('is the first section and names the first plan item that is not done', () => {
      mockUseStudyPlan.mockReturnValue({
        ...emptyStudyPlan,
        items: [
          planItem({ id: 1, kind: 'srs_review', targetCount: 4, completedAt: 5 }),
          planItem({ id: 2 }),
          planItem({ id: 3, kind: 'diagnostic', refId: '' }),
        ],
      })
      render(<HomeScreen />)
      const hero = screen.getByTestId('next-step')
      expect(within(hero).getByRole('header', { name: 'Your next step' })).toBeTruthy()
      expect(within(hero).getByText('Practice Algebra')).toBeTruthy()
      expect(within(hero).getByText('1 of 3 done today')).toBeTruthy()
    })

    it('has the one primary action, which opens that task', () => {
      const { router } = require('expo-router')
      mockUseStudyPlan.mockReturnValue({ ...emptyStudyPlan, items: [planItem({ id: 2 })] })
      render(<HomeScreen />)
      fireEvent.press(screen.getByRole('button', { name: 'Start practice, Practice Algebra' }))
      expect(router.push).toHaveBeenCalledWith('/practice/t1')
    })

    it('shows a busy skeleton while the plan loads', () => {
      mockUseStudyPlan.mockReturnValue({ ...emptyStudyPlan, loading: true })
      render(<HomeScreen />)
      expect(screen.getByLabelText('Loading your next step')).toBeTruthy()
    })

    it('shows an error with a retry when the plan fails to load', () => {
      const refresh = jest.fn()
      mockUseStudyPlan.mockReturnValue({ ...emptyStudyPlan, error: true, refresh })
      render(<HomeScreen />)
      expect(screen.getByText("Couldn't load today's plan")).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
      expect(refresh).toHaveBeenCalled()
    })

    it('celebrates a finished plan and says how much is due tomorrow', () => {
      mockUseStudyPlan.mockReturnValue({
        ...emptyStudyPlan, allDone: true, tomorrowItemCount: 2, items: [planItem({ completedAt: 9 })],
      })
      render(<HomeScreen />)
      expect(screen.getByText('Tapos na for today')).toBeTruthy()
      expect(screen.getByText('Come back tomorrow for 2 more items.')).toBeTruthy()
    })

    it('offers extra practice when nothing is due', () => {
      const { router } = require('expo-router')
      render(<HomeScreen />)
      expect(screen.getByText('Nothing due right now')).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: 'Practice anyway' }))
      expect(router.push).toHaveBeenCalledWith('/(tabs)/practice')
    })
  })

  // ── Today's plan checklist ────────────────────────────────────────────────
  describe("today's plan", () => {
    it('lists every item with a real checkbox that marks it done', () => {
      const markComplete = jest.fn()
      mockUseStudyPlan.mockReturnValue({
        ...emptyStudyPlan,
        markComplete,
        items: [planItem({ id: 1, kind: 'srs_review', targetCount: 3, completedAt: 5 }), planItem({ id: 2 })],
      })
      render(<HomeScreen />)
      expect(screen.getByRole('header', { name: "Today's plan" })).toBeTruthy()
      const done = screen.getByRole('checkbox', { name: 'Review 3 due flashcards' })
      expect(aria(done, 'aria-checked')).toBe(true)
      fireEvent.press(screen.getByRole('checkbox', { name: 'Practice Algebra' }))
      expect(markComplete).toHaveBeenCalledWith(2)
    })

    it('a plan row opens its task', () => {
      const { router } = require('expo-router')
      mockUseStudyPlan.mockReturnValue({ ...emptyStudyPlan, items: [planItem({ id: 2, kind: 'mock_section', refId: 'upcat' })] })
      render(<HomeScreen />)
      fireEvent.press(screen.getByRole('button', { name: 'Timed mock section, A dress rehearsal for the real exam' }))
      expect(router.push).toHaveBeenCalledWith('/practice/exam/upcat')
    })

    it('is hidden while there is no plan (the hero already covers that)', () => {
      render(<HomeScreen />)
      expect(screen.queryByRole('header', { name: "Today's plan" })).toBeNull()
    })
  })

  // ── Your exams: countdown + focus exams ───────────────────────────────────
  describe('your exams', () => {
    it('shows one countdown for the soonest focused exam as a tabular number', () => {
      mockUseHomeStats.mockReturnValue({
        ...emptyStats,
        focusedListings: [
          { slug: 'acet', priority: 2, title: 'ACET 2027', type: 'exam', examDate: Date.now() + 40 * DAY - 1000, deadline: null },
          { slug: 'upcat', priority: 1, title: 'UPCAT 2027', type: 'exam', examDate: Date.now() + 10 * DAY - 1000, deadline: null },
        ],
      })
      render(<HomeScreen />)
      expect(screen.getByLabelText('Until UPCAT 2027: 10 days')).toBeTruthy()
      expect(screen.queryByLabelText(/Until ACET 2027/)).toBeNull()
    })

    it('has an "All exams" link to Explore', () => {
      const { router } = require('expo-router')
      render(<HomeScreen />)
      expect(screen.getByRole('header', { name: 'Your exams' })).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: 'All exams' }))
      expect(router.push).toHaveBeenCalledWith('/(tabs)/explore')
    })

    it('suggests the default exams when nothing is focused, plus one "Add an exam" row', () => {
      mockUseHomeCatalog.mockReturnValue({
        ...emptyCatalog,
        examListings: [
          { slug: 'upcat', title: 'UPCAT', examDate: null },
          { slug: 'acet', title: 'ACET', examDate: null },
          { slug: 'dcat-dlsu', title: 'DCAT', examDate: null },
        ],
      })
      render(<HomeScreen />)
      expect(screen.getByRole('button', { name: 'Add UPCAT to your exams' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Add ACET to your exams' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Add DCAT to your exams' })).toBeTruthy()
      expect(screen.getAllByRole('button', { name: 'Add an exam' })).toHaveLength(1)
    })

    it('adds a suggested exam when tapped (does not navigate)', () => {
      const { router } = require('expo-router')
      mockUseHomeCatalog.mockReturnValue({ ...emptyCatalog, examListings: [{ slug: 'upcat', title: 'UPCAT', examDate: null }] })
      render(<HomeScreen />)
      fireEvent.press(screen.getByRole('button', { name: 'Add UPCAT to your exams' }))
      expect(mockAddListing).toHaveBeenCalledWith('upcat')
      expect(router.push).not.toHaveBeenCalled()
    })

    const focusUpcat = { slug: 'upcat', priority: 1, title: 'UPCAT 2026', type: 'exam', examDate: null, deadline: null }

    it('a focused exam with no score yet opens the diagnostic', () => {
      const { router } = require('expo-router')
      mockUseHomeStats.mockReturnValue({ ...emptyStats, focusedListings: [focusUpcat] })
      render(<HomeScreen />)
      fireEvent.press(screen.getByRole('button', { name: 'UPCAT 2026, no score yet' }))
      expect(router.push).toHaveBeenCalledWith('/practice/diagnostic')
    })

    it('a focused exam with a mock best shows it and opens practice/start/:slug', () => {
      const { router } = require('expo-router')
      mockUseHomeStats.mockReturnValue({ ...emptyStats, focusedListings: [focusUpcat] })
      mockUseHomeCatalog.mockReturnValue({ ...emptyCatalog, listingMockBest: new Map([['upcat', 72]]) })
      render(<HomeScreen />)
      expect(screen.getByText('72%')).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: 'UPCAT 2026, best score 72%' }))
      expect(router.push).toHaveBeenCalledWith('/practice/start/upcat')
    })

    it('a scoreless ACET (own published blueprint) goes to practice/start/acet', () => {
      const { router } = require('expo-router')
      mockUseHomeStats.mockReturnValue({ ...emptyStats, focusedListings: [{ ...focusUpcat, slug: 'acet', title: 'ACET 2026' }] })
      mockUseHomeCatalog.mockReturnValue({ ...emptyCatalog, blueprintSlugs: ['upcat', 'acet', 'ustet'] })
      render(<HomeScreen />)
      fireEvent.press(screen.getByRole('button', { name: 'ACET 2026, no score yet' }))
      expect(router.push).toHaveBeenCalledWith('/practice/start/acet')
    })

    it('a scoreless exam without a blueprint still goes to the diagnostic', () => {
      const { router } = require('expo-router')
      mockUseHomeStats.mockReturnValue({ ...emptyStats, focusedListings: [{ ...focusUpcat, slug: 'random-exam', title: 'Random Exam' }] })
      mockUseHomeCatalog.mockReturnValue({ ...emptyCatalog, blueprintSlugs: ['upcat', 'acet', 'ustet'] })
      render(<HomeScreen />)
      fireEvent.press(screen.getByRole('button', { name: 'Random Exam, no score yet' }))
      expect(router.push).toHaveBeenCalledWith('/practice/diagnostic')
    })

    it('excludes school-level focus entries', () => {
      mockUseHomeStats.mockReturnValue({
        ...emptyStats,
        focusedListings: [{ slug: 'school:abc123', priority: 1, title: 'Some School', type: 'school', examDate: null, deadline: null }],
      })
      render(<HomeScreen />)
      expect(screen.queryByRole('button', { name: /Some School/ })).toBeNull()
    })

    it('"Add an exam" opens the picker Sheet; choosing adds and closes it', () => {
      mockUseHomeCatalog.mockReturnValue({ ...emptyCatalog, examListings: [{ slug: 'ustet', title: 'USTET', examDate: null }] })
      render(<HomeScreen />)
      fireEvent.press(screen.getByRole('button', { name: 'Add an exam' }))
      expect(screen.getByRole('header', { name: 'Add an exam' })).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: 'Add USTET to Focus' }))
      expect(mockAddListing).toHaveBeenCalledWith('ustet')
      expect(screen.queryByRole('button', { name: 'Add USTET to Focus' })).toBeNull()
    })

    it('shows a skeleton while exams load', () => {
      mockUseHomeStats.mockReturnValue({ ...emptyStats, loading: true })
      render(<HomeScreen />)
      expect(screen.getByLabelText('Loading your exams')).toBeTruthy()
    })

    it('shows an error with a retry when exams fail to load', () => {
      const refresh = jest.fn().mockResolvedValue(undefined)
      mockUseHomeStats.mockReturnValue({ ...emptyStats, error: true, refresh })
      render(<HomeScreen />)
      expect(screen.getByText("Couldn't load your exams")).toBeTruthy()
      fireEvent.press(screen.getAllByRole('button', { name: 'Try again' })[0]!)
      expect(refresh).toHaveBeenCalled()
    })

    it('shows an empty state when there is nothing to suggest', () => {
      render(<HomeScreen />)
      expect(screen.getByText('No exams yet')).toBeTruthy()
    })
  })

  // ── Coming up (was News & Dates) ──────────────────────────────────────────
  describe('coming up', () => {
    it('has a header and an "All dates & news" link to Explore news', () => {
      const { router } = require('expo-router')
      render(<HomeScreen />)
      expect(screen.getByRole('header', { name: 'Coming up' })).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: 'All dates & news' }))
      expect(router.push).toHaveBeenCalledWith('/(tabs)/explore?section=news')
    })

    it('shows an empty state when nothing is coming up', async () => {
      render(<HomeScreen />)
      expect(await screen.findByText('Nothing coming up yet')).toBeTruthy()
    })

    it('shows a focused exam date with its day count', async () => {
      mockUseHomeStats.mockReturnValue({
        ...emptyStats,
        focusedListings: [{ slug: 'upcat-2026', priority: 1, title: 'UPCAT 2026', type: 'exam', examDate: Date.now() + 10 * DAY - 1000, deadline: null }],
      })
      render(<HomeScreen />)
      expect(await screen.findByText('10 days')).toBeTruthy()
    })

    it('folds an admissions event into the list', async () => {
      const isoDate = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10)
      mockAdmissionsRows.value = [{
        id: 'au-dost-deadline', reportDate: '2026-06-01', severity: 'important', schoolSlug: null, schoolName: 'DOST',
        title: 'DOST SEI Application Deadline', body: 'Last day to apply.', actionRequired: null,
        eventDate: isoDate, eventType: 'deadline', sources: '[]', verified: false, remoteUpdatedAt: null,
      }]
      render(<HomeScreen />)
      expect(await screen.findByText('DOST SEI Application Deadline')).toBeTruthy()
    })

    it('shows at most three entries', async () => {
      mockUseHomeStats.mockReturnValue({
        ...emptyStats,
        focusedListings: [1, 2, 3, 4, 5].map(i => ({
          slug: `s${i}`, priority: i, title: `Scholarship ${i}`, type: 'scholarship', examDate: null, deadline: Date.now() + i * 5 * DAY,
        })),
      })
      render(<HomeScreen />)
      expect(await screen.findByText('Scholarship 3')).toBeTruthy()
      expect(screen.queryByText('Scholarship 4')).toBeNull()
    })

    it('says so, with a retry, when admissions news fails to load', async () => {
      mockAdmissionsRows.fail = true
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
      render(<HomeScreen />)
      expect(await screen.findByText("Couldn't load admissions news")).toBeTruthy()
      mockAdmissionsRows.fail = false
      fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
      await waitFor(() => expect(screen.queryByText("Couldn't load admissions news")).toBeNull())
      warn.mockRestore()
    })
  })

  // ── Structure ─────────────────────────────────────────────────────────────
  describe('structure', () => {
    it('has one next step and at most four sections, in order', () => {
      // Real data everywhere, so no EmptyState titles (also headers) render.
      mockUseStudyPlan.mockReturnValue({ ...emptyStudyPlan, items: [planItem()] })
      mockUseHomeStats.mockReturnValue({
        ...emptyStats,
        focusedListings: [{ slug: 'upcat', priority: 1, title: 'UPCAT 2027', type: 'exam', examDate: Date.now() + 20 * DAY, deadline: null }],
      })
      render(<HomeScreen />)
      const texts = allText()
      const idx = (label: string) => texts.indexOf(label)
      expect(idx('Your next step')).toBeGreaterThanOrEqual(0)
      expect(idx("Today's plan")).toBeGreaterThan(idx('Your next step'))
      expect(idx('Your exams')).toBeGreaterThan(idx("Today's plan"))
      expect(idx('Coming up')).toBeGreaterThan(idx('Your exams'))
      // Greeting + four section headings, nothing more.
      expect(screen.getAllByRole('header').length).toBeLessThanOrEqual(5)
    })

    it('no longer repeats blocks other tabs own', () => {
      render(<HomeScreen />)
      for (const gone of ['Subject preparedness', 'Recommended Scholarships', 'Estimated Admission Score', 'Explore', 'My Entrance Exams', 'News & Dates']) {
        expect(screen.queryByText(gone)).toBeNull()
      }
    })

    it('renders no emoji anywhere', async () => {
      mockUseStudyPlan.mockReturnValue({ ...emptyStudyPlan, items: [planItem(), planItem({ id: 2, kind: 'srs_review' })] })
      mockUseHomeStats.mockReturnValue({ ...emptyStats, streakDays: 4 })
      render(<HomeScreen />)
      await screen.findByText('Nothing coming up yet')
      expect(allText().join(' ')).not.toMatch(/\p{Extended_Pictographic}/u)
    })

    it('puts the plan and the exams side by side on desktop', () => {
      mockBp.value = 'expanded'
      render(<HomeScreen />)
      const row = screen.getByTestId('two-column')
      expect(row.props.style).toMatchObject({ flexDirection: 'row' })
      expect(within(row).getByTestId('next-step')).toBeTruthy()
      expect(within(row).getByRole('header', { name: 'Your exams' })).toBeTruthy()
    })

    it('stacks everything in one column on a phone', () => {
      render(<HomeScreen />)
      expect(screen.getByTestId('two-column').props.style).toMatchObject({ flexDirection: 'column' })
    })
  })
})
