import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import SubjectDetailsScreen from '../[id]'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ id: 's1' })),
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('../../../hooks/useDb', () => ({ useDb: jest.fn() }))

// The per-topic best-session aggregate is unit-tested in services/__tests__;
// here we control its output so the screen's compose + sort can be asserted.
jest.mock('../../../services/homeAggregates', () => ({
  getTopicBestSessionPercentages: jest.fn(),
}))

// ---------------------------------------------------------------------------
// DB mock — the screen's cached fetcher runs, in order:
//   1. subject name: select().from().where().limit()
//   2. topics:       select().from().where()
// (getTopicBestSessionPercentages is mocked separately, above.)
// ---------------------------------------------------------------------------

function makeDb(subjectRows: any[], topicRows: any[]) {
  let call = 0
  const select = jest.fn(() => {
    call++
    if (call === 1) {
      return { from: () => ({ where: () => ({ limit: () => Promise.resolve(subjectRows) }) }) }
    }
    return { from: () => ({ where: () => Promise.resolve(topicRows) }) }
  })
  return { select }
}

const SUBJECT = [{ id: 's1', name: 'Mathematics' }]

const TOPICS = [
  { id: 't1', name: 'Algebra' },
  { id: 't2', name: 'Geometry' },
  { id: 't3', name: 'Trigonometry' },
]

function setBest(map: Array<{ topicId: string; bestPct: number }>) {
  const { getTopicBestSessionPercentages } = require('../../../services/homeAggregates')
  getTopicBestSessionPercentages.mockResolvedValue(map)
}

describe('SubjectDetailsScreen ([id]) — readiness per topic', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    const { _clearForTests } = require('../../../services/queryCache')
    _clearForTests()
    const { useLocalSearchParams } = require('expo-router')
    useLocalSearchParams.mockReturnValue({ id: 's1' })
  })

  it('renders the subject name and all topic names', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb(SUBJECT, TOPICS))
    setBest([
      { topicId: 't1', bestPct: 80 },
      { topicId: 't2', bestPct: 40 },
      { topicId: 't3', bestPct: 55 },
    ])
    render(<SubjectDetailsScreen />)
    // First render in the file pays jest-expo's one-time module-init cost, so this
    // first data-dependent assertion gets a generous timeout to avoid a cold-start flake.
    await waitFor(() => expect(screen.getByText('Algebra')).toBeTruthy(), { timeout: 15000 })
    expect(screen.getByText('Geometry')).toBeTruthy()
    expect(screen.getByText('Trigonometry')).toBeTruthy()
    // subject name appears in the header
    expect(screen.getAllByText('Mathematics').length).toBeGreaterThan(0)
  })

  it('shows "X%" for a topic with a best session', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb(SUBJECT, TOPICS))
    setBest([
      { topicId: 't1', bestPct: 80 },
      { topicId: 't2', bestPct: 40 },
      { topicId: 't3', bestPct: 55 },
    ])
    render(<SubjectDetailsScreen />)
    await waitFor(() => expect(screen.getByText('80%')).toBeTruthy(), { timeout: 5000 })
    expect(screen.getByText('40%')).toBeTruthy()
    expect(screen.getByText('55%')).toBeTruthy()
  })

  it('shows "—" and "No sessions yet" for a topic without a session', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb(SUBJECT, TOPICS))
    // only t1 has a record; t2 and t3 have none
    setBest([{ topicId: 't1', bestPct: 80 }])
    render(<SubjectDetailsScreen />)
    await waitFor(() => expect(screen.getByText('80%')).toBeTruthy())
    // t2 and t3 have no session → two "—" placeholders + two "No sessions yet"
    expect(screen.getAllByText('—').length).toBe(2)
    expect(screen.getAllByText('No sessions yet').length).toBe(2)
  })

  it('sorts topics lowest-readiness-first, then topics with no session last', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb(SUBJECT, TOPICS))
    // t1=80, t2=40, t3 has no session → order should be t2 (40), t1 (80), t3 (none)
    setBest([
      { topicId: 't1', bestPct: 80 },
      { topicId: 't2', bestPct: 40 },
    ])
    render(<SubjectDetailsScreen />)
    await waitFor(() => expect(screen.getByText('Geometry')).toBeTruthy())

    const algebraY = screen.getByText('Algebra').props // sanity it exists
    expect(algebraY).toBeTruthy()

    // Assert ordering via the rendered topic names sequence.
    const names = screen.getAllByTestId('topic-name').map(n => n.props.children)
    expect(names).toEqual(['Geometry', 'Algebra', 'Trigonometry'])
  })

  it('pushes /practice/<topicId> when a topic row is pressed', async () => {
    const { useDb } = require('../../../hooks/useDb')
    const { router } = require('expo-router')
    useDb.mockReturnValue(makeDb(SUBJECT, TOPICS))
    setBest([
      { topicId: 't1', bestPct: 80 },
      { topicId: 't2', bestPct: 40 },
      { topicId: 't3', bestPct: 55 },
    ])
    render(<SubjectDetailsScreen />)
    await waitFor(() => expect(screen.getByText('Geometry')).toBeTruthy())
    // Geometry (t2) is lowest readiness → first row
    fireEvent.press(screen.getByText('Geometry'))
    expect(router.push).toHaveBeenCalledWith('/practice/t2')
  })

  it('shows the empty state when the subject has no topics', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb(SUBJECT, []))
    setBest([])
    render(<SubjectDetailsScreen />)
    await waitFor(() => expect(screen.getByText('No topics in this subject yet.')).toBeTruthy())
  })
})
