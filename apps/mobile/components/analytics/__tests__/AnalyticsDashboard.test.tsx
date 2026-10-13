import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react-native'
import { AnalyticsDashboard } from '../AnalyticsDashboard'
import { aria } from '../../../test-utils/aria'
import { countPrimaryActions } from '../../../test-utils/primaryActions'

// Redesign M2: Progress owns readiness and analytics. The dashboard is on the
// shared primitives (StatNumber, FilterChip, Card, Skeleton / EmptyState /
// ErrorState), with sentence-case labels and readable, labelled charts.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))

const mockBp = { value: 'compact' as 'compact' | 'medium' | 'expanded' }
jest.mock('../../../hooks/useBreakpoint', () => {
  const actual = jest.requireActual('../../../hooks/useBreakpoint')
  return { ...actual, useBreakpoint: () => mockBp.value }
})

const mockUseAnalytics = jest.fn()
jest.mock('../../../hooks/useAnalytics', () => ({
  useAnalytics: (slug: string) => mockUseAnalytics(slug),
}))

jest.mock('../../../hooks/useFocusListings', () => ({
  useFocusListings: () => ({
    focusListings: [
      { slug: 'upcat', title: 'UPCAT 2026', priority: 1 },
      { slug: 'school:x', title: 'Some School', priority: 2 },
      { slug: 'acet', title: 'ACET 2026', priority: 3 },
    ],
  }),
}))

jest.mock('../../../hooks/usePracticeData', () => ({
  usePracticeData: () => ({ subjects: [{ id: 's-math', name: 'Math' }] }),
}))

const mockReadiness = jest.fn()
jest.mock('../../../hooks/useSubjectReadiness', () => ({
  useSubjectReadiness: () => mockReadiness(),
}))

const week = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((dayLabel, i) => ({
  dayLabel, accuracy: i === 2 ? 80 : i === 6 ? 60 : null, sessionCount: i === 2 || i === 6 ? 1 : 0,
  minutes: i === 2 ? 12 : i === 6 ? 5 : 0,
}))

const data = {
  sessionCount: 12,
  avgAccuracy: 78,
  streak: 4,
  weeklyData: week,
  topicMastery: [{ label: 'Algebra', accuracy: 85, sessionCount: 3, topicId: 't1', subjectId: 's-math' }],
  recentSessions: [
    { id: 1, title: 'Algebra', accuracy: 90, completedAt: Date.UTC(2026, 8, 20) },
    { id: 2, title: 'Geometry', accuracy: 40, completedAt: Date.UTC(2026, 8, 21) },
  ],
  avgTime: { overallAvgMs: 42_000, overallCount: 30, bySubject: [{ subject: 'Math', avgMs: 65_000, count: 10 }] },
  mostMissedTopics: [{ groupKey: 'g1', label: 'Fractions', wrongCount: 7, skipCount: 2, missRate: 65, destination: { topicId: 't9', listingSlug: 'upcat' } }],
  accuracyTrend: [{ weekStart: Date.UTC(2026, 7, 1), accuracy: 50 }, { weekStart: Date.UTC(2026, 7, 8), accuracy: 70 }],
  mockAttemptHistory: [
    { listingSlug: 'upcat', completedAt: Date.UTC(2026, 8, 10), pct: 35 },
    { listingSlug: 'upcat', completedAt: Date.UTC(2026, 8, 18), pct: 92 },
  ],
  examAccuracy: { upcat: 72 },
  isLoading: false,
  error: false,
  refresh: jest.fn(),
}

const readiness = {
  entries: [{ id: 's-sci', name: 'Science', pct: 30 }, { id: 's-math', name: 'Math', pct: 80 }],
  loading: false,
  error: false,
  refresh: jest.fn(),
}

// Verdicts the owner removed (2026-10-13): no pass/fail bands, no pace status.
const VERDICT = /\b(?:Top tier|Competitive|Developing|Foundational|Below cut-?off|Above cut-?off|Excellent|Needs work|Poor|Strong|Weak|Getting there|Behind|On pace|On track|Pass(?:ed|ing)?|Fail(?:ed|ing)?)\b/i

