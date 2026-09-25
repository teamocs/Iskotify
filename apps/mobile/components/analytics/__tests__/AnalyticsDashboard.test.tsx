import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react-native'
import { AnalyticsDashboard } from '../AnalyticsDashboard'

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
  mockAttemptHistory: [],
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
      expect(screen.getByRole('radio', { name: 'Overall' }).props.accessibilityState).toMatchObject({ selected: true })
      expect(screen.queryByRole('radio', { name: 'Some School' })).toBeNull()
      fireEvent.press(screen.getByRole('radio', { name: 'UPCAT 2026' }))
      expect(mockUseAnalytics).toHaveBeenLastCalledWith('upcat')
      expect(screen.getByRole('radio', { name: 'UPCAT 2026' }).props.accessibilityState).toMatchObject({ selected: true })
    })
  })

  describe('readiness by subject (moved here from Today)', () => {
    it('lists subjects with a percentage and a word, not colour alone', () => {
      render(<AnalyticsDashboard />)
      expect(screen.getByRole('header', { name: 'Readiness by subject' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Science, 30%, needs work' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Math, 80%, strong' })).toBeTruthy()
    })

    it('opens the diagnostic for that subject', () => {
      const { router } = require('expo-router')
      render(<AnalyticsDashboard />)
      fireEvent.press(screen.getByRole('button', { name: 'Math, 80%, strong' }))
      expect(router.push).toHaveBeenCalledWith('/practice/diagnostic?subject=Math')
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

  describe('charts', () => {
    it('shows this week open, with a spoken summary of every day', () => {
      render(<AnalyticsDashboard />)
      expect(screen.getByRole('header', { name: 'This week' })).toBeTruthy()
      expect(screen.getByLabelText(/^Accuracy by day\. Sat no practice, Sun no practice, Mon 80%.*Fri 60%$/)).toBeTruthy()
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
      expect(toggle.props.accessibilityState).toMatchObject({ expanded: false })
      expect(within(toggle).getByText('42s per question')).toBeTruthy()
      fireEvent.press(toggle)
      expect(screen.getByRole('button', { name: /^Pace/ }).props.accessibilityState).toMatchObject({ expanded: true })
      expect(screen.getByText('1m 05s')).toBeTruthy()
    })

    it('a common mistake opens practice for that topic', () => {
      const { router } = require('expo-router')
      render(<AnalyticsDashboard />)
      fireEvent.press(screen.getByRole('button', { name: /^Most common mistakes/ }))
      fireEvent.press(screen.getByRole('button', { name: 'Review Fractions, 7 wrong, 2 skipped' }))
      expect(router.push).toHaveBeenCalledWith('/practice/t9?listingSlug=upcat')
    })

    it('recent sessions show their accuracy as text', () => {
      render(<AnalyticsDashboard />)
      fireEvent.press(screen.getByRole('button', { name: /^Recent sessions/ }))
      expect(screen.getByText('90%')).toBeTruthy()
      expect(screen.getByText('40%')).toBeTruthy()
    })
  })

  it('lays out two columns on desktop', () => {
    mockBp.value = 'expanded'
    render(<AnalyticsDashboard />)
    expect(screen.getByTestId('two-column').props.style).toMatchObject({ flexDirection: 'row' })
  })
})
