import React from 'react'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react-native'
import { waitForSheetExit } from '../../../test-utils/sheet'
import HomeScreen from '../index'
import { aria } from '../../../test-utils/aria'
import { lightTheme } from '../../../theme/tokens'
import { eyebrowDate } from '../../../components/home/TodayHeader'

// Redesign M2 (direction C, "One Next Step"), in the iOS language since P4:
// Today answers "what should I do now?" first. The order is fixed by the
// owner (2026-10-13): the One Next Step card (the screen's only primary
// action), the exam countdown tiles, today's plan, then Coming up.
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

// One db object for the whole run (like the real hook): effects keyed on it must not re-run every render.
jest.mock('../../../hooks/useDb', () => {
  const db = {
    insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) }),
    update: jest.fn().mockReturnValue({ set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }) }),
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockImplementation(() => (mockAdmissionsRows.fail
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(mockAdmissionsRows.value))),
      where: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }),
    }),
  }
  return { useDb: () => db }
})

jest.mock('../../../services/notifications', () => ({
  scheduleNoteReminder: jest.fn().mockResolvedValue(undefined),
  cancelNoteReminder: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../../services/sync', () => ({ syncOnLaunch: jest.fn().mockResolvedValue(undefined) }))
// Reads its own settings row (covered in components/home/__tests__/ScholarshipProfilePrompt.test.tsx).
jest.mock('../../../components/home/ScholarshipProfilePrompt', () => ({ ScholarshipProfilePrompt: () => null }))

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

// Review content comes from the DB (services/practiceSignals.hasReviewContent), the same source
// the listing, school and diagnostic pages use.
const mockReviewContentSlugs = jest.fn()
jest.mock('../../../services/practiceSignals', () => ({
  reviewContentSlugs: (...a: any[]) => mockReviewContentSlugs(...a),
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
// Noon (Manila) N calendar days ahead. "now + N days" crosses Manila midnight near
// the end/start of a day and shows an off-by-one countdown.
const manilaNoonInDays = (days: number) => {
  const MANILA = 8 * 3_600_000
  const todayStart = Math.floor((Date.now() + MANILA) / DAY) * DAY - MANILA
  return todayStart + days * DAY + 12 * 3_600_000
}

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
  loaded: true,
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

const flatStyle = (node: any) =>
  [node.props.style].flat(Infinity).reduce((a: any, st: any) => (st && typeof st === 'object' ? { ...a, ...st } : a), {})

/** Every rendered element filled with the maroon accent: primary buttons. */
function maroonFills(): number {
  let n = 0
  const walk = (node: any): void => {
    if (node == null || typeof node === 'string') return
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (flatStyle(node).backgroundColor === lightTheme.accent) n++
    if (node.children) walk(node.children)
  }
  walk(screen.toJSON())
  return n
}

const MANILA_MS = 8 * 3_600_000
const todayIndex = () => Math.floor((Date.now() + MANILA_MS) / DAY)

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
    mockReviewContentSlugs.mockReset().mockResolvedValue(new Set())
    mockUseStudyPlan.mockReturnValue(emptyStudyPlan)
    mockAdmissionsRows.value = []
    mockAdmissionsRows.fail = false
  })

  // ── Header ────────────────────────────────────────────────────────────────
  describe('header', () => {
    it('greets the student by first name in the large title, as the screen heading', () => {
      mockUseHomeStats.mockReturnValue({ ...emptyStats, fullName: 'Ana Reyes' })
      render(<HomeScreen />)
      expect(screen.getByText('Ana')).toBeTruthy()
      expect(screen.getByRole('header', { name: /^Good (morning|afternoon|evening), Ana$/ })).toBeTruthy()
    })

    it('shows the date as an uppercase footnote eyebrow ("Sunday, 12 October")', () => {
      render(<HomeScreen />)
      const flat = flatStyle(screen.getByText(eyebrowDate(new Date())))
      expect(flat.textTransform).toBe('uppercase')
      expect(flat.fontSize).toBe(13)
      expect(flat.color).toBe(lightTheme.textSecondary)
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
      const sw = screen.getByRole('switch', { name: 'Send study reminders' })
      expect(aria(sw, 'aria-checked')).toBe(true)
      fireEvent.press(sw)
      expect(mockToggle).toHaveBeenCalled()
    })

    it('closes from the Sheet close button', async () => {
      render(<HomeScreen />)
      fireEvent.press(screen.getByRole('button', { name: 'Study reminders' }))
      fireEvent.press(screen.getByRole('button', { name: 'Close' }))
      // The sheet animates out before it unmounts (iOS redesign P3).
      await waitForSheetExit()
      expect(screen.queryByText('Daily practice reminder')).toBeNull()
    })
  })

  // ── Hero: your next step ──────────────────────────────────────────────────
  describe('one next step', () => {
    it('is the first section and names the first plan item that is not done, with a time estimate', () => {
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
      expect(within(hero).getByRole('header', { name: 'One next step' })).toBeTruthy()
      expect(within(hero).getByText('Practice Algebra')).toBeTruthy()
      expect(within(hero).getByText('About 10 min')).toBeTruthy()
      // The day's progress lives on the plan group's header.
      expect(screen.getByLabelText('1 of 3 done')).toBeTruthy()
    })

    it('is a white 22pt card with the small shadow', () => {
      mockUseStudyPlan.mockReturnValue({ ...emptyStudyPlan, items: [planItem()] })
      render(<HomeScreen />)
      expect(flatStyle(screen.getByTestId('next-step'))).toMatchObject({
        backgroundColor: lightTheme.surface, borderRadius: 22, boxShadow: lightTheme.shadowSm,
      })
    })

    it('carries the only filled maroon button on the screen', async () => {
      mockUseStudyPlan.mockReturnValue({ ...emptyStudyPlan, items: [planItem(), planItem({ id: 2, kind: 'srs_review' })] })
      mockUseHomeStats.mockReturnValue({
        ...emptyStats,
        focusedListings: [{ slug: 'upcat', priority: 1, title: 'UPCAT 2027', type: 'exam', examDate: manilaNoonInDays(20), deadline: null }],
      })
      render(<HomeScreen />)
      await act(async () => {})
      expect(maroonFills()).toBe(1)
      const hero = screen.getByTestId('next-step')
      expect(within(hero).getByRole('button', { name: 'Start practice, Practice Algebra' })).toBeTruthy()
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
      expect(screen.getByText("That's today done. See you tomorrow.")).toBeTruthy()
      expect(screen.queryByText(/Tapos na/)).toBeNull()
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
    it('shows an "N of M" count beside its title', () => {
      mockUseStudyPlan.mockReturnValue({
        ...emptyStudyPlan,
        items: [planItem({ id: 1, completedAt: 5 }), planItem({ id: 2 }), planItem({ id: 3, kind: 'diagnostic' })],
      })
      render(<HomeScreen />)
      expect(screen.getByText('1 of 3')).toBeTruthy()
    })

    it('each check circle is a checkbox with its checked state, and a done row is struck through', () => {
      mockUseStudyPlan.mockReturnValue({
        ...emptyStudyPlan,
        items: [planItem({ id: 1, kind: 'srs_review', targetCount: 3, completedAt: 5 }), planItem({ id: 2 })],
      })
      render(<HomeScreen />)
      const boxes = screen.getAllByRole('checkbox')
      expect(boxes).toHaveLength(2)
      expect(boxes.map(b => aria(b, 'aria-checked'))).toEqual([true, false])
      const flat = flatStyle(within(screen.getByTestId('todays-plan')).getByText('Review 3 due flashcards'))
      expect(flat.textDecorationLine).toBe('line-through')
      expect(flat.color).toBe(lightTheme.textSecondary)
    })

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
      fireEvent.press(screen.getByRole('button', { name: 'Timed mock, A full, timed dress rehearsal for the real exam' }))
      expect(router.push).toHaveBeenCalledWith('/practice/exam/upcat')
    })

    it('is hidden while there is no plan (the hero already covers that)', () => {
      render(<HomeScreen />)
      expect(screen.queryByRole('header', { name: "Today's plan" })).toBeNull()
    })
  })

  // ── Your exams: countdown + focus exams ───────────────────────────────────
  describe('exam countdowns', () => {
    const two = [
      { slug: 'acet', priority: 2, title: 'ACET 2027', type: 'exam', examDate: manilaNoonInDays(40), deadline: null },
      { slug: 'upcat', priority: 1, title: 'UPCAT 2027', type: 'exam', examDate: manilaNoonInDays(10), deadline: null },
    ]

    it('shows a tile per dated focused exam, soonest first, with a tabular day count', () => {
      mockUseHomeStats.mockReturnValue({ ...emptyStats, focusedListings: two })
      render(<HomeScreen />)
      const tiles = within(screen.getByTestId('exam-countdowns')).getAllByRole('button')
      expect(tiles.map(t => t.props.accessibilityLabel)).toEqual(['UPCAT 2027, 10 days to go', 'ACET 2027, 40 days to go'])
      const flat = flatStyle(within(screen.getByTestId('countdown-upcat')).getByText('10'))
      expect(flat.fontVariant).toEqual(['tabular-nums'])
      expect(flat.fontSize).toBe(34)
    })

    it('a tile opens its listing', () => {
      const { router } = require('expo-router')
      mockUseHomeStats.mockReturnValue({ ...emptyStats, focusedListings: two })
      render(<HomeScreen />)
      fireEvent.press(screen.getByTestId('countdown-upcat'))
      expect(router.push).toHaveBeenCalledWith('/listings/upcat')
    })

    it('says "On pace" in successStrong once the week meets its target', () => {
      const today = todayIndex()
      mockUseHomeStats.mockReturnValue({ ...emptyStats, focusedListings: [two[1]], practiceDayIndices: [0, 1, 2, 3, 4].map(i => today - i) })
      render(<HomeScreen />)
      expect(flatStyle(screen.getByText('On pace')).color).toBe(lightTheme.successStrong)
    })

    it('counts sessions to catch up in the accent colour, never "behind" or warning red', () => {
      mockUseHomeStats.mockReturnValue({ ...emptyStats, focusedListings: [two[1]], practiceDayIndices: [todayIndex() - 1] })
      render(<HomeScreen />)
      const color = flatStyle(screen.getByText('4 sessions to catch up')).color
      expect(color).toBe(lightTheme.accentText)
      expect([lightTheme.danger, lightTheme.warning, lightTheme.dangerStrong, lightTheme.warningStrong]).not.toContain(color)
      expect(allText().join(' ')).not.toMatch(/behind/i)
    })

    it('shows no tiles without a dated exam', () => {
      render(<HomeScreen />)
      expect(screen.queryByTestId('exam-countdowns')).toBeNull()
    })
  })

  describe('your exams', () => {
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
      mockUseHomeCatalog.mockReturnValue({ ...emptyCatalog, blueprintSlugs: ['upcat'] })
      render(<HomeScreen />)
      fireEvent.press(screen.getByRole('button', { name: 'UPCAT 2026, no score yet' }))
      expect(router.push).toHaveBeenCalledWith('/practice/diagnostic')
    })

    it('a focused exam with a mock best shows it and opens practice/start/:slug', () => {
      const { router } = require('expo-router')
      mockUseHomeStats.mockReturnValue({ ...emptyStats, focusedListings: [focusUpcat] })
      mockUseHomeCatalog.mockReturnValue({ ...emptyCatalog, blueprintSlugs: ['upcat'], listingMockBest: new Map([['upcat', 72]]) })
      render(<HomeScreen />)
      expect(screen.getByText('72%')).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: 'UPCAT 2026, best score 72%' }))
      expect(router.push).toHaveBeenCalledWith('/practice/start/upcat')
    })

    it('a scoreless ACET (own published blueprint) goes to its own diagnostic', async () => {
      const { router } = require('expo-router')
      mockUseHomeStats.mockReturnValue({ ...emptyStats, focusedListings: [{ ...focusUpcat, slug: 'acet', title: 'ACET 2026' }] })
      mockUseHomeCatalog.mockReturnValue({ ...emptyCatalog, blueprintSlugs: ['upcat', 'acet', 'ustet'] })
      render(<HomeScreen />)
      await act(async () => {})
      fireEvent.press(screen.getByRole('button', { name: 'ACET 2026, no score yet' }))
      expect(router.push).toHaveBeenCalledWith('/practice/diagnostic?exam=acet')
    })

    it('a scoreless exam with nothing to practise says so and opens its listing (never a dead-end diagnostic)', async () => {
      const { router } = require('expo-router')
      mockUseHomeStats.mockReturnValue({ ...emptyStats, focusedListings: [{ ...focusUpcat, slug: 'random-exam', title: 'Random Exam' }] })
      mockUseHomeCatalog.mockReturnValue({ ...emptyCatalog, blueprintSlugs: ['upcat', 'acet', 'ustet'] })
      render(<HomeScreen />)
      await act(async () => {})
      expect(screen.getByText('No score yet · Practice coming soon')).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: 'Random Exam, no score yet, practice coming soon' }))
      expect(router.push).toHaveBeenCalledWith('/listings/random-exam')
    })

    it('a scoreless exam with review topics but no mock opens its review chooser', async () => {
      const { router } = require('expo-router')
      mockUseHomeStats.mockReturnValue({ ...emptyStats, focusedListings: [{ ...focusUpcat, slug: 'random-exam', title: 'Random Exam' }] })
      mockUseHomeCatalog.mockReturnValue({ ...emptyCatalog, blueprintSlugs: ['upcat'] })
      mockReviewContentSlugs.mockResolvedValue(new Set(['random-exam']))
      render(<HomeScreen />)
      await act(async () => {})
      fireEvent.press(screen.getByRole('button', { name: 'Random Exam, no score yet, mock exam coming soon' }))
      expect(router.push).toHaveBeenCalledWith('/practice/start/random-exam')
    })

    it('asks the DB, not loaded flashcard tags, whether an exam has review content', async () => {
      mockUseHomeStats.mockReturnValue({ ...emptyStats, focusedListings: [{ ...focusUpcat, slug: 'random-exam', title: 'Random Exam' }] })
      mockUseHomeCatalog.mockReturnValue({ ...emptyCatalog, blueprintSlugs: ['upcat'], examListings: [{ slug: 'ustet', title: 'USTET', examDate: null }] })
      mockUsePracticeData.mockReturnValue({ ...emptyPracticeData, topicIdsByListingSlug: { 'random-exam': ['t1'] } })
      render(<HomeScreen />)
      await act(async () => {})
      expect(screen.getByRole('button', { name: 'Random Exam, no score yet, practice coming soon' })).toBeTruthy()
      expect([...mockReviewContentSlugs.mock.calls[0][1]].sort()).toEqual(['random-exam', 'ustet'])
    })

    it('labels nothing as coming soon until review content has loaded', () => {
      mockUseHomeStats.mockReturnValue({ ...emptyStats, focusedListings: [{ ...focusUpcat, slug: 'random-exam', title: 'Random Exam' }] })
      mockReviewContentSlugs.mockReturnValue(new Promise(() => {}))
      render(<HomeScreen />)
      expect(screen.getByRole('button', { name: 'Random Exam, no score yet' })).toBeTruthy()
      expect(screen.queryByText(/coming soon/)).toBeNull()
    })

    it('labels nothing as coming soon until the catalog has loaded', () => {
      mockUseHomeStats.mockReturnValue({ ...emptyStats, focusedListings: [{ ...focusUpcat, slug: 'random-exam', title: 'Random Exam' }] })
      mockUseHomeCatalog.mockReturnValue({ ...emptyCatalog, loaded: false })
      render(<HomeScreen />)
      expect(screen.getByRole('button', { name: 'Random Exam, no score yet' })).toBeTruthy()
      expect(screen.queryByText(/coming soon/)).toBeNull()
    })

    it('ignores a tap that depends on availability until it is known (never a wrong route)', () => {
      const { router } = require('expo-router')
      mockUseHomeStats.mockReturnValue({ ...emptyStats, focusedListings: [{ ...focusUpcat, slug: 'acet', title: 'ACET 2026' }] })
      mockUseHomeCatalog.mockReturnValue({ ...emptyCatalog, loaded: false })
      render(<HomeScreen />)
      const row = screen.getByRole('button', { name: 'ACET 2026, no score yet' })
      expect(aria(row, 'aria-disabled')).toBe(true)
      fireEvent.press(row)
      expect(router.push).not.toHaveBeenCalledWith('/listings/acet')
      expect(router.push).not.toHaveBeenCalled()
    })

    it('says the row is checking availability while its route waits on it', () => {
      mockUseHomeStats.mockReturnValue({ ...emptyStats, focusedListings: [{ ...focusUpcat, slug: 'acet', title: 'ACET 2026' }] })
      mockUseHomeCatalog.mockReturnValue({ ...emptyCatalog, loaded: false })
      render(<HomeScreen />)
      expect(screen.getByRole('button', { name: 'ACET 2026, no score yet' }).props.accessibilityHint).toBe('Checking availability')
    })

    it('has no checking hint once the route is known', async () => {
      mockUseHomeStats.mockReturnValue({ ...emptyStats, focusedListings: [{ ...focusUpcat, slug: 'acet', title: 'ACET 2026' }] })
      mockUseHomeCatalog.mockReturnValue({ ...emptyCatalog, blueprintSlugs: ['upcat', 'acet'] })
      render(<HomeScreen />)
      await act(async () => {})
      expect(screen.getByRole('button', { name: 'ACET 2026, no score yet' }).props.accessibilityHint).toBeUndefined()
    })

    it('forgets the old review availability when the exams change, until the new set loads', async () => {
      const { router } = require('expo-router')
      mockUseHomeStats.mockReturnValue({ ...emptyStats, focusedListings: [{ ...focusUpcat, slug: 'random-exam', title: 'Random Exam' }] })
      mockUseHomeCatalog.mockReturnValue({ ...emptyCatalog, blueprintSlugs: ['upcat'] })
      render(<HomeScreen />)
      await waitFor(() => expect(screen.getByText('No score yet · Practice coming soon')).toBeTruthy(), { timeout: 10_000 })
      // A new exam joins focus; its review content is still loading.
      mockReviewContentSlugs.mockReturnValue(new Promise(() => {}))
      mockUseHomeStats.mockReturnValue({
        ...emptyStats,
        focusedListings: [
          { ...focusUpcat, slug: 'random-exam', title: 'Random Exam' },
          { ...focusUpcat, slug: 'other-exam', title: 'Other Exam', priority: 2 },
        ],
      })
      screen.rerender(<HomeScreen />)
      await act(async () => {})
      expect(screen.queryByText(/coming soon/)).toBeNull()
      const row = screen.getByRole('button', { name: 'Other Exam, no score yet' })
      expect(aria(row, 'aria-disabled')).toBe(true)
      fireEvent.press(row)
      expect(router.push).not.toHaveBeenCalled()
    })

    it('a UPCAT row needs no availability: it opens the diagnostic even while loading', () => {
      const { router } = require('expo-router')
      mockUseHomeStats.mockReturnValue({ ...emptyStats, focusedListings: [focusUpcat] })
      mockUseHomeCatalog.mockReturnValue({ ...emptyCatalog, loaded: false })
      render(<HomeScreen />)
      fireEvent.press(screen.getByRole('button', { name: 'UPCAT 2026, no score yet' }))
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

    it('"Add an exam" opens the picker Sheet; choosing adds and closes it', async () => {
      mockUseHomeCatalog.mockReturnValue({ ...emptyCatalog, examListings: [{ slug: 'ustet', title: 'USTET', examDate: null }] })
      render(<HomeScreen />)
      await act(async () => {})
      fireEvent.press(screen.getByRole('button', { name: 'Add an exam' }))
      expect(screen.getByRole('header', { name: 'Add an exam' })).toBeTruthy()
      expect(screen.getByText('Practice coming soon')).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: 'Add USTET to Focus, practice coming soon' }))
      expect(mockAddListing).toHaveBeenCalledWith('ustet')
      // The sheet animates out before it unmounts (iOS redesign P3).
      await waitForSheetExit()
      expect(screen.queryByRole('button', { name: /Add USTET to Focus/ })).toBeNull()
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
    it('has a header and a "See all" link to Explore news', () => {
      const { router } = require('expo-router')
      render(<HomeScreen />)
      expect(screen.getByRole('header', { name: 'Coming up' })).toBeTruthy()
      expect(screen.getByText('See all')).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: 'See all dates and news' }))
      expect(router.push).toHaveBeenCalledWith('/(tabs)/explore?section=news')
    })

    it('shows an empty state when nothing is coming up', async () => {
      render(<HomeScreen />)
      expect(await screen.findByText('Nothing coming up yet')).toBeTruthy()
    })

    it('shows a focused exam date with its day count', async () => {
      mockUseHomeStats.mockReturnValue({
        ...emptyStats,
        focusedListings: [{ slug: 'upcat-2026', priority: 1, title: 'UPCAT 2026', type: 'exam', examDate: manilaNoonInDays(10), deadline: null }],
      })
      render(<HomeScreen />)
      // Within two weeks: warningStrong (calm, not danger).
      expect(flatStyle(await screen.findByText('In 10 days')).color).toBe(lightTheme.warningStrong)
      // An iOS Calendar-style date tile leads the row.
      expect(within(screen.getByTestId('coming-up')).getByTestId('date-tile', { includeHiddenElements: true })).toBeTruthy()
    })

    it('a date further out reads in textSecondary', async () => {
      mockUseHomeStats.mockReturnValue({
        ...emptyStats,
        focusedListings: [{ slug: 'upcat-2026', priority: 1, title: 'UPCAT 2026', type: 'exam', examDate: manilaNoonInDays(30), deadline: null }],
      })
      render(<HomeScreen />)
      expect(flatStyle(await screen.findByText('In 30 days')).color).toBe(lightTheme.textSecondary)
    })

    it('names the official source host only when the data has one', async () => {
      mockUseHomeStats.mockReturnValue({
        ...emptyStats,
        focusedListings: [
          { slug: 'dost', priority: 1, title: 'DOST-SEI', type: 'scholarship', examDate: null, deadline: manilaNoonInDays(8), sourceUrl: 'https://www.sei.dost.gov.ph/apply' },
          { slug: 'other', priority: 2, title: 'Other Grant', type: 'scholarship', examDate: null, deadline: manilaNoonInDays(9), sourceUrl: null },
        ],
      })
      render(<HomeScreen />)
      expect(await screen.findByText('Deadline · Source: sei.dost.gov.ph')).toBeTruthy()
      expect(screen.getByRole('button', { name: /^DOST-SEI, Deadline on .*, in 8 days, source sei\.dost\.gov\.ph$/ })).toBeTruthy()
      // No source in the data: no source line, never a made-up one.
      const other = screen.getByRole('button', { name: /^Other Grant, Deadline on .*, in 9 days$/ })
      expect(within(other).queryByText(/Source:/)).toBeNull()
      expect(within(other).getByText('Deadline')).toBeTruthy()
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
    it('keeps the owner order: Next Step, countdowns, plan, then Coming up', () => {
      // Real data everywhere, so no EmptyState titles (also headers) render.
      mockUseStudyPlan.mockReturnValue({ ...emptyStudyPlan, items: [planItem()] })
      mockUseHomeStats.mockReturnValue({
        ...emptyStats,
        focusedListings: [{ slug: 'upcat', priority: 1, title: 'UPCAT 2027', type: 'exam', examDate: manilaNoonInDays(20), deadline: null }],
      })
      render(<HomeScreen />)
      const texts = allText()
      const idx = (label: string) => texts.indexOf(label)
      expect(idx('One next step')).toBeGreaterThanOrEqual(0)
      // The countdown tile's day count comes next ("20").
      expect(idx('20')).toBeGreaterThan(idx('One next step'))
      expect(idx("Today's plan")).toBeGreaterThan(idx('20'))
      expect(idx('Coming up')).toBeGreaterThan(idx("Today's plan"))
      expect(idx('Your exams')).toBeGreaterThan(idx('Coming up'))
      // Greeting + the next step + three section headings, nothing more.
      expect(screen.getAllByRole('header').length).toBeLessThanOrEqual(5)
    })

    it('no longer repeats blocks other tabs own', () => {
      render(<HomeScreen />)
      for (const gone of ['Subject preparedness', 'Recommended Scholarships', 'Estimated Admission Score', 'Explore', 'My Entrance Exams', 'News & Dates']) {
        expect(screen.queryByText(gone)).toBeNull()
      }
    })

    it('never renders "behind", "only … left" or the old Taglish sign-off', async () => {
      mockUseStudyPlan.mockReturnValue({ ...emptyStudyPlan, tomorrowItemCount: 1, items: [planItem({ completedAt: 3 })] })
      mockUseHomeStats.mockReturnValue({
        ...emptyStats,
        practiceDayIndices: [todayIndex() - 3],
        focusedListings: [{ slug: 'upcat', priority: 1, title: 'UPCAT 2027', type: 'exam', examDate: manilaNoonInDays(5), deadline: null }],
      })
      render(<HomeScreen />)
      await act(async () => {})
      const text = allText().join(' ')
      expect(text).not.toMatch(/\bbehind\b/i)
      expect(text).not.toMatch(/only \d+ .*left/i)
      expect(text).not.toMatch(/Tapos na/)
      expect(text).toMatch(/That's today done\. See you tomorrow\./)
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