/** Every accessibility label and hint on screen. */
function allLabels(): string {
  return screen.UNSAFE_root
    .findAll((n: any) => typeof n.props.accessibilityLabel === 'string' || typeof n.props.accessibilityHint === 'string')
    .map((n: any) => `${n.props.accessibilityLabel ?? ''} ${n.props.accessibilityHint ?? ''}`)
    .join(' ')
}

function allText(): string {
  const texts: string[] = []
  const walk = (n: any): void => {
    if (n == null) return
    if (typeof n === 'string') { texts.push(n); return }
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (n.children) walk(n.children)
  }
  walk(screen.toJSON())
  return texts.join(' ')
}

describe('AnalyticsDashboard (Progress)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockBp.value = 'compact'
    mockUseAnalytics.mockReturnValue(data)
    mockReadiness.mockReturnValue(readiness)
  })

  describe('states', () => {
    it('shows a busy skeleton while loading', () => {
      mockUseAnalytics.mockReturnValue({ ...data, isLoading: true, sessionCount: 0 })
      render(<AnalyticsDashboard />)
      expect(screen.getByLabelText('Loading your progress')).toBeTruthy()
    })

    it('shows an error with a retry', () => {
      const refresh = jest.fn()
      mockUseAnalytics.mockReturnValue({ ...data, error: true, sessionCount: 0, refresh })
      render(<AnalyticsDashboard />)
      expect(screen.getByText("Couldn't load your progress")).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
      expect(refresh).toHaveBeenCalled()
    })

    it('shows an empty state with one way to start', () => {
      const { router } = require('expo-router')
      mockUseAnalytics.mockReturnValue({ ...data, sessionCount: 0, avgAccuracy: null, recentSessions: [] })
      render(<AnalyticsDashboard />)
      expect(screen.getByRole('header', { name: 'No practice yet' })).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: 'Start practicing' }))
      expect(router.push).toHaveBeenCalledWith('/(tabs)/practice')
    })
  })

  describe('summary numbers', () => {
    it('reads each number as one labelled StatNumber, in sentence case', () => {
      render(<AnalyticsDashboard />)
      expect(screen.getByLabelText('Sessions: 12')).toBeTruthy()
      expect(screen.getByLabelText('Average accuracy: 78%')).toBeTruthy()
      expect(screen.getByLabelText('Day streak: 4 days')).toBeTruthy()
      expect(screen.getByLabelText('Active days this week: 2')).toBeTruthy()
      expect(screen.queryByText('SESSIONS')).toBeNull()
      expect(screen.queryByText('AVG ACCURACY')).toBeNull()
    })

    it('uses no emoji (the streak was "4🔥")', () => {
      render(<AnalyticsDashboard />)
      expect(allText()).not.toMatch(/\p{Extended_Pictographic}/u)
    })
  })

  describe('exam filter', () => {
    it('is a radio group of exam chips (schools excluded) that re-scopes the numbers', () => {
      render(<AnalyticsDashboard />)
      expect(screen.getByRole('radio', { name: 'Overall', checked: true })).toBeTruthy()
      expect(screen.queryByRole('radio', { name: 'Some School' })).toBeNull()
      fireEvent.press(screen.getByRole('radio', { name: 'UPCAT 2026' }))
      expect(mockUseAnalytics).toHaveBeenLastCalledWith('upcat')
      expect(screen.getByRole('radio', { name: 'UPCAT 2026', checked: true })).toBeTruthy()
    })
  })

  describe('readiness by subject (moved here from Today)', () => {
    it('lists subjects as neutral numbers: a percentage and a bar, never a verdict word', () => {
      render(<AnalyticsDashboard />)
      expect(screen.getByRole('header', { name: 'Readiness by subject' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Science, 30%' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Math, 80%' })).toBeTruthy()
      expect(screen.queryByText('needs work')).toBeNull()
      expect(screen.queryByText('strong')).toBeNull()
      expect(screen.queryByText('getting there')).toBeNull()
    })

    // A8: too little practice is "Not started", not a 0%.
    it('shows Not started — never 0% — for a subject without enough practice', () => {
      mockReadiness.mockReturnValue({ ...readiness, entries: [{ id: 's-sci', name: 'Science', pct: null }, { id: 's-math', name: 'Math', pct: 80 }] })
      render(<AnalyticsDashboard />)
      expect(screen.getByRole('button', { name: 'Science, not started' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: /Science, 0%/ })).toBeNull()
    })

    it('says a tap practises the subject (not every subject has a diagnostic)', () => {
      render(<AnalyticsDashboard />)
      expect(screen.getByText('Lowest first. Tap one to practise it.')).toBeTruthy()
      expect(screen.queryByText(/take its diagnostic/)).toBeNull()
    })

    it('opens the diagnostic for a UPCAT subtest subject', () => {
      const { router } = require('expo-router')
      render(<AnalyticsDashboard />)
      fireEvent.press(screen.getByRole('button', { name: 'Science, 30%' }))
      expect(router.push).toHaveBeenCalledWith('/practice/diagnostic?subject=Science')
      expect(screen.getByRole('button', { name: 'Science, 30%' }).props.accessibilityHint).toBe('Opens a diagnostic for this subject')
    })

    it('opens any other subject on its own page (the diagnostic would ignore it)', () => {
      const { router } = require('expo-router')
      render(<AnalyticsDashboard />)
      fireEvent.press(screen.getByRole('button', { name: 'Math, 80%' }))
      expect(router.push).toHaveBeenCalledWith('/subjects/s-math')
      expect(screen.getByRole('button', { name: 'Math, 80%' }).props.accessibilityHint).toBe('Opens this subject\'s topics to practise')
    })

    it('has its own loading, empty and error states', () => {
      mockReadiness.mockReturnValue({ ...readiness, entries: [], loading: true })
      const { unmount } = render(<AnalyticsDashboard />)
      expect(screen.getByLabelText('Loading readiness')).toBeTruthy()
      unmount()

      mockReadiness.mockReturnValue({ ...readiness, entries: [] })
      const second = render(<AnalyticsDashboard />)
      expect(screen.getByText('Practice a subject to see your readiness here.')).toBeTruthy()
      second.unmount()

      const refresh = jest.fn()
      mockReadiness.mockReturnValue({ ...readiness, entries: [], error: true, refresh })
      render(<AnalyticsDashboard />)
      expect(screen.getByText("Couldn't load readiness")).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
      expect(refresh).toHaveBeenCalled()
    })
  })

  describe('exam readiness (P4)', () => {
    it('draws one labelled ring per focused exam (schools excluded) with its percent and name', () => {
      render(<AnalyticsDashboard />)
      expect(screen.getByRole('header', { name: 'Exam readiness' })).toBeTruthy()
      expect(screen.getAllByTestId('exam-ring')).toHaveLength(2)
      const upcat = screen.getByRole('image', { name: 'UPCAT 2026, 72% practice accuracy' })
      expect(within(upcat).getByText('72%')).toBeTruthy()
      expect(screen.getByRole('image', { name: 'ACET 2026, no practice yet' })).toBeTruthy()
      expect(screen.queryByRole('image', { name: /Some School/ })).toBeNull()
    })

    it('shows no pace or status words beside the rings', () => {
      render(<AnalyticsDashboard />)
      const card = screen.getByTestId('exam-readiness-card')
      const words: string[] = []
      const walk = (n: any): void => {
        if (n == null) return
        if (typeof n === 'string') { words.push(n); return }
        if (Array.isArray(n)) { n.forEach(walk); return }
        if (n.props?.children !== undefined) walk(n.props.children)
        if (n.children) walk(n.children)
      }
      walk(card)
      expect(words.join(' ')).not.toMatch(/behind|on pace|ahead|on track/i)
    })
  })

  describe('charts', () => {
    it('shows study time for the week as a labelled 7-day bar chart', () => {
      render(<AnalyticsDashboard />)
      expect(screen.getByRole('header', { name: 'Study time' })).toBeTruthy()
      expect(screen.getByRole('image', { name: /^Study time by day\. Sat no practice, Sun no practice, Mon 12 minutes.*Fri 5 minutes$/ })).toBeTruthy()
    })

    it("draws today's bar in maroon and the other days in the accent at 30%", () => {
      const { StyleSheet } = require('react-native')
      const { lightTheme } = require('../../../theme/tokens')
      render(<AnalyticsDashboard />)
      const today = StyleSheet.flatten(screen.getByTestId('study-bar-today').props.style)
      expect(today.backgroundColor).toBe(lightTheme.accent)
      expect(today.opacity ?? 1).toBe(1)
      const other = StyleSheet.flatten(screen.getAllByTestId('study-bar')[0]!.props.style)
      expect(other.backgroundColor).toBe(lightTheme.accent)
      expect(other.opacity).toBe(0.3)
    })

    it('labels the 8-week trend for screen readers', () => {
      render(<AnalyticsDashboard />)
      expect(screen.getByLabelText(/^Weekly accuracy trend, latest 70%/)).toBeTruthy()
    })
  })

  describe('detail sections', () => {
    it('Pace is a disclosure: collapsed with a summary, expands on press', () => {
      render(<AnalyticsDashboard />)
      const toggle = screen.getByRole('button', { name: /^Pace/ })
      expect(aria(toggle, 'aria-expanded')).toBe(false)
      expect(within(toggle).getByText('42s per question')).toBeTruthy()
      fireEvent.press(toggle)
      expect(screen.getByRole('button', { name: /^Pace/, expanded: true })).toBeTruthy()
      expect(screen.getByText('1m 05s')).toBeTruthy()
    })

    it('a common mistake opens practice for that topic', () => {
      const { router } = require('expo-router')
      render(<AnalyticsDashboard />)
      fireEvent.press(screen.getByRole('button', { name: /^Most common mistakes/ }))
      fireEvent.press(screen.getByRole('button', { name: 'Review Fractions, 7 wrong, 2 skipped' }))
      expect(router.push).toHaveBeenCalledWith('/practice/t9?listingSlug=upcat')
    })

    it('mock history lists raw percentages with no band or verdict', () => {
      render(<AnalyticsDashboard />)
      const toggle = screen.getByRole('button', { name: /^Mock score history/ })
      expect(within(toggle).getByText('Latest 92%')).toBeTruthy()
      fireEvent.press(toggle)
      expect(screen.getByText('35%')).toBeTruthy()
      expect(screen.getByText('92%')).toBeTruthy()
      expect(allText()).not.toMatch(VERDICT)
    })

    it('recent sessions show their accuracy as text', () => {
      render(<AnalyticsDashboard />)
      fireEvent.press(screen.getByRole('button', { name: /^Recent sessions/ }))
      expect(screen.getByText('90%')).toBeTruthy()
      expect(screen.getByText('40%')).toBeTruthy()
    })
  })

  describe('no verdicts (P4)', () => {
    it('no verdict words in any visible text or accessibility label, with every disclosure open', () => {
      render(<AnalyticsDashboard />)
      for (const name of [/^Pace/, /^Most common mistakes/, /^Mock score history/, /^Recent sessions/]) {
        fireEvent.press(screen.getByRole('button', { name }))
      }
      expect(allText()).not.toMatch(VERDICT)
      expect(allLabels()).not.toMatch(VERDICT)
    })

    it('has at most one primary action', () => {
      render(<AnalyticsDashboard />)
      expect(countPrimaryActions(screen.UNSAFE_root)).toBeLessThanOrEqual(1)
    })
  })

  describe('habit tiles', () => {
    it('show only real numbers: streak, sessions, active days and accuracy', () => {
      render(<AnalyticsDashboard />)
      expect(screen.getAllByTestId('habit-tile')).toHaveLength(4)
    })

    it('says the streak covers all exams when an exam filter is on (the other tiles are filtered)', () => {
      render(<AnalyticsDashboard />)
      expect(screen.getByLabelText('Day streak: 4 days')).toBeTruthy()
      fireEvent.press(screen.getByRole('radio', { name: 'UPCAT 2026' }))
      expect(screen.getByLabelText('Day streak (all exams): 4 days')).toBeTruthy()
    })
  })

  it('lays out two columns on desktop', () => {
    mockBp.value = 'expanded'
    render(<AnalyticsDashboard />)
    expect(screen.getByTestId('two-column').props.style).toMatchObject({ flexDirection: 'row' })
  })
})
