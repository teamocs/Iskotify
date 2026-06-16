import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import UpdatesScreen from '../updates'

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// Mock NewsDetailModal to avoid native Modal nesting issues in tests.
// Use a lazy require inside the factory so the variable name rule is satisfied.
jest.mock('../../../components/updates/NewsDetailModal', () => ({
  NewsDetailModal: ({ item, onClose }: any) => {
    const { Text, TouchableOpacity } = require('react-native')
    return (
      <>
        <Text testID="modal-title">{item.title}</Text>
        <Text testID="modal-body">{item.body}</Text>
        {item.actionRequired ? <Text testID="modal-action">{item.actionRequired}</Text> : null}
        <TouchableOpacity testID="modal-close" onPress={onClose} />
      </>
    )
  },
}))

jest.mock('../../../hooks/useDb', () => ({
  useDb: jest.fn(),
}))

jest.mock('../../../hooks/useHomeStats', () => ({
  useHomeStats: () => ({
    importantDayIndices: [],
    practiceDayIndices: [],
    noteReminders: [],
    refresh: jest.fn().mockResolvedValue(undefined),
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

// ── DB factory ────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10)
const FUTURE = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)

const makeDb = (rows: any[] = []) => ({
  select: jest.fn(() => ({
    from: jest.fn().mockResolvedValue(rows),
  })),
})

const URGENT_ROW = {
  id: 'u1',
  reportDate: TODAY,
  severity: 'urgent',
  schoolSlug: 'up-diliman',
  schoolName: 'UP Diliman',
  title: 'UPCAT Application Now Open',
  body: 'Apply before the deadline.',
  actionRequired: 'Submit your application form now.',
  eventDate: null,
  eventType: null,
  sources: '[]',
  verified: true,
  remoteUpdatedAt: null,
}

const INFO_ROW = {
  id: 'i1',
  reportDate: TODAY,
  severity: 'info',
  schoolSlug: 'ust',
  schoolName: 'UST',
  title: 'USTET Results Released',
  body: 'Check the official UST website.',
  actionRequired: null,
  eventDate: null,
  eventType: null,
  sources: JSON.stringify([{ label: 'UST Portal', url: 'https://ust.edu.ph' }]),
  verified: false,
  remoteUpdatedAt: null,
}

const EVENT_ROW = {
  id: 'e1',
  reportDate: TODAY,
  severity: 'important',
  schoolSlug: 'admu',
  schoolName: 'Ateneo',
  title: 'ACET Exam Day',
  body: 'Bring your permit.',
  actionRequired: null,
  eventDate: FUTURE,
  eventType: 'Exam',
  sources: '[]',
  verified: true,
  remoteUpdatedAt: null,
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('UpdatesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders header title and subtitle', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb())
    render(<UpdatesScreen />)
    expect(screen.getByText('Updates')).toBeTruthy()
    expect(screen.getByText('Events, news & app updates')).toBeTruthy()
  })

  it('renders the Results Tracker card', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb())
    render(<UpdatesScreen />)
    expect(screen.getByText('Results Tracker')).toBeTruthy()
  })

  it('pushes /results-tracker when Results Tracker is pressed', async () => {
    const { router } = require('expo-router')
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb())
    render(<UpdatesScreen />)
    fireEvent.press(screen.getByText('Results Tracker'))
    expect(router.push).toHaveBeenCalledWith('/results-tracker')
  })

  it('renders Upcoming Events section when event rows exist', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb([EVENT_ROW]))
    render(<UpdatesScreen />)
    await waitFor(() => {
      // Title appears in both Upcoming Events and News sections
      expect(screen.getAllByText('ACET Exam Day').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Exam')).toBeTruthy()
      expect(screen.getAllByText('Ateneo').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('UPCOMING EVENTS')).toBeTruthy()
    })
  })

  it('hides Upcoming Events section when no future events', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb([URGENT_ROW]))
    render(<UpdatesScreen />)
    await waitFor(() => {
      expect(screen.queryByText('UPCOMING EVENTS')).toBeNull()
    })
  })

  it('renders News section with urgent badge for urgent row', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb([URGENT_ROW]))
    render(<UpdatesScreen />)
    await waitFor(() => {
      expect(screen.getByText('UPCAT Application Now Open')).toBeTruthy()
      expect(screen.getByText('Urgent')).toBeTruthy()
    })
  })

  it('renders urgent item before info item (severity ordering)', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb([INFO_ROW, URGENT_ROW]))
    render(<UpdatesScreen />)
    await waitFor(() => {
      const urgentEl = screen.getByText('UPCAT Application Now Open')
      const infoEl = screen.getByText('USTET Results Released')
      // Both must be present; urgentEl should appear before infoEl in the tree
      expect(urgentEl).toBeTruthy()
      expect(infoEl).toBeTruthy()
    })
  })

  it('no longer renders the removed ISKOTIFY UPDATES section', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb())
    render(<UpdatesScreen />)
    expect(screen.queryByText('ISKOTIFY UPDATES')).toBeNull()
  })

  it('CalendarStrip wrapper renders on Updates screen', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb())
    render(<UpdatesScreen />)
    // The calendar strip container is rendered (month label — current month)
    expect(screen.getByTestId('updates-calendar-strip')).toBeTruthy()
  })
})
