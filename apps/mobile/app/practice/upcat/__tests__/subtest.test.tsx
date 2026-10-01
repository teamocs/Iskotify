import React from 'react'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react-native'
import { Alert } from 'react-native'
import UpcatExam from '../[subtest]'

// ---------------------------------------------------------------------------
// Mocks — same conventions as FlashcardExam.test.tsx / diagnostic/index.test.tsx
// ---------------------------------------------------------------------------

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockRouterBack = jest.fn()
let mockSearchParams: { subtest?: string; mode?: string } = {}

jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockPush(...a),
    replace: (...a: unknown[]) => mockReplace(...a),
    back: (...a: unknown[]) => mockRouterBack(...a),
  },
  useLocalSearchParams: () => mockSearchParams,
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}))

// QuestionNavigator uses a horizontal ScrollView with layout math not worth
// exercising here — render it shallowly, same as FlashcardExam.test.tsx.
jest.mock('../../../../components/upcat/QuestionNavigator', () => ({
  QuestionNavigator: ({ total, currentIdx }: { total: number; currentIdx: number }) => {
    const { Text } = require('react-native')
    return <Text testID="qnav">{`Q${currentIdx + 1}/${total}`}</Text>
  },
}))

// Redesign M3: the runner's frame changes with the window size class.
let mockBp: 'compact' | 'medium' | 'expanded' = 'compact'
jest.mock('../../../../hooks/useBreakpoint', () => ({
  ...jest.requireActual('../../../../hooks/useBreakpoint'),
  useBreakpoint: () => mockBp,
}))

jest.mock('../../../../services/questionReports', () => ({
  submitQuestionReport: jest.fn().mockResolvedValue(undefined),
}))

const mockRecordSession = jest.fn(() => Promise.resolve())
jest.mock('../../../../hooks/useRecordSession', () => ({
  useRecordSession: () => ({ recordSession: mockRecordSession }),
}))

const mockRecordAttempts = jest.fn().mockResolvedValue(undefined)
jest.mock('../../../../hooks/useRecordAttempts', () => ({
  useRecordAttempts: () => ({ recordAttempts: mockRecordAttempts }),
}))

// Post-session delta (Task 5): the screen snapshots the on-device estimate
// before and after writing this session's attempts, via the same pipeline
// hooks/useAdmissionEstimate.ts exposes for the results screen. Mocked here
// so this file doesn't need to simulate the full settings/attempts/cutoffs
// query chain — that pipeline has its own tests in useAdmissionEstimate.test.ts.
const mockLoadSnapshot = jest.fn()
jest.mock('../../../../hooks/useAdmissionEstimate', () => ({
  loadAdmissionEstimateSnapshot: (...args: unknown[]) => mockLoadSnapshot(...args),
}))

// Fix 1 — leave-confirmation + resume persistence. Behaviorally covered by
// their own unit tests; here we only observe how the screen calls them.
const mockUsePreventLeave = jest.fn()
jest.mock('../../../../hooks/usePreventLeave', () => ({
  usePreventLeave: (...a: unknown[]) => mockUsePreventLeave(...a),
}))

const mockSaveRun = jest.fn().mockResolvedValue(undefined)
const mockLoadRun = jest.fn().mockResolvedValue(null)
const mockClearRun = jest.fn().mockResolvedValue(undefined)
jest.mock('../../../../hooks/useExamRunPersistence', () => ({
  useExamRunPersistence: () => ({ saveRun: mockSaveRun, loadRun: mockLoadRun, clearRun: mockClearRun }),
}))

// P3 Full Access gates. Default: no limit (paywall flag off), so every test
// above runs exactly as before; the 'free limits' block below sets them.
const mockGate = { allowance: Infinity, fullMockAllowed: true }
jest.mock('../../../../services/premiumGate', () => ({
  practiceAllowanceNow: jest.fn(async () => mockGate.allowance),
  fullMockAllowedNow: jest.fn(async () => mockGate.fullMockAllowed),
}))

// The live premium state (default: flag off, no limit). Tests flip it and rerender.
const mockPremium = { enabled: false, isPremium: false, unlimited: true, loading: false }
jest.mock('../../../../hooks/usePremium', () => ({ usePremium: () => ({ ...mockPremium, refresh: async () => mockPremium.isPremium }) }))

// P4 unseen-first sampling: the student's last-seen map (default: nothing seen).
let mockLastSeen = new Map<string, number>()
const mockLastSeenOrEmpty = jest.fn(async (..._a: unknown[]) => mockLastSeen)
jest.mock('../../../../services/questionHistory', () => ({
  lastSeenOrEmpty: (...a: unknown[]) => mockLastSeenOrEmpty(...a),
  getOpenMistakeIds: jest.fn(async () => []),
}))

let mockQuestionRows: any[] = []
let mockPassageRows: any[] = []

