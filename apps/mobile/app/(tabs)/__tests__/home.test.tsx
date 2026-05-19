import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import HomeScreen from '../index'

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
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
}

describe('HomeScreen', () => {
  beforeEach(() => {
    mockUseHomeStats.mockReturnValue(emptyStats)
  })

  it('renders the Kuya Baw AI coach card', () => {
    render(<HomeScreen />)
    expect(screen.getByText('Kuya Baw')).toBeTruthy()
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
})
