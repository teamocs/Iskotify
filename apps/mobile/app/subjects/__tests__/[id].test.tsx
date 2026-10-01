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

const mockBp = { value: 'compact' as 'compact' | 'medium' | 'expanded' }
jest.mock('../../../hooks/useBreakpoint', () => {
  const actual = jest.requireActual('../../../hooks/useBreakpoint')
  return { ...actual, useBreakpoint: () => mockBp.value }
})

function flat(style: unknown): Record<string, any> {
  return Object.assign({}, ...[style].flat(Infinity as 1).filter(Boolean))
}

// The recent-accuracy aggregate is unit-tested in services/__tests__; here we
// control its output so the screen's compose + sort can be asserted. Topic
// readiness is the topic's OWN recent accuracy (A8) — no subject-level lift.
jest.mock('../../../services/homeAggregates', () => ({
  getTopicRecentAccuracy: jest.fn(),
  getSubjectRecentAccuracy: jest.fn().mockResolvedValue([]),
}))

// ---------------------------------------------------------------------------
// DB mock — the screen's cached fetcher runs, in order:
//   1. subject name: select().from().where().limit()
//   2. topics:       select().from().where()
// (getTopicRecentAccuracy is mocked separately, above.)
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
  const { getTopicRecentAccuracy } = require('../../../services/homeAggregates')
  getTopicRecentAccuracy.mockResolvedValue(map.map(r => ({ topicId: r.topicId, pct: r.bestPct, answered: 20 })))
}