// A single stable `db` object (NOT a fresh literal per call) — the screen's
// load effect depends on [db, subtestParam], so a fresh object per useDb()
// call would refire the fetch on every re-render and never settle in 'exam'.
jest.mock('../../../../hooks/useDb', () => {
  // A value that is BOTH directly awaitable (thenable) and chains `.where()` —
  // mirrors real drizzle's query builder, since the SUT awaits
  // `db.select().from(upcatPassages)` with no `.where()` at all, while
  // `db.select().from(upcatQuestions).where(...)` chains one.
  function fromResult(rows: any[]) {
    const p: any = Promise.resolve(rows)
    p.where = () => Promise.resolve(rows)
    return p
  }
  const db = {
    select: () => ({
      from: (table: unknown) => {
        const { upcatPassages: passagesTable } = require('../../../../db/schema')
        if (table === passagesTable) return fromResult(mockPassageRows)
        return fromResult(mockQuestionRows)
      },
    }),
  }
  return { useDb: () => db }
})

/** Fix 2: the last question opens a review sheet instead of submitting
 *  directly — drives that flow through to an actual submit() call. */
async function reviewAndConfirmSubmit(alertSpy: jest.SpyInstance) {
  fireEvent.press(screen.getByText('Review & submit'))
  fireEvent.press(await screen.findByRole('button', { name: /submit exam/i }))
  const call = alertSpy.mock.calls[alertSpy.mock.calls.length - 1]!
  const buttons = call[2] as { text: string; onPress?: () => void }[]
  await act(async () => {
    buttons.find(b => b.text.toLowerCase() === 'submit')!.onPress!()
  })
}

describe('UpcatExam', () => {
  let alertSpy: jest.SpyInstance

  beforeEach(() => {
    jest.useRealTimers()
    mockBp = 'compact'
    mockPush.mockReset()
    mockReplace.mockReset()
    mockRouterBack.mockClear()
    mockRecordSession.mockClear()
    mockRecordAttempts.mockClear()
    mockUsePreventLeave.mockClear()
    mockSaveRun.mockClear()
    mockLoadRun.mockClear().mockResolvedValue(null)
    mockClearRun.mockClear()
    mockSearchParams = {}
    mockGate.allowance = Infinity
    mockGate.fullMockAllowed = true
    Object.assign(mockPremium, { enabled: false, isPremium: false, unlimited: true, loading: false })
    mockQuestionRows = []
    mockPassageRows = []
    mockLoadSnapshot.mockReset()
    // Default: not ready either before or after — no prior estimate to compare.
    mockLoadSnapshot.mockResolvedValue({ status: 'not-ready', readiness: null, result: null })
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  })

  afterEach(() => alertSpy.mockRestore())

  it('P4: a new quick drill serves never-seen questions before seen ones', async () => {
    mockLastSeen = new Map()
    mockLastSeenOrEmpty.mockClear()
    mockSearchParams = { subtest: 'Mathematics', mode: 'quick' }
    mockQuestionRows = Array.from({ length: 30 }, (_, i) => ({
      questionId: `Q${i}`, subtest: 'Mathematics', questionText: `Question ${i}?`, options: JSON.stringify(['1', '2', '3', '4']),
      correctIndex: 1, explanation: '', setId: null, setPosition: null, topic: null,
    }))
    // Q0..Q14 were served before; Q15..Q29 never.
    mockLastSeen = new Map(Array.from({ length: 15 }, (_, i) => [`Q${i}`, 1000 + i]))
    render(<UpcatExam />)
    await waitFor(() => expect(mockSaveRun).toHaveBeenCalled())
    expect(mockLastSeenOrEmpty).toHaveBeenCalledWith(expect.anything(), 'upcat_questions', expect.arrayContaining(['Q0', 'Q29']))
    const ids = mockSaveRun.mock.calls[mockSaveRun.mock.calls.length - 1]![0].questionIds as string[]
    expect(ids).toHaveLength(15)
    expect(new Set(ids)).toEqual(new Set(Array.from({ length: 15 }, (_, i) => `Q${i + 15}`)))
    mockLastSeen = new Map()
  })

  it('P4: resuming a saved run never re-samples (no history lookup)', async () => {
    mockLastSeenOrEmpty.mockClear()
    mockSearchParams = { subtest: 'Mathematics', mode: 'quick' }
    mockQuestionRows = [
      { questionId: 'Q1', subtest: 'Mathematics', questionText: '1+1?', options: JSON.stringify(['1', '2', '3', '4']), correctIndex: 1, explanation: '', setId: null, setPosition: null, topic: null },
    ]
    mockLoadRun.mockResolvedValue({ runKey: 'upcat:Mathematics:quick', questionIds: ['Q1'], answers: {}, idx: 0, endTime: Date.now() + 60_000 })
    render(<UpcatExam />)
    fireEvent.press(await screen.findByText('Resume where you left off'))
    expect(await screen.findByText('1+1?')).toBeTruthy()
    expect(mockLastSeenOrEmpty).not.toHaveBeenCalled()
  })

  it('writes a question_attempts row per question (with topic) on submit (Task D)', async () => {
    mockSearchParams = { subtest: 'Mathematics' }
    mockQuestionRows = [
      { questionId: 'Q1', subtest: 'Mathematics', questionText: '1+1?', options: JSON.stringify(['1', '2', '3', '4']), correctIndex: 1, explanation: '', setId: null, setPosition: null, topic: 'Arithmetic' },
      { questionId: 'Q2', subtest: 'Mathematics', questionText: '2+2?', options: JSON.stringify(['1', '2', '3', '4']), correctIndex: 3, explanation: '', setId: null, setPosition: null, topic: 'Geometry' },
    ]

    render(<UpcatExam />)
    await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())

    fireEvent.press(screen.getByText('2')) // correct (index 1)
    fireEvent.press(screen.getByText('Next'))

    await waitFor(() => expect(screen.getByText('2+2?')).toBeTruthy())
    fireEvent.press(screen.getByText('4')) // correct (index 3)

    await reviewAndConfirmSubmit(alertSpy)

    expect(mockRecordAttempts).toHaveBeenCalledTimes(1)
    const rows = mockRecordAttempts.mock.calls[0]![0] as any[]
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      sourceTable: 'upcat_questions', listingSlug: 'upcat', questionId: 'Q1',
      subtest: 'Mathematics', topic: 'Arithmetic', selectedIndex: 1, correctIndex: 1, correct: true,
    })
    expect(rows[1]).toMatchObject({
      sourceTable: 'upcat_questions', listingSlug: 'upcat', questionId: 'Q2',
      subtest: 'Mathematics', topic: 'Geometry', selectedIndex: 3, correctIndex: 3, correct: true,
    })

    // recordSession (the aggregate practice_sessions row) still fires alongside.
    // A single-subtest run is a drill (A1) — never counted as a full mock.
    expect(mockRecordSession).toHaveBeenCalledWith(
      expect.objectContaining({ listingSlug: 'upcat', subtest: 'Mathematics', score: 2, total: 2, kind: 'drill', attemptKey: rows[0].sessionKey }),
    )
  })

  it('the all-subtests full run is the only upcat route recorded as a mock (A1)', async () => {
    mockSearchParams = { subtest: 'all', mode: 'full' }
    mockQuestionRows = [
      { questionId: 'Q1', subtest: 'Mathematics', questionText: '1+1?', options: JSON.stringify(['1', '2', '3', '4']), correctIndex: 1, explanation: '', setId: null, setPosition: null, topic: null },
    ]
    render(<UpcatExam />)
    await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
    fireEvent.press(screen.getByText('2'))
    await reviewAndConfirmSubmit(alertSpy)
    expect(mockRecordSession).toHaveBeenCalledWith(expect.objectContaining({ subtest: 'Mathematics', kind: 'mock' }))
  })

  it('records an incorrect attempt row when the selected answer is wrong', async () => {
    mockSearchParams = { subtest: 'Mathematics' }
    mockQuestionRows = [
      { questionId: 'Q1', subtest: 'Mathematics', questionText: '1+1?', options: JSON.stringify(['1', '2', '3', '4']), correctIndex: 1, explanation: '', setId: null, setPosition: null, topic: null },
    ]

    render(<UpcatExam />)
    await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())

    fireEvent.press(screen.getByText('1')) // wrong (correct is index 1)
    await reviewAndConfirmSubmit(alertSpy)

    const rows = mockRecordAttempts.mock.calls[0]![0] as any[]
    expect(rows[0]).toMatchObject({ selectedIndex: 0, correctIndex: 1, correct: false, topic: null })
  })

  it('finding #2: a rejected recordAttempts insert still reaches the results screen (telemetry is best-effort)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockRecordAttempts.mockRejectedValueOnce(new Error('disk full'))

    mockSearchParams = { subtest: 'Mathematics' }
    mockQuestionRows = [
      { questionId: 'Q1', subtest: 'Mathematics', questionText: '1+1?', options: JSON.stringify(['1', '2', '3', '4']), correctIndex: 1, explanation: '', setId: null, setPosition: null, topic: 'Arithmetic' },
    ]

    render(<UpcatExam />)
    await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
    fireEvent.press(screen.getByText('2'))

    await reviewAndConfirmSubmit(alertSpy)

    // Reached results despite the telemetry insert rejecting — not stranded
    // behind the double-submit guard.
    expect(screen.getByText('Per-subtest')).toBeTruthy()
    expect(warnSpy).toHaveBeenCalledWith('[practice/upcat/[subtest]] recordAttempts failed:', expect.any(Error))

    warnSpy.mockRestore()
  })

  it('shows the Estimated Admission Score delta when the student was already ready before the session', async () => {
    mockLoadSnapshot
      .mockResolvedValueOnce({ status: 'ready', readiness: null, result: { point: 2.35, low: 2.15, high: 2.55 } }) // before
      .mockResolvedValueOnce({ status: 'ready', readiness: null, result: { point: 2.31, low: 2.11, high: 2.51 } }) // after

    mockSearchParams = { subtest: 'Mathematics' }
    mockQuestionRows = [
      { questionId: 'Q1', subtest: 'Mathematics', questionText: '1+1?', options: JSON.stringify(['1', '2', '3', '4']), correctIndex: 1, explanation: '', setId: null, setPosition: null, topic: null },
    ]

    render(<UpcatExam />)
    await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
    fireEvent.press(screen.getByText('2'))
    await reviewAndConfirmSubmit(alertSpy)

    expect(await screen.findByText('Estimated Admission Score 2.35 → 2.31, lower is better')).toBeTruthy()
  })

  it('shows no delta when the student was not ready before the session', async () => {
    mockLoadSnapshot
      .mockResolvedValueOnce({ status: 'not-ready', readiness: null, result: null }) // before
      .mockResolvedValueOnce({ status: 'ready', readiness: null, result: { point: 2.31, low: 2.11, high: 2.51 } }) // after

    mockSearchParams = { subtest: 'Mathematics' }
    mockQuestionRows = [
      { questionId: 'Q1', subtest: 'Mathematics', questionText: '1+1?', options: JSON.stringify(['1', '2', '3', '4']), correctIndex: 1, explanation: '', setId: null, setPosition: null, topic: null },
    ]

    render(<UpcatExam />)
    await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
    fireEvent.press(screen.getByText('2'))
    await reviewAndConfirmSubmit(alertSpy)

    expect(screen.queryByText(/Estimated Admission Score/)).toBeNull()
  })

  // ── Fix 2: last-question safety ────────────────────────────────────────────
  it('Fix 2: the sole/last question never submits directly — it opens a review sheet', async () => {
    mockSearchParams = { subtest: 'Mathematics' }
    mockQuestionRows = [
      { questionId: 'Q1', subtest: 'Mathematics', questionText: '1+1?', options: JSON.stringify(['1', '2', '3', '4']), correctIndex: 1, explanation: '', setId: null, setPosition: null, topic: null },
    ]

    render(<UpcatExam />)
    await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
    fireEvent.press(screen.getByText('2'))

    expect(screen.queryByText('Submit')).toBeNull()
    fireEvent.press(screen.getByText('Review & submit'))

    expect(mockRecordAttempts).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: /submit exam/i })).toBeTruthy()
  })

  // ── Fix 3: neutral results ──────────────────────────────────────────────────
  it('Fix 3: results never show pass/fail verdict copy, and "Review mistakes" leads', async () => {
    mockSearchParams = { subtest: 'Mathematics' }
    mockQuestionRows = [
      { questionId: 'Q1', subtest: 'Mathematics', questionText: '1+1?', options: JSON.stringify(['1', '2', '3', '4']), correctIndex: 1, explanation: '', setId: null, setPosition: null, topic: null },
    ]

    render(<UpcatExam />)
    await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
    fireEvent.press(screen.getByText('1')) // wrong
    await reviewAndConfirmSubmit(alertSpy)

    const tree = JSON.stringify(screen.toJSON()).toLowerCase()
    expect(tree).not.toContain('great work')
    expect(tree).not.toContain('keep practicing')
    expect(screen.getByText('Review mistakes')).toBeTruthy()
    expect(screen.getByText('Retake exam')).toBeTruthy()
  })

  // ── Fix 1: leave-confirmation + persistence ────────────────────────────────
  it('Fix 1: guards leaving mid-exam and lets router.back() through once confirmed', async () => {
    mockSearchParams = { subtest: 'Mathematics' }
    mockQuestionRows = [
      { questionId: 'Q1', subtest: 'Mathematics', questionText: '1+1?', options: JSON.stringify(['1', '2', '3', '4']), correctIndex: 1, explanation: '', setId: null, setPosition: null, topic: null },
    ]

    render(<UpcatExam />)
    await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())

    expect(mockUsePreventLeave).toHaveBeenLastCalledWith(true, expect.any(Function))
    const onAttemptLeave = mockUsePreventLeave.mock.calls[mockUsePreventLeave.mock.calls.length - 1]![1] as () => void
    act(() => onAttemptLeave())

    expect(alertSpy).toHaveBeenCalledWith('Leave the exam?', 'Your progress is saved.', expect.any(Array))
    const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1]![2] as { text: string; onPress?: () => void }[]
    await act(async () => { buttons.find(b => b.text === 'Leave')!.onPress!() })
    await waitFor(() => expect(mockRouterBack).toHaveBeenCalled())
  })

  it('Fix 1: persists answers/position as the student answers questions', async () => {
    mockSearchParams = { subtest: 'Mathematics' }
    mockQuestionRows = [
      { questionId: 'Q1', subtest: 'Mathematics', questionText: '1+1?', options: JSON.stringify(['1', '2', '3', '4']), correctIndex: 1, explanation: '', setId: null, setPosition: null, topic: null },
    ]

    render(<UpcatExam />)
    await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
    fireEvent.press(screen.getByText('2'))

    await waitFor(() => expect(mockSaveRun).toHaveBeenCalled())
    const lastCall = mockSaveRun.mock.calls[mockSaveRun.mock.calls.length - 1]![0]
    expect(lastCall).toMatchObject({
      runKey: 'upcat:Mathematics:full',
      kind: 'upcat',
      answers: { 0: 1 },
      questionIds: ['Q1'],
    })
  })

  it('Fix 1: clears the saved run on submit', async () => {
    mockSearchParams = { subtest: 'Mathematics' }
    mockQuestionRows = [
      { questionId: 'Q1', subtest: 'Mathematics', questionText: '1+1?', options: JSON.stringify(['1', '2', '3', '4']), correctIndex: 1, explanation: '', setId: null, setPosition: null, topic: null },
    ]

    render(<UpcatExam />)
    await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
    fireEvent.press(screen.getByText('2'))
    await reviewAndConfirmSubmit(alertSpy)

    expect(mockClearRun).toHaveBeenCalledWith('upcat:Mathematics:full')
  })

  it('Fix 1: offers a resume prompt when a saved run exists, and restores it', async () => {
    mockSearchParams = { subtest: 'Mathematics' }
    mockQuestionRows = [
      { questionId: 'Q1', subtest: 'Mathematics', questionText: '1+1?', options: JSON.stringify(['1', '2', '3', '4']), correctIndex: 1, explanation: '', setId: null, setPosition: null, topic: null },
      { questionId: 'Q2', subtest: 'Mathematics', questionText: '2+2?', options: JSON.stringify(['1', '2', '3', '4']), correctIndex: 3, explanation: '', setId: null, setPosition: null, topic: null },
    ]
    mockLoadRun.mockResolvedValue({
      runKey: 'upcat:Mathematics:full', kind: 'upcat', slug: 'Mathematics', mode: 'full',
      questionIds: ['Q2', 'Q1'], sectionNames: ['Mathematics', 'Mathematics'],
      answers: { 0: 3 }, idx: 1, sectionIdx: 0, floorIdx: 0,
      endTime: Date.now() + 60_000, sectionEndTime: null, startedAt: Date.now(), updatedAt: Date.now(),
    })

    render(<UpcatExam />)
    await waitFor(() => expect(screen.getByText('Resume where you left off')).toBeTruthy())
    fireEvent.press(screen.getByText('Resume where you left off'))

    // Resumed straight into the saved position (idx 1 of [Q2, Q1] -> "1+1?").
    await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
  })

  // Review finding #1 (HIGH): reorderByIds compacts away a vanished question —
  // answers/idx keyed by the ORIGINAL saved order must be remapped or they
  // land on the wrong question.
  it('restores answers onto the right questions when a question was removed from the pool since saving', async () => {
    mockSearchParams = { subtest: 'Mathematics' }
    mockQuestionRows = [
      { questionId: 'Q1', subtest: 'Mathematics', questionText: '1+1?', options: JSON.stringify(['1', '2', '3', '4']), correctIndex: 1, explanation: '', setId: null, setPosition: null, topic: null },
      // Q2 has since been removed from the bank — only Q1 and Q3 remain.
      { questionId: 'Q3', subtest: 'Mathematics', questionText: '5+5?', options: JSON.stringify(['9', '10', '11', '12']), correctIndex: 1, explanation: '', setId: null, setPosition: null, topic: null },
    ]
    mockLoadRun.mockResolvedValue({
      runKey: 'upcat:Mathematics:full', kind: 'upcat', slug: 'Mathematics', mode: 'full',
      questionIds: ['Q1', 'Q2', 'Q3'], sectionNames: ['Mathematics', 'Mathematics', 'Mathematics'],
      answers: { 0: 1, 1: 2, 2: 3 }, // Q1 -> '2', Q2 -> vanishes, Q3 -> '12'
      idx: 2, sectionIdx: 0, floorIdx: 0,
      endTime: Date.now() + 60_000, sectionEndTime: null, startedAt: Date.now(), updatedAt: Date.now(),
    })

    render(<UpcatExam />)
    await waitFor(() => expect(screen.getByText('Resume where you left off')).toBeTruthy())
    fireEvent.press(screen.getByText('Resume where you left off'))

    // idx 2 pointed at Q3; after compaction ([Q1, Q3]) Q3 sits at index 1.
    await waitFor(() => expect(screen.getByText('5+5?')).toBeTruthy())
    expect(screen.getByRole('radio', { name: '12', checked: true })).toBeTruthy()

    fireEvent.press(screen.getByText('Back'))
    await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
    expect(screen.getByRole('radio', { name: '2', checked: true })).toBeTruthy()
  })

  // Review finding #2 (HIGH): submit() stays in phase 'exam' through its
  // awaits — a state change during that window would re-trigger the save
  // effect and resurrect the just-cleared run.
  it('never re-saves the run once submit has started, even if state changes mid-submit', async () => {
    let resolveAttempts!: () => void
    mockRecordAttempts.mockImplementationOnce(
      () => new Promise<void>(resolve => { resolveAttempts = () => resolve(undefined) }),
    )

    mockSearchParams = { subtest: 'Mathematics' }
    mockQuestionRows = [
      { questionId: 'Q1', subtest: 'Mathematics', questionText: '1+1?', options: JSON.stringify(['1', '2', '3', '4']), correctIndex: 1, explanation: '', setId: null, setPosition: null, topic: null },
    ]

    render(<UpcatExam />)
    await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
    fireEvent.press(screen.getByText('2'))

    fireEvent.press(screen.getByText('Review & submit'))
    fireEvent.press(await screen.findByRole('button', { name: /submit exam/i }))
    const call = alertSpy.mock.calls[alertSpy.mock.calls.length - 1]!
    const buttons = call[2] as { text: string; onPress?: () => void }[]

    await act(async () => {
      buttons.find(b => b.text.toLowerCase() === 'submit')!.onPress!()
    })
    const saveCallsAtSubmitStart = mockSaveRun.mock.calls.length
    expect(mockClearRun).toHaveBeenCalledWith('upcat:Mathematics:full')

    fireEvent.press(screen.getByText('1')) // would flip the answer if not disabled
    expect(mockSaveRun.mock.calls.length).toBe(saveCallsAtSubmitStart)

    await act(async () => { resolveAttempts() })
    await waitFor(() => expect(screen.getByText('Per-subtest')).toBeTruthy())
    expect(mockSaveRun.mock.calls.length).toBe(saveCallsAtSubmitStart)
  })

  it('Fix 1: "Start over" discards the saved run and builds a fresh sample', async () => {
    mockSearchParams = { subtest: 'Mathematics' }
    mockQuestionRows = [
      { questionId: 'Q1', subtest: 'Mathematics', questionText: '1+1?', options: JSON.stringify(['1', '2', '3', '4']), correctIndex: 1, explanation: '', setId: null, setPosition: null, topic: null },
    ]
    mockLoadRun.mockResolvedValue({
      runKey: 'upcat:Mathematics:full', kind: 'upcat', slug: 'Mathematics', mode: 'full',
      questionIds: ['Q1'], sectionNames: ['Mathematics'],
      answers: { 0: 2 }, idx: 0, sectionIdx: 0, floorIdx: 0,
      endTime: Date.now() + 60_000, sectionEndTime: null, startedAt: Date.now(), updatedAt: Date.now(),
    })

    render(<UpcatExam />)
    await waitFor(() => expect(screen.getByText('Resume where you left off')).toBeTruthy())
    fireEvent.press(screen.getByText('Start over'))

    await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
    expect(mockClearRun).toHaveBeenCalledWith('upcat:Mathematics:full')
    // Fresh start — the previously-saved answer must not carry over.
    // (Redesign M3: the 30px QuestionNavigator strip is gone; the header's
    // "Question n of N" is the position readout now.)
    expect(screen.getByText('Question 1 of 1')).toBeTruthy()
    expect(screen.queryByRole('radio', { checked: true })).toBeNull()
  })

  // ── Redesign M3: the focus-mode frame shared with exam/[slug].tsx ──────────
  describe('focus-mode frame (redesign M3)', () => {
    const flat = (el: any) => Object.assign({}, ...[el.props.style].flat(Infinity).filter(Boolean))
    const TWO = [
      { questionId: 'Q1', subtest: 'Mathematics', questionText: '1+1?', options: JSON.stringify(['1', '2', '3', '4']), correctIndex: 1, explanation: '', setId: null, setPosition: null, topic: null },
      { questionId: 'Q2', subtest: 'Mathematics', questionText: '2+2?', options: JSON.stringify(['1', '2', '3', '4']), correctIndex: 3, explanation: '', setId: null, setPosition: null, topic: null },
    ]
    async function start() {
      mockSearchParams = { subtest: 'Mathematics' }
      mockQuestionRows = TWO
      render(<UpcatExam />)
      await waitFor(() => expect(screen.getByText('Question 1 of 2')).toBeTruthy())
    }

    it('loads behind an announced skeleton, not a bare line of text', async () => {
      mockSearchParams = { subtest: 'Mathematics' }
      mockQuestionRows = TWO
      render(<UpcatExam />)
      expect(screen.getByLabelText('Loading exam')).toBeTruthy()
      expect(screen.queryByText(/Loading exam…/)).toBeNull()
      await waitFor(() => expect(screen.getByText('Question 1 of 2')).toBeTruthy())
    })

    it('says so on a page with one way back when the subtest has no questions', async () => {
      mockSearchParams = { subtest: 'Mathematics' }
      mockQuestionRows = []
      render(<UpcatExam />)
      expect(await screen.findByText('No questions for this subtest yet')).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: 'Back to UPCAT practice' }))
      expect(mockReplace).toHaveBeenCalledWith('/practice/upcat')
    })

    it('a failed question load offers a retry (not the "no questions" page), and Try again reloads', async () => {
      mockSearchParams = { subtest: 'Mathematics' }
      mockQuestionRows = TWO
      mockLoadRun.mockRejectedValueOnce(new Error('storage unavailable'))
      render(<UpcatExam />)
      expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy()
      expect(screen.getByText("Couldn't load the questions")).toBeTruthy()
      expect(screen.queryByText('No questions for this subtest yet')).toBeNull()
      expect(mockLoadRun).toHaveBeenCalledTimes(1)

      fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
      await waitFor(() => expect(screen.getByText('Question 1 of 2')).toBeTruthy())
      expect(mockLoadRun).toHaveBeenCalledTimes(2)
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    })

    it('asks to resume on a titled page', async () => {
      mockSearchParams = { subtest: 'Mathematics' }
      mockQuestionRows = TWO
      mockLoadRun.mockResolvedValue({
        runKey: 'upcat:Mathematics:full', kind: 'upcat', slug: 'Mathematics', mode: 'full',
        questionIds: ['Q1'], sectionNames: ['Mathematics'], answers: {}, idx: 0, sectionIdx: 0, floorIdx: 0,
        endTime: Date.now() + 60_000, sectionEndTime: null, startedAt: Date.now(), updatedAt: Date.now(),
      })
      render(<UpcatExam />)
      expect(await screen.findByRole('header', { name: 'Resume where you left off?' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Resume where you left off' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Start over' })).toBeTruthy()
    })

    it('reads the time left as a named tabular timer with no glyph in the text', async () => {
      await start()
      expect(screen.getByLabelText(/^Time left: \d{2}:\d{2}$/)).toBeTruthy()
      const clock = screen.getByText(/\d{2}:\d{2}/)
      expect(String(clock.props.children)).toMatch(/^\d{1,2}:\d{2}$/)
      expect(flat(clock).fontVariant).toEqual(['tabular-nums'])
      expect(JSON.stringify(screen.toJSON())).not.toMatch(/⏱/)
    })

    it('has a 44pt, named Leave control', async () => {
      await start()
      const leave = screen.getByRole('button', { name: 'Leave exam' })
      expect(flat(leave).minWidth ?? flat(leave).width).toBeGreaterThanOrEqual(44)
    })

    it('on phones keeps the navigator in a sheet opened from the header (no 30px strip)', async () => {
      await start()
      expect(screen.queryByTestId('qnav')).toBeNull()
      expect(screen.queryByTestId('question-nav-panel')).toBeNull()
      fireEvent.press(screen.getByRole('button', { name: 'All questions' }))
      expect(await screen.findByText('Review your answers')).toBeTruthy()
    })

    it('on expanded widths shows the navigator as a side panel with 44pt cells and the current cell named', async () => {
      mockBp = 'expanded'
      await start()
      const panel = screen.getByTestId('question-nav-panel')
      expect(screen.queryByRole('button', { name: 'All questions' })).toBeNull()
      const cells = within(panel).getAllByLabelText(/^Question \d+, /)
      expect(cells).toHaveLength(2)
      for (const c of cells) {
        expect(flat(c).minWidth ?? flat(c).width).toBeGreaterThanOrEqual(44)
        expect(flat(c).minHeight ?? flat(c).height).toBeGreaterThanOrEqual(44)
      }
      expect(within(panel).getByLabelText('Question 1, unanswered, current question')).toBeTruthy()
      fireEvent.press(within(panel).getByLabelText('Question 2, unanswered'))
      await waitFor(() => expect(screen.getByText('Question 2 of 2')).toBeTruthy())
    })

    it('caps the reading column at 720 and puts the options directly under the question', async () => {
      mockBp = 'expanded'
      await start()
      const col = screen.getByTestId('runner-reading-column')
      expect(flat(col).maxWidth).toBeLessThanOrEqual(720)
      expect(within(col).getByRole('radio', { name: '4' })).toBeTruthy()
    })

    it('keeps Back / Skip / Next inside the capped column, not stretched across the window', async () => {
      mockBp = 'expanded'
      await start()
      const footer = screen.getByTestId('runner-footer')
      expect(flat(footer).maxWidth).toBeLessThanOrEqual(720)
      expect(within(footer).getByRole('button', { name: 'Next' })).toBeTruthy()
      expect(within(footer).getByRole('button', { name: 'Skip' })).toBeTruthy()
      expect(within(footer).getByRole('button', { name: 'Back' })).toBeTruthy()
    })

    it('shows results on a titled page with a neutral score', async () => {
      await start()
      fireEvent.press(screen.getByRole('button', { name: 'All questions' }))
      fireEvent.press(await screen.findByRole('button', { name: /submit exam/i }))
      const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1]![2] as { text: string; onPress?: () => void }[]
      await act(async () => { buttons.find(b => b.text === 'Submit')!.onPress!() })
      expect(await screen.findByRole('header', { name: 'Tapos na! Practice complete.' })).toBeTruthy()
      expect(screen.getByTestId('screen-scroll')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Back to exams' })).toBeTruthy()
    })
  })
  describe('free limits (P3 Full Access)', () => {
    // A cap only ever shows to a free student with the paywall on.
    beforeEach(() => { Object.assign(mockPremium, { enabled: true, unlimited: false }) })
    const q = (n: number) => ({
      questionId: `Q${n}`, subtest: 'Mathematics', questionText: `${n}+${n}?`, options: JSON.stringify(['1', '2', '3', '4']),
      correctIndex: 1, explanation: '', setId: null, setPosition: null, topic: null,
    })

    it('stops at the daily cap with a friendly card linking to /upgrade', async () => {
      mockSearchParams = { subtest: 'Mathematics', mode: 'quick' }
      mockQuestionRows = [q(1), q(2)]
      mockGate.allowance = 0
      render(<UpcatExam />)
      expect(await screen.findByText("You've done your 30 free questions today. Come back tomorrow, or unlock unlimited practice.")).toBeTruthy()
      expect(screen.queryByText('1+1?')).toBeNull()
      fireEvent.press(screen.getByRole('button', { name: 'Unlock Full Access' }))
      expect(mockPush).toHaveBeenCalledWith('/upgrade?from=practice_cap')
    })

    it('leaves the cap and starts the run once Full Access arrives', async () => {
      mockSearchParams = { subtest: 'Mathematics', mode: 'quick' }
      mockQuestionRows = [q(1), q(2)]
      mockGate.allowance = 0
      const { rerender } = render(<UpcatExam />)
      expect(await screen.findByText(/free questions today/)).toBeTruthy()
      mockGate.allowance = Infinity
      Object.assign(mockPremium, { isPremium: true, unlimited: true })
      await act(async () => { rerender(<UpcatExam />) })
      await waitFor(() => expect(screen.getByText(/Question 1 of 2/)).toBeTruthy())
      expect(screen.queryByText(/free questions today/)).toBeNull()
    })

    it('never cuts a reading passage set in half at the daily cap', async () => {
      mockSearchParams = { subtest: 'Reading Comprehension', mode: 'quick' }
      const r = (n: number, setId: string | null, setPosition: number | null) => ({
        ...q(n), subtest: 'Reading Comprehension', setId, setPosition,
      })
      mockQuestionRows = [r(1, 'S1', 1), r(2, 'S1', 2), r(3, 'S1', 3)]
      mockPassageRows = [{ setId: 'S1', subtest: 'Reading Comprehension', passageText: 'A passage.' }]
      mockGate.allowance = 2
      render(<UpcatExam />)
      await waitFor(() => expect(screen.getByText(/Question 1 of 3/)).toBeTruthy())
    })

    it("serves only what is left of today's free questions", async () => {
      mockSearchParams = { subtest: 'Mathematics', mode: 'quick' }
      mockQuestionRows = [q(1), q(2), q(3)]
      mockGate.allowance = 1
      render(<UpcatExam />)
      await waitFor(() => expect(screen.getByText(/Question 1 of 1/)).toBeTruthy())
    })

    it('the full four-subtest mock is gated as a full mock, not as practice', async () => {
      mockSearchParams = { subtest: 'all', mode: 'full' }
      mockQuestionRows = [q(1)]
      mockGate.allowance = 0
      mockGate.fullMockAllowed = false
      render(<UpcatExam />)
      expect(await screen.findByText(/used your free full mock/i)).toBeTruthy()
    })

    it('a saved run can always be resumed', async () => {
      mockSearchParams = { subtest: 'Mathematics' }
      mockQuestionRows = [q(1), q(2)]
      mockGate.allowance = 0
      mockLoadRun.mockResolvedValue({
        runKey: 'upcat:Mathematics:full', kind: 'upcat', slug: 'Mathematics', mode: 'full',
        questionIds: ['Q1', 'Q2'], sectionNames: ['Mathematics', 'Mathematics'],
        answers: {}, idx: 0, sectionIdx: 0, floorIdx: 0,
        endTime: Date.now() + 60_000, sectionEndTime: null, startedAt: Date.now(), updatedAt: Date.now(),
      })
      render(<UpcatExam />)
      fireEvent.press(await screen.findByText('Resume where you left off'))
      await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
    })
  })
})