describe('SubjectDetailsScreen ([id]) — readiness per topic', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockBp.value = 'compact'
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

  it('shows "X%" for a topic with enough recent answers', async () => {
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

  it('shows "—" and "Not started" for a topic without enough answers', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb(SUBJECT, TOPICS))
    // only t1 has a record; t2 and t3 have none
    setBest([{ topicId: 't1', bestPct: 80 }])
    render(<SubjectDetailsScreen />)
    await waitFor(() => expect(screen.getByText('80%')).toBeTruthy())
    // t2 and t3 have too few answers → two "—" placeholders + two "Not started"
    expect(screen.getAllByText('—').length).toBe(2)
    expect(screen.getAllByText('Not started').length).toBe(2)
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

  // A8: a topic is never lifted by its subject's overall result (the old
  // max(topic, subject) hid a weak topic behind a strong subject).
  it('a topic without its own enough answers stays Not started — no subject lift', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb(SUBJECT, TOPICS))
    setBest([{ topicId: 't1', bestPct: 90 }])
    render(<SubjectDetailsScreen />)
    await waitFor(() => expect(screen.getByText('90%')).toBeTruthy(), { timeout: 5000 })
    expect(screen.getAllByText('Not started').length).toBe(2)
  })

  it('a weak topic stays weak next to a strong one', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb(SUBJECT, TOPICS))
    setBest([{ topicId: 't1', bestPct: 90 }, { topicId: 't2', bestPct: 40 }])
    render(<SubjectDetailsScreen />)
    await waitFor(() => expect(screen.getByText('40%')).toBeTruthy(), { timeout: 5000 })
    const names = screen.getAllByTestId('topic-name').map(n => n.props.children)
    expect(names).toEqual(['Geometry', 'Algebra', 'Trigonometry'])
  })

  // ── Redesign M2: every data state, and neutral readiness ────────────────────
  describe('redesign M2 states', () => {
    it('shows skeletons (announced once) while topics load', () => {
      const { useDb } = require('../../../hooks/useDb')
      useDb.mockReturnValue({ select: () => ({ from: () => ({ where: () => ({ limit: () => new Promise(() => {}) }) }) }) })
      setBest([])
      render(<SubjectDetailsScreen />)
      expect(screen.getByLabelText('Loading topics')).toBeTruthy()
    })

    it('shows a retryable error when the subject fails to load', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
      const { useDb } = require('../../../hooks/useDb')
      // Every query fails until the student taps Try again; then a healthy db answers.
      const reject = () => Promise.reject(new Error('db'))
      // A lazy thenable: rejects only when awaited, so no stray unhandled rejection.
      const failing = { from: () => ({ where: () => ({ limit: reject, then: (ok: any, bad: any) => reject().then(ok, bad) }) }) }
      let current: any = { select: () => failing }
      useDb.mockReturnValue({ select: (...a: any[]) => current.select(...a) })
      setBest([{ topicId: 't1', bestPct: 80 }])
      render(<SubjectDetailsScreen />)
      await waitFor(() => expect(screen.getByText("Couldn't load this subject")).toBeTruthy())
      current = makeDb(SUBJECT, TOPICS)
      fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
      await waitFor(() => expect(screen.getByText('Algebra')).toBeTruthy())
      warn.mockRestore()
    })

    it('draws readiness in one neutral ink whatever the score', async () => {
      const { useDb } = require('../../../hooks/useDb')
      useDb.mockReturnValue(makeDb(SUBJECT, TOPICS))
      setBest([{ topicId: 't1', bestPct: 90 }, { topicId: 't2', bestPct: 20 }])
      render(<SubjectDetailsScreen />)
      await waitFor(() => expect(screen.getByText('90%')).toBeTruthy())
      const ink = (txt: string) => Object.assign({}, ...[screen.getByText(txt).props.style].flat(Infinity).filter(Boolean)).color
      expect(ink('90%')).toBe(ink('20%'))
      expect(screen.getAllByRole('progressbar').length).toBe(2)
    })
  })

  // ── Redesign M3: DetailTopBar + PageTitle, summary beside topics on desktop ──
  describe('redesign M3', () => {
    it('titles the page with the subject name as the h1 and a named back button', async () => {
      const { useDb } = require('../../../hooks/useDb')
      useDb.mockReturnValue(makeDb(SUBJECT, TOPICS))
      setBest([{ topicId: 't1', bestPct: 80 }])
      render(<SubjectDetailsScreen />)
      await waitFor(() => expect(screen.getByText('Algebra')).toBeTruthy())
      expect(screen.getByRole('header', { name: 'Mathematics' }).props['aria-level']).toBe(1)
      expect(screen.getByRole('button', { name: 'Go back' })).toBeTruthy()
    })

    it('summarises the subject: topics practised and the same subject readiness Progress shows', async () => {
      const { useDb } = require('../../../hooks/useDb')
      const { getSubjectRecentAccuracy } = require('../../../services/homeAggregates')
      useDb.mockReturnValue(makeDb(SUBJECT, TOPICS))
      setBest([{ topicId: 't1', bestPct: 80 }, { topicId: 't2', bestPct: 40 }])
      // Mock and drill answers count toward the subject even though they carry
      // no flashcard topic — so the headline is the subject figure, not a topic mean.
      getSubjectRecentAccuracy.mockResolvedValueOnce([{ subject: 'Mathematics', pct: 70, answered: 40 }])
      render(<SubjectDetailsScreen />)
      await waitFor(() => expect(screen.getByText('Algebra')).toBeTruthy())
      expect(screen.getByLabelText('Topics practised: 2 of 3')).toBeTruthy()
      expect(screen.getByLabelText('Subject readiness: 70 %')).toBeTruthy()
    })

    it('shows the subject as not started when it has too few answers overall', async () => {
      const { useDb } = require('../../../hooks/useDb')
      useDb.mockReturnValue(makeDb(SUBJECT, TOPICS))
      setBest([])
      render(<SubjectDetailsScreen />)
      await waitFor(() => expect(screen.getByText('Algebra')).toBeTruthy())
      expect(screen.getByLabelText('Subject readiness: None yet')).toBeTruthy()
    })

    it('puts the topics and the summary side by side on desktop', async () => {
      mockBp.value = 'expanded'
      const { useDb } = require('../../../hooks/useDb')
      useDb.mockReturnValue(makeDb(SUBJECT, TOPICS))
      setBest([{ topicId: 't1', bestPct: 80 }])
      render(<SubjectDetailsScreen />)
      await waitFor(() => expect(screen.getByText('Algebra')).toBeTruthy())
      expect(flat(screen.getByTestId('two-column').props.style).flexDirection).toBe('row')
      expect(flat(screen.getByTestId('screen-content').props.style).maxWidth).toBe(1040)
    })

    it('stacks to one column on phones', async () => {
      const { useDb } = require('../../../hooks/useDb')
      useDb.mockReturnValue(makeDb(SUBJECT, TOPICS))
      setBest([{ topicId: 't1', bestPct: 80 }])
      render(<SubjectDetailsScreen />)
      await waitFor(() => expect(screen.getByText('Algebra')).toBeTruthy())
      expect(flat(screen.getByTestId('two-column').props.style).flexDirection).toBe('column')
    })
  })
})
