import React from 'react'
import { lightTheme } from '../../../../theme/tokens'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react-native'
import { Alert } from 'react-native'
import DiagnosticExam from '../index'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockBack = jest.fn()
let mockSearchParams: { subject?: string | string[]; exam?: string | string[] } = {}

// Batch D: which exam the diagnostic samples is resolved from the focus list +
// runnable blueprints; defaults (no focus, nothing runnable) keep the UPCAT diagnostic.
let mockFocusSlugs: string[] = []
let mockRunnable: { slug: string; name: string; acronym: string }[] = []
let mockSources: Record<string, unknown> = {}
let mockLookupError: Error | null = null
let mockSourceGate: Promise<void> | null = null
jest.mock('../../../../services/diagnosticSource', () => ({
  listFocusExamSlugs: () => (mockLookupError ? Promise.reject(mockLookupError) : Promise.resolve(mockFocusSlugs)),
  listRunnableDiagnosticBlueprints: () => (mockLookupError ? Promise.reject(mockLookupError) : Promise.resolve(mockRunnable)),
  loadBlueprintDiagnosticSource: async (_db: unknown, slug: string) => {
    if (mockSourceGate) await mockSourceGate
    return mockSources[slug] ?? null
  },
}))

// Exams with review topics (services/practiceSignals.hasReviewContent: the one
// source of truth the listing, school and Today pages use too).
let mockReviewSlugs: string[] = []
jest.mock('../../../../services/practiceSignals', () => ({
  hasReviewContent: async (_db: unknown, slug: string) => mockReviewSlugs.includes(slug),
}))

jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: (...a: unknown[]) => mockReplace(...a), back: () => mockBack() },
  useLocalSearchParams: () => mockSearchParams,
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// Redesign M3: the runner's frame changes with the window size class.
let mockBp: 'compact' | 'medium' | 'expanded' = 'compact'
jest.mock('../../../../hooks/useBreakpoint', () => ({
  ...jest.requireActual('../../../../hooks/useBreakpoint'),
  useBreakpoint: () => mockBp,
}))

const mockRecordSession = jest.fn(() => Promise.resolve())
jest.mock('../../../../hooks/useRecordSession', () => ({
  useRecordSession: () => ({ recordSession: mockRecordSession }),
}))

const mockRecordAttempts = jest.fn().mockResolvedValue(undefined)
jest.mock('../../../../hooks/useRecordAttempts', () => ({
  useRecordAttempts: () => ({ recordAttempts: mockRecordAttempts }),
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

let mockBankRows: any[] = []
// Return a STABLE db reference (like the real Context-provided client) so the
// screen's load effect (deps: [db, subjectParam]) doesn't refire on every
// re-render — a fresh object per call would re-trigger the fetch after submit
// and clobber the just-set 'results' phase.
jest.mock('../../../../hooks/useDb', () => {
  const db = { select: () => ({ from: () => ({ where: () => Promise.resolve(mockBankRows) }) }) }
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

describe('DiagnosticExam', () => {
  let alertSpy: jest.SpyInstance

  beforeEach(() => {
    jest.useRealTimers()
    mockBp = 'compact'
    mockPush.mockReset()
    mockReplace.mockReset()
    mockBack.mockReset()
    mockRecordSession.mockClear()
    mockRecordAttempts.mockClear()
    mockUsePreventLeave.mockClear()
    mockSaveRun.mockClear()
    mockLoadRun.mockClear().mockResolvedValue(null)
    mockClearRun.mockClear()
    mockSearchParams = {}
    mockBankRows = []
    mockFocusSlugs = []
    mockRunnable = []
    mockSources = {}
    mockLookupError = null
    mockSourceGate = null
    mockReviewSlugs = []
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  })

  afterEach(() => alertSpy.mockRestore())

  it('falls back to bundled questions when the exam-tagged bank has none for the subject', async () => {
    mockSearchParams = { subject: 'Mathematics' }
    render(<DiagnosticExam />)

    // The bundled Mathematics question stems render (empty bank falls back to the bundle).
    await waitFor(() => expect(screen.getByText('If 2x + 5 = 13, what is the value of x?')).toBeTruthy())
    expect(screen.getAllByText('Mathematics').length).toBeGreaterThan(0)
  })

  // A5: the bundled fallback is not an upcat_questions row, so its answers are
  // scored but never recorded as attempts under that source.
  it('does not record question_attempts for bundled fallback questions, but still records the session', async () => {
    mockSearchParams = { subject: 'Mathematics' }
    render(<DiagnosticExam />)
    await waitFor(() => expect(screen.getByText('If 2x + 5 = 13, what is the value of x?')).toBeTruthy())
    // Skip to the last bundled question, answer nothing else, and submit.
    for (let i = 0; i < 20 && !screen.queryByText('Review & submit'); i++) fireEvent.press(screen.getByText('Skip'))
    await reviewAndConfirmSubmit(alertSpy)
    await waitFor(() => expect(mockRecordSession).toHaveBeenCalledTimes(1))
    expect(mockRecordAttempts).not.toHaveBeenCalled()
  })

  it('shows the empty state instead of cross-subject bundled questions when nothing exists for the subject', async () => {
    mockSearchParams = { subject: 'Reading Comprehension' }
    render(<DiagnosticExam />)
    await waitFor(() => expect(screen.getByText('No diagnostic questions yet')).toBeTruthy())
    // Nothing from the bundle (English / Filipino / Abstract Reasoning...) leaks in.
    expect(screen.queryByText(/Question 1/)).toBeNull()
  })

  it('builds questions from the bank when it has rows for the requested subject', async () => {
    mockSearchParams = { subject: 'Science' }
    mockBankRows = [
      { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null },
    ]
    render(<DiagnosticExam />)

    await waitFor(() => expect(screen.getByText('Sci Q1')).toBeTruthy())
  })

  it('answers and submits, recording a session per subject and reaching results', async () => {
    mockSearchParams = { subject: 'Science' }
    mockBankRows = [
      { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null },
    ]
    render(<DiagnosticExam />)

    await waitFor(() => expect(screen.getByText('Sci Q1')).toBeTruthy())

    fireEvent.press(screen.getByText('a'))
    await reviewAndConfirmSubmit(alertSpy)

    await waitFor(() => expect(mockRecordSession).toHaveBeenCalledTimes(1))
    expect(mockRecordSession).toHaveBeenCalledWith(expect.objectContaining({
      listingSlug: 'upcat', topicId: '', subtest: 'Science', score: 1, total: 1, kind: 'diagnostic',
    }))

    await waitFor(() => expect(screen.getByText('Diagnostic results')).toBeTruthy())
    expect(screen.getByText('Back to Home')).toBeTruthy()
  })

  it('writes a question_attempts row per question on submit (Task D)', async () => {
    mockSearchParams = { subject: 'Science' }
    mockBankRows = [
      { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null },
    ]
    render(<DiagnosticExam />)
    await waitFor(() => expect(screen.getByText('Sci Q1')).toBeTruthy())

    fireEvent.press(screen.getByText('a'))
    await reviewAndConfirmSubmit(alertSpy)

    await waitFor(() => expect(mockRecordAttempts).toHaveBeenCalledTimes(1))
    const rows = mockRecordAttempts.mock.calls[0]![0] as any[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      sourceTable: 'upcat_questions',
      listingSlug: 'upcat',
      questionId: 'S1',
      subtest: 'Science',
      selectedIndex: 0,
      correctIndex: 0,
      correct: true,
    })
    expect(typeof rows[0].elapsedMs).toBe('number')
    expect(typeof rows[0].answeredAt).toBe('number')
  })

  it('finding #2: a rejected recordAttempts insert still reaches the results screen (telemetry is best-effort)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockRecordAttempts.mockRejectedValueOnce(new Error('disk full'))

    mockSearchParams = { subject: 'Science' }
    mockBankRows = [
      { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null },
    ]
    render(<DiagnosticExam />)
    await waitFor(() => expect(screen.getByText('Sci Q1')).toBeTruthy())

    fireEvent.press(screen.getByText('a'))
    await reviewAndConfirmSubmit(alertSpy)

    // Reached results despite the telemetry insert rejecting — not stranded
    // behind the double-submit guard.
    await waitFor(() => expect(screen.getByText('Diagnostic results')).toBeTruthy())
    expect(warnSpy).toHaveBeenCalledWith('[practice/diagnostic] recordAttempts failed:', expect.any(Error))

    warnSpy.mockRestore()
  })

  it('selecting an option marks that option, and only that one, as the checked radio', async () => {
    mockSearchParams = { subject: 'Science' }
    mockBankRows = [
      { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null },
    ]
    render(<DiagnosticExam />)
    await waitFor(() => expect(screen.getByText('Sci Q1')).toBeTruthy())

    fireEvent.press(screen.getByText('b'))

    expect(screen.getAllByRole('radio')).toHaveLength(4)
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1)
  })

  it('"Back to Home" routes to the tabs root', async () => {
    mockSearchParams = { subject: 'Science' }
    mockBankRows = [
      { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null },
    ]
    render(<DiagnosticExam />)
    await waitFor(() => expect(screen.getByText('Sci Q1')).toBeTruthy())
    fireEvent.press(screen.getByText('a'))
    await reviewAndConfirmSubmit(alertSpy)
    await waitFor(() => expect(screen.getByText('Diagnostic results')).toBeTruthy())

    fireEvent.press(screen.getByText('Back to Home'))
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)')
  })

  it('"Practice weakest subject" routes to the UPCAT drill for that subtest', async () => {
    mockSearchParams = { subject: 'Science' }
    mockBankRows = [
      { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 1, explanation: '', setId: null },
    ]
    render(<DiagnosticExam />)
    await waitFor(() => expect(screen.getByText('Sci Q1')).toBeTruthy())
    fireEvent.press(screen.getByText('a')) // wrong answer (correctIndex is 1)
    await reviewAndConfirmSubmit(alertSpy)
    await waitFor(() => expect(screen.getByText('Diagnostic results')).toBeTruthy())

    fireEvent.press(screen.getByText('Practice weakest subject (Science)'))
    expect(mockPush).toHaveBeenCalledWith('/practice/upcat/Science?mode=quick')
  })

  it('url-encodes a multi-word weakest subtest in the drill route', async () => {
    mockSearchParams = { subject: 'Reading Comprehension' }
    mockBankRows = [
      { questionId: 'R1', subtest: 'Reading Comprehension', questionText: 'RC Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 1, explanation: '', setId: null },
    ]
    render(<DiagnosticExam />)
    await waitFor(() => expect(screen.getByText('RC Q1')).toBeTruthy())
    fireEvent.press(screen.getByText('a'))
    await reviewAndConfirmSubmit(alertSpy)
    await waitFor(() => expect(screen.getByText('Diagnostic results')).toBeTruthy())
    fireEvent.press(screen.getByText('Practice weakest subject (Reading Comprehension)'))
    expect(mockPush).toHaveBeenCalledWith('/practice/upcat/Reading%20Comprehension?mode=quick')
  })

  // ── Fix 2: last-question safety ────────────────────────────────────────────
  it('Fix 2: the last question never submits directly — it opens a review sheet', async () => {
    mockSearchParams = { subject: 'Science' }
    mockBankRows = [
      { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null },
    ]
    render(<DiagnosticExam />)
    await waitFor(() => expect(screen.getByText('Sci Q1')).toBeTruthy())
    fireEvent.press(screen.getByText('a'))

    expect(screen.queryByText('Submit')).toBeNull()
    expect(screen.queryByText('Finish')).toBeNull()
    fireEvent.press(screen.getByText('Review & submit'))

    expect(mockRecordAttempts).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: /submit exam/i })).toBeTruthy()
  })

  // ── Fix 1: leave-confirmation + persistence ────────────────────────────────
  it('Fix 1: guards leaving mid-exam and lets router.back() through once confirmed', async () => {
    mockSearchParams = { subject: 'Science' }
    mockBankRows = [
      { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null },
    ]
    render(<DiagnosticExam />)
    await waitFor(() => expect(screen.getByText('Sci Q1')).toBeTruthy())

    expect(mockUsePreventLeave).toHaveBeenLastCalledWith(true, expect.any(Function))
    const onAttemptLeave = mockUsePreventLeave.mock.calls[mockUsePreventLeave.mock.calls.length - 1]![1] as () => void
    act(() => onAttemptLeave())

    expect(alertSpy).toHaveBeenCalledWith('Leave the exam?', 'Your progress is saved.', expect.any(Array))
    const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1]![2] as { text: string; onPress?: () => void }[]
    await act(async () => { buttons.find(b => b.text === 'Leave')!.onPress!() })
    await waitFor(() => expect(mockBack).toHaveBeenCalled())
  })

  it('Fix 1: persists answers/position as the student answers questions', async () => {
    mockSearchParams = { subject: 'Science' }
    mockBankRows = [
      { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null },
    ]
    render(<DiagnosticExam />)
    await waitFor(() => expect(screen.getByText('Sci Q1')).toBeTruthy())
    fireEvent.press(screen.getByText('a'))

    await waitFor(() => expect(mockSaveRun).toHaveBeenCalled())
    const lastCall = mockSaveRun.mock.calls[mockSaveRun.mock.calls.length - 1]![0]
    expect(lastCall).toMatchObject({ runKey: 'diagnostic:Science', kind: 'diagnostic', answers: { 0: 0 } })
  })

  it('Fix 1: clears the saved run on submit', async () => {
    mockSearchParams = { subject: 'Science' }
    mockBankRows = [
      { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null },
    ]
    render(<DiagnosticExam />)
    await waitFor(() => expect(screen.getByText('Sci Q1')).toBeTruthy())
    fireEvent.press(screen.getByText('a'))
    await reviewAndConfirmSubmit(alertSpy)

    expect(mockClearRun).toHaveBeenCalledWith('diagnostic:Science')
  })

  it('Fix 1: offers a resume prompt when a saved run exists, and restores it', async () => {
    mockSearchParams = { subject: 'Science' }
    mockBankRows = [
      { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null },
    ]
    mockLoadRun.mockResolvedValue({
      runKey: 'diagnostic:Science', kind: 'diagnostic', slug: 'Science', mode: '',
      questionIds: ['S1'], sectionNames: ['Science'],
      answers: { 0: 2 }, idx: 0, sectionIdx: 0, floorIdx: 0,
      endTime: Date.now() + 60_000, sectionEndTime: null, startedAt: Date.now(), updatedAt: Date.now(),
    })

    render(<DiagnosticExam />)
    await waitFor(() => expect(screen.getByText('Resume where you left off')).toBeTruthy())
    fireEvent.press(screen.getByText('Resume where you left off'))

    await waitFor(() => expect(screen.getByText('Sci Q1')).toBeTruthy())
    // The saved answer (option index 2 -> 'c') is already selected.
    const cBtn = screen.getByText('c')
    expect(cBtn).toBeTruthy()
  })

  // Review finding #1 (HIGH): reorderByIds compacts away a vanished question —
  // answers/idx keyed by the ORIGINAL saved order must be remapped or they
  // land on the wrong question.
  it('restores answers onto the right questions when a question was removed from the bank since saving', async () => {
    mockSearchParams = { subject: 'Science' }
    // S2 has since been removed from the bank — only S1 and S3 remain.
    mockBankRows = [
      { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null },
      { questionId: 'S3', subtest: 'Science', questionText: 'Sci Q3', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 1, explanation: '', setId: null },
    ]
    mockLoadRun.mockResolvedValue({
      runKey: 'diagnostic:Science', kind: 'diagnostic', slug: 'Science', mode: '',
      questionIds: ['S1', 'S2', 'S3'], sectionNames: ['Science', 'Science', 'Science'],
      answers: { 0: 0, 1: 1, 2: 2 }, // S1 -> 'a', S2 -> vanishes, S3 -> 'c'
      idx: 2, sectionIdx: 0, floorIdx: 0,
      endTime: Date.now() + 60_000, sectionEndTime: null, startedAt: Date.now(), updatedAt: Date.now(),
    })

    render(<DiagnosticExam />)
    await waitFor(() => expect(screen.getByText('Resume where you left off')).toBeTruthy())
    fireEvent.press(screen.getByText('Resume where you left off'))

    // idx 2 pointed at S3; after compaction ([S1, S3]) S3 sits at index 1.
    await waitFor(() => expect(screen.getByText('Sci Q3')).toBeTruthy())
    expect(screen.getByRole('radio', { name: 'c', checked: true })).toBeTruthy()
  })

  // Review finding #2 (HIGH): submit() stays in phase 'exam' through its
  // awaits — a state change during that window would re-trigger the save
  // effect and resurrect the just-cleared run.
  it('never re-saves the run once submit has started, even if state changes mid-submit', async () => {
    let resolveAttempts!: () => void
    mockRecordAttempts.mockImplementationOnce(
      () => new Promise<void>(resolve => { resolveAttempts = () => resolve(undefined) }),
    )

    mockSearchParams = { subject: 'Science' }
    mockBankRows = [
      { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null },
    ]

    render(<DiagnosticExam />)
    await waitFor(() => expect(screen.getByText('Sci Q1')).toBeTruthy())
    fireEvent.press(screen.getByText('a'))

    fireEvent.press(screen.getByText('Review & submit'))
    fireEvent.press(await screen.findByRole('button', { name: /submit exam/i }))
    const call = alertSpy.mock.calls[alertSpy.mock.calls.length - 1]!
    const buttons = call[2] as { text: string; onPress?: () => void }[]

    await act(async () => {
      buttons.find(b => b.text.toLowerCase() === 'submit')!.onPress!()
    })
    const saveCallsAtSubmitStart = mockSaveRun.mock.calls.length
    expect(mockClearRun).toHaveBeenCalledWith('diagnostic:Science')

    fireEvent.press(screen.getByText('b')) // would flip the answer if not disabled
    expect(mockSaveRun.mock.calls.length).toBe(saveCallsAtSubmitStart)

    await act(async () => { resolveAttempts() })
    await waitFor(() => expect(screen.getByText('Diagnostic results')).toBeTruthy())
    expect(mockSaveRun.mock.calls.length).toBe(saveCallsAtSubmitStart)
  })

  it('Fix 1: "Start over" discards the saved run and builds a fresh sample', async () => {
    mockSearchParams = { subject: 'Science' }
    mockBankRows = [
      { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null },
    ]
    mockLoadRun.mockResolvedValue({
      runKey: 'diagnostic:Science', kind: 'diagnostic', slug: 'Science', mode: '',
      questionIds: ['S1'], sectionNames: ['Science'],
      answers: { 0: 2 }, idx: 0, sectionIdx: 0, floorIdx: 0,
      endTime: Date.now() + 60_000, sectionEndTime: null, startedAt: Date.now(), updatedAt: Date.now(),
    })

    render(<DiagnosticExam />)
    await waitFor(() => expect(screen.getByText('Resume where you left off')).toBeTruthy())
    fireEvent.press(screen.getByText('Start over'))

    await waitFor(() => expect(screen.getByText('Sci Q1')).toBeTruthy())
    expect(mockClearRun).toHaveBeenCalledWith('diagnostic:Science')
  })

  // Redesign M2: the diagnostic's overall percent is neutral (same ink at any
  // score) — it used to turn green/red by readiness tone, a pass/fail cue.
  it.each([['a', '100%'], ['b', '0%']])('shows the overall percent in neutral ink (answer %s → %s)', async (pick, pct) => {
    mockSearchParams = { subject: 'Science' }
    mockBankRows = [
      { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null },
    ]
    render(<DiagnosticExam />)
    await waitFor(() => expect(screen.getByText('Sci Q1')).toBeTruthy())
    fireEvent.press(screen.getByText(pick))
    await reviewAndConfirmSubmit(alertSpy)
    await waitFor(() => expect(screen.getByText('Diagnostic results')).toBeTruthy())
    const node = screen.getAllByText(pct)[0]! // the overall figure renders first
    const flat = Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean))
    expect(flat.color).toBe(lightTheme.textPrimary) // neutral ink — never success/danger
  })

  // ── Redesign M3: the focus-mode frame shared with exam/[slug].tsx ──────────
  describe('focus-mode frame (redesign M3)', () => {
    const flat = (el: any) => Object.assign({}, ...[el.props.style].flat(Infinity).filter(Boolean))
    const TWO = [
      { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null },
      { questionId: 'S2', subtest: 'Science', questionText: 'Sci Q2', options: JSON.stringify(['e', 'f', 'g', 'h']), correctIndex: 0, explanation: '', setId: null },
    ]
    async function start() {
      mockSearchParams = { subject: 'Science' }
      mockBankRows = TWO
      render(<DiagnosticExam />)
      await waitFor(() => expect(screen.getByText('Question 1 of 2')).toBeTruthy())
    }

    it('loads behind an announced skeleton, not a bare line of text', async () => {
      mockSearchParams = { subject: 'Science' }
      mockBankRows = TWO
      render(<DiagnosticExam />)
      expect(screen.getByLabelText('Loading diagnostic')).toBeTruthy()
      expect(screen.queryByText(/Loading diagnostic…/)).toBeNull()
      await waitFor(() => expect(screen.getByText('Question 1 of 2')).toBeTruthy())
    })

    it('a failed question load offers a retry (not the empty results page), and Try again reloads', async () => {
      mockSearchParams = { subject: 'Science' }
      mockBankRows = TWO
      mockLoadRun.mockRejectedValueOnce(new Error('storage unavailable'))
      render(<DiagnosticExam />)
      expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy()
      expect(screen.getByText("Couldn't load the questions")).toBeTruthy()
      expect(mockLoadRun).toHaveBeenCalledTimes(1)

      fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
      await waitFor(() => expect(screen.getByText('Question 1 of 2')).toBeTruthy())
      expect(mockLoadRun).toHaveBeenCalledTimes(2)
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    })

    it('asks to resume on a titled page', async () => {
      mockSearchParams = { subject: 'Science' }
      mockBankRows = TWO
      mockLoadRun.mockResolvedValue({
        runKey: 'diagnostic:Science', kind: 'diagnostic', slug: 'Science', mode: '',
        questionIds: ['S1'], sectionNames: ['Science'], answers: {}, idx: 0, sectionIdx: 0, floorIdx: 0,
        endTime: Date.now() + 60_000, sectionEndTime: null, startedAt: Date.now(), updatedAt: Date.now(),
      })
      render(<DiagnosticExam />)
      expect(await screen.findByRole('header', { name: 'Resume where you left off?' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Resume where you left off' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Start over' })).toBeTruthy()
    })

    it('names the subject in the header, not as a coloured eyebrow above the question', async () => {
      await start()
      // Header title only — the question card carries no subject tag.
      expect(screen.getAllByText('Science')).toHaveLength(1)
    })

    it('reads the time left as a named tabular timer with no glyph in the text', async () => {
      await start()
      expect(screen.getByLabelText(/^Time left: \d{2}:\d{2}$/)).toBeTruthy()
      const clock = screen.getByText(/\d{2}:\d{2}/)
      expect(String(clock.props.children)).toMatch(/^\d{1,2}:\d{2}$/)
      expect(flat(clock).fontVariant).toEqual(['tabular-nums'])
    })

    it('has a 44pt, named Leave control', async () => {
      await start()
      const leave = screen.getByRole('button', { name: 'Leave exam' })
      expect(flat(leave).minWidth ?? flat(leave).width).toBeGreaterThanOrEqual(44)
    })

    it('on phones opens the navigator as a sheet from the header', async () => {
      await start()
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
      for (const c of cells) expect(flat(c).minWidth ?? flat(c).width).toBeGreaterThanOrEqual(44)
      expect(within(panel).getByLabelText('Question 1, unanswered, current question')).toBeTruthy()
      fireEvent.press(within(panel).getByLabelText('Question 2, unanswered'))
      await waitFor(() => expect(screen.getByText('Question 2 of 2')).toBeTruthy())
    })

    it('caps the reading column at 720 with the options directly under the question, and the footer inside it', async () => {
      mockBp = 'expanded'
      await start()
      const col = screen.getByTestId('runner-reading-column')
      expect(flat(col).maxWidth).toBeLessThanOrEqual(720)
      expect(within(col).getAllByRole('radio')).toHaveLength(4)
      const footer = screen.getByTestId('runner-footer')
      expect(flat(footer).maxWidth).toBeLessThanOrEqual(720)
      expect(within(footer).getByRole('button', { name: 'Next' })).toBeTruthy()
    })

    it('shows results on a titled page', async () => {
      await start()
      fireEvent.press(screen.getByRole('button', { name: 'All questions' }))
      fireEvent.press(await screen.findByRole('button', { name: /submit exam/i }))
      const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1]![2] as { text: string; onPress?: () => void }[]
      await act(async () => { buttons.find(b => b.text === 'Submit')!.onPress!() })
      expect(await screen.findByRole('header', { name: 'Diagnostic results' })).toBeTruthy()
      expect(screen.getByTestId('screen-scroll')).toBeTruthy()
    })
  })

  // ── Logic audit B5: a saved run whose time has run out ─────────────────────
  describe('B5: stale saved run', () => {
    const row = (id: string, subtest: string, text: string) =>
      ({ questionId: id, subtest, questionText: text, options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null })
    const savedRun = (over: Record<string, unknown> = {}) => ({
      runKey: 'diagnostic:Science', kind: 'diagnostic', slug: 'Science', mode: '',
      questionIds: ['S1', 'S2', 'S3'], sectionNames: ['Science', 'Science', 'Science'],
      answers: { 0: 0 }, idx: 0, sectionIdx: 0, floorIdx: 0,
      endTime: Date.now() - 3_600_000, sectionEndTime: null, startedAt: 777000, updatedAt: Date.now() - 3_600_000,
      ...over,
    })
    beforeEach(() => {
      mockSearchParams = { subject: 'Science' }
      mockBankRows = [row('S1', 'Science', 'Sci Q1'), row('S2', 'Science', 'Sci Q2'), row('S3', 'Science', 'Sci Q3')]
    })

    it('offers Submit / Discard instead of Resume and never auto-submits', async () => {
      mockLoadRun.mockResolvedValue(savedRun())
      render(<DiagnosticExam />)
      await waitFor(() => expect(screen.getByText('Submit what I answered')).toBeTruthy())
      expect(screen.getByText('Discard')).toBeTruthy()
      expect(screen.queryByText('Resume where you left off')).toBeNull()
      expect(mockRecordAttempts).not.toHaveBeenCalled()
      expect(mockRecordSession).not.toHaveBeenCalled()
    })

    it('Submit records only reached questions, under the saved startedAt', async () => {
      mockLoadRun.mockResolvedValue(savedRun())
      render(<DiagnosticExam />)
      await waitFor(() => expect(screen.getByText('Submit what I answered')).toBeTruthy())
      fireEvent.press(screen.getByText('Submit what I answered'))
      await waitFor(() => expect(screen.getByText('Diagnostic results')).toBeTruthy())
      const rows = mockRecordAttempts.mock.calls[0]![0] as any[]
      expect(rows.map(r => r.questionId)).toEqual(['S1']) // S2/S3 were never reached
      expect(rows[0].sessionKey).toBe(777000)
      expect(mockRecordSession).toHaveBeenCalledWith(expect.objectContaining({ attemptKey: 777000, startTime: 777000 }))
    })

    it('persists and shows the subject total over reached questions only (1/1, not 1/3)', async () => {
      mockLoadRun.mockResolvedValue(savedRun())
      render(<DiagnosticExam />)
      await waitFor(() => expect(screen.getByText('Submit what I answered')).toBeTruthy())
      fireEvent.press(screen.getByText('Submit what I answered'))
      await waitFor(() => expect(screen.getByText('Diagnostic results')).toBeTruthy())
      expect(mockRecordSession).toHaveBeenCalledWith(expect.objectContaining({ subtest: 'Science', score: 1, total: 1 }))
      expect(screen.getByText('1/1 correct · 100%')).toBeTruthy()
      expect(screen.getByText(/Questions you never reached are not counted/)).toBeTruthy()
    })

    it('Discard clears the saved run and starts a fresh sample', async () => {
      mockLoadRun.mockResolvedValue(savedRun())
      render(<DiagnosticExam />)
      await waitFor(() => expect(screen.getByText('Discard')).toBeTruthy())
      fireEvent.press(screen.getByText('Discard'))
      expect(mockClearRun).toHaveBeenCalledWith('diagnostic:Science')
      await waitFor(() => expect(screen.getByText('Question 1 of 3')).toBeTruthy())
      expect(mockRecordAttempts).not.toHaveBeenCalled()
    })

    it('does not write a 0% session for a subject the student never reached', async () => {
      mockSearchParams = {}
      mockBankRows = [row('S1', 'Science', 'Sci Q1'), row('M1', 'Mathematics', 'Math Q1')]
      mockLoadRun.mockResolvedValue(savedRun({
        runKey: 'diagnostic:all', slug: 'all', questionIds: ['S1', 'M1'], sectionNames: ['Science', 'Mathematics'],
      }))
      render(<DiagnosticExam />)
      await waitFor(() => expect(screen.getByText('Submit what I answered')).toBeTruthy())
      fireEvent.press(screen.getByText('Submit what I answered'))
      await waitFor(() => expect(screen.getByText('Diagnostic results')).toBeTruthy())
      expect(mockRecordSession).toHaveBeenCalledTimes(1)
      expect(mockRecordSession).toHaveBeenCalledWith(expect.objectContaining({ subtest: 'Science' }))
    })

    it('resuming a live run keeps the saved startedAt as the attempt key', async () => {
      mockLoadRun.mockResolvedValue(savedRun({ endTime: Date.now() + 600_000, idx: 2, answers: { 0: 0, 1: 0, 2: 0 } }))
      render(<DiagnosticExam />)
      await waitFor(() => expect(screen.getByText('Resume where you left off')).toBeTruthy())
      fireEvent.press(screen.getByText('Resume where you left off'))
      await waitFor(() => expect(screen.getByText('Review & submit')).toBeTruthy())
      await reviewAndConfirmSubmit(alertSpy)
      await waitFor(() => expect(mockRecordAttempts).toHaveBeenCalled())
      expect(mockRecordAttempts.mock.calls[0]![0][0].sessionKey).toBe(777000)
    })
  })

  // ── Logic audit D: the diagnostic follows the student's exam ───────────────
  describe('D: exam diagnostic', () => {
    const LANG = 'Language Proficiency (English & Filipino)'
    const bq = (id: string, subtest: string, text: string) => ({
      questionId: id, subtest, questionText: text, options: ['a', 'b', 'c', 'd'], correctIndex: 0,
      explanation: '', setId: null, setPosition: null,
    })
    const many = (prefix: string, subtest: string, n: number) =>
      Array.from({ length: n }, (_, i) => bq(`${prefix}${i}`, subtest, `${prefix} Q${i}`))
    const acetSource = () => ({
      blueprint: {
        slug: 'acet', name: 'Ateneo College Entrance Test', acronym: 'ACET', totalItems: 100, totalTimeMinutes: 120,
        hasGuessingPenalty: false, guessingPenalty: 0, sectionBlocked: false, scoringNote: '', mechanicsNote: '',
        sections: [
          { id: 'acet:1', name: LANG, skillCategory: 'Language', itemCount: 40, timeMinutes: null, requiresSpatialLogic: false, displayOrder: 1 },
          { id: 'acet:2', name: 'Math', skillCategory: 'Mathematics', itemCount: 40, timeMinutes: null, requiresSpatialLogic: false, displayOrder: 2 },
          { id: 'acet:3', name: 'Abstract Thinking', skillCategory: 'Abstract', itemCount: 20, timeMinutes: null, requiresSpatialLogic: false, displayOrder: 3 },
        ],
        courseNotes: [],
      },
      questionsByCategory: new Map([
        ['Language', many('ENG', 'Language Proficiency', 8)],
        ['Mathematics', many('MAT', 'Mathematics', 8)],
      ]),
      passages: [],
    })
    const acetRunnable = [{ slug: 'acet', name: 'Ateneo College Entrance Test', acronym: 'ACET' }]
    function setupAcet() {
      mockRunnable = acetRunnable
      mockSources = { acet: acetSource() }
    }
    async function skipToLastAndSubmit() {
      for (let i = 0; i < 40 && !screen.queryByText('Review & submit'); i++) fireEvent.press(screen.getByText('Skip'))
      await reviewAndConfirmSubmit(alertSpy)
    }

    it('?exam=<slug> samples that exam: 5 per runnable section, headed by the section name, empty sections skipped', async () => {
      setupAcet()
      mockSearchParams = { exam: 'acet' }
      render(<DiagnosticExam />)
      await waitFor(() => expect(screen.getByText('Question 1 of 10')).toBeTruthy())
      expect(screen.getByText(LANG)).toBeTruthy()
      expect(screen.getByText(/^ENG Q\d$/)).toBeTruthy()
    })

    it('records sessions (kind diagnostic, under the exam slug, canonical subtest) and attempts under the exam slug', async () => {
      setupAcet()
      mockSearchParams = { exam: 'acet' }
      render(<DiagnosticExam />)
      await waitFor(() => expect(screen.getByText('Question 1 of 10')).toBeTruthy())
      fireEvent.press(screen.getByText('a'))
      await skipToLastAndSubmit()

      await waitFor(() => expect(mockRecordSession).toHaveBeenCalledTimes(2))
      const sessions = mockRecordSession.mock.calls.map(c => (c as unknown[])[0] as any)
      expect(sessions.map(s => s.subtest)).toEqual(['Language Proficiency', 'Mathematics'])
      for (const s of sessions) {
        expect(s).toMatchObject({ listingSlug: 'acet', kind: 'diagnostic', total: 5, topicId: '', deckId: '' })
        expect(s.attemptKey).toBe(s.startTime)
      }
      expect(sessions[0].score).toBe(1)

      await waitFor(() => expect(mockRecordAttempts).toHaveBeenCalledTimes(1))
      const rows = mockRecordAttempts.mock.calls[0]![0] as any[]
      expect(rows).toHaveLength(10)
      expect(rows.every(r => r.listingSlug === 'acet' && r.sourceTable === 'upcat_questions')).toBe(true)
      expect(rows.filter(r => r.subtest === 'Language Proficiency')).toHaveLength(5)
      expect(rows.filter(r => r.subtest === 'Mathematics')).toHaveLength(5)
      expect(rows.every(r => r.sessionKey === sessions[0].attemptKey)).toBe(true)
    })

    it('names the exam on the results, shows per-section readiness by section name, and flags sections not available yet', async () => {
      setupAcet()
      mockSearchParams = { exam: 'acet' }
      render(<DiagnosticExam />)
      await waitFor(() => expect(screen.getByText('Question 1 of 10')).toBeTruthy())
      fireEvent.press(screen.getByText('a'))
      await skipToLastAndSubmit()

      expect(await screen.findByText('ACET diagnostic results')).toBeTruthy()
      expect(screen.queryByText('Diagnostic results')).toBeNull()
      expect(screen.getAllByText(LANG).length).toBeGreaterThan(0)
      expect(screen.getByText('Per-section readiness')).toBeTruthy()
      expect(screen.getByText(/Not available yet: Abstract Thinking/)).toBeTruthy()

    })

    it('review fix 1: with review topics for the exam, the next step is its review topics', async () => {
      setupAcet()
      mockReviewSlugs = ['acet']
      mockSearchParams = { exam: 'acet' }
      render(<DiagnosticExam />)
      await waitFor(() => expect(screen.getByText('Question 1 of 10')).toBeTruthy())
      await skipToLastAndSubmit()
      await screen.findByText('ACET diagnostic results')
      expect(screen.queryByText('Take a mock exam')).toBeNull()
      fireEvent.press(screen.getByText('Review ACET topics'))
      expect(mockPush).toHaveBeenCalledWith('/practice/review/acet')
    })

    it('review fix 1: with no review topics for the exam, it goes straight to the mock exam (no chooser hop)', async () => {
      setupAcet()
      mockReviewSlugs = ['upcat']
      mockSearchParams = { exam: 'acet' }
      render(<DiagnosticExam />)
      await waitFor(() => expect(screen.getByText('Question 1 of 10')).toBeTruthy())
      await skipToLastAndSubmit()
      await screen.findByText('ACET diagnostic results')
      expect(screen.queryByText('Review ACET topics')).toBeNull()
      expect(screen.queryByText(/Practice weakest/)).toBeNull()
      fireEvent.press(screen.getByText('Take a mock exam'))
      expect(mockPush).toHaveBeenCalledWith('/practice/exam/acet')
    })

    it('review fix 2: a failed focus/blueprint lookup without ?exam= still serves the UPCAT diagnostic', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      mockLookupError = new Error('db locked')
      mockBankRows = [
        { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null },
      ]
      render(<DiagnosticExam />)
      await waitFor(() => expect(screen.getByText('Sci Q1')).toBeTruthy())
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
      warnSpy.mockRestore()
    })

    it('review fix 2: a failed lookup for an explicit ?exam= keeps the retry state', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      mockLookupError = new Error('db locked')
      mockSearchParams = { exam: 'acet' }
      render(<DiagnosticExam />)
      expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy()
      warnSpy.mockRestore()
    })

    it('review fix 3: changing the params mid-load discards the stale load (no ACET questions under a UPCAT screen)', async () => {
      setupAcet()
      let release!: () => void
      mockSourceGate = new Promise<void>(r => { release = r })
      mockSearchParams = { exam: 'acet' }
      mockBankRows = [
        { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null },
      ]
      const view = render(<DiagnosticExam />)
      mockSearchParams = { subject: 'Science' }
      view.rerender(<DiagnosticExam />)
      await waitFor(() => expect(screen.getByText('Sci Q1')).toBeTruthy())
      await act(async () => { release() })
      expect(screen.getByText('Sci Q1')).toBeTruthy()
      expect(screen.queryByText(LANG)).toBeNull()
      expect(screen.queryByText(/^ENG Q\d$/)).toBeNull()
    })

    it('review fix 3: a new exam starts clean (answers, position and submit guard reset)', async () => {
      setupAcet()
      mockSearchParams = { exam: 'acet' }
      const view = render(<DiagnosticExam />)
      await waitFor(() => expect(screen.getByText('Question 1 of 10')).toBeTruthy())
      fireEvent.press(screen.getByText('a'))
      fireEvent.press(screen.getByText('Skip'))
      mockSearchParams = { subject: 'Science' }
      mockBankRows = [
        { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null },
      ]
      view.rerender(<DiagnosticExam />)
      await waitFor(() => expect(screen.getByText('Sci Q1')).toBeTruthy())
      expect(screen.getByText('Question 1 of 1')).toBeTruthy()
      expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0)
      fireEvent.press(screen.getByText('a'))
      await reviewAndConfirmSubmit(alertSpy) // would be swallowed by a stale submittedRef
      await waitFor(() => expect(mockRecordSession).toHaveBeenCalledWith(expect.objectContaining({ listingSlug: 'upcat', subtest: 'Science' })))
    })

    it('review fix 4: ?exam= is normalized (array, whitespace, mixed case)', async () => {
      setupAcet()
      mockSearchParams = { exam: ['  AcEt ', 'ustet'] }
      render(<DiagnosticExam />)
      await waitFor(() => expect(screen.getByText('Question 1 of 10')).toBeTruthy())
      expect(screen.getByText(LANG)).toBeTruthy()
    })

    it('review fix 4: an unknown mixed-case ?exam= is honest and does not throw', async () => {
      mockSearchParams = { exam: ['DCAT-DLSU'] }
      render(<DiagnosticExam />)
      expect(await screen.findByText("A diagnostic for DCAT-DLSU isn't available yet")).toBeTruthy()
    })

    it('review fix 5: a resumed exam diagnostic still lists the sections not available yet', async () => {
      setupAcet()
      mockSearchParams = { exam: 'acet' }
      mockLoadRun.mockResolvedValue({
        runKey: 'diagnostic:acet:exam', kind: 'diagnostic', slug: 'acet', mode: '',
        questionIds: ['MAT3'], sectionNames: ['Math'],
        answers: { 0: 0 }, idx: 0, sectionIdx: 0, floorIdx: 0,
        endTime: Date.now() + 60_000, sectionEndTime: null, startedAt: 4242, updatedAt: Date.now(),
      })
      render(<DiagnosticExam />)
      fireEvent.press(await screen.findByText('Resume where you left off'))
      await waitFor(() => expect(screen.getByText('MAT Q3')).toBeTruthy())
      await skipToLastAndSubmit()
      expect(await screen.findByText(/Not available yet: Abstract Thinking/)).toBeTruthy()
    })

    it('arms a timer of one minute per question', async () => {
      setupAcet()
      // Thin English pool: 3 + 5 = 8 questions -> 8 minutes.
      ;(mockSources.acet as any).questionsByCategory.set('Language', many('ENG', 'Language Proficiency', 3))
      mockSearchParams = { exam: 'acet' }
      render(<DiagnosticExam />)
      await waitFor(() => expect(screen.getByText('Question 1 of 8')).toBeTruthy())
      expect(screen.getByLabelText(/^Time left: (08:00|07:59)$/)).toBeTruthy()
    })

    it('without a param, follows the primary focus exam that has a runnable blueprint', async () => {
      setupAcet()
      mockFocusSlugs = ['dcat-dlsu', 'acet']
      render(<DiagnosticExam />)
      await waitFor(() => expect(screen.getByText('Question 1 of 10')).toBeTruthy())
      expect(screen.getByText(LANG)).toBeTruthy()
    })

    it('an explicit ?exam=upcat beats an ACET focus and keeps the UPCAT diagnostic and its recording', async () => {
      setupAcet()
      mockFocusSlugs = ['acet']
      mockSearchParams = { exam: 'upcat', subject: 'Science' }
      mockBankRows = [
        { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null },
      ]
      render(<DiagnosticExam />)
      await waitFor(() => expect(screen.getByText('Sci Q1')).toBeTruthy())
      fireEvent.press(screen.getByText('a'))
      await reviewAndConfirmSubmit(alertSpy)
      await waitFor(() => expect(mockRecordSession).toHaveBeenCalledWith(expect.objectContaining({ listingSlug: 'upcat', subtest: 'Science', kind: 'diagnostic' })))
      expect(await screen.findByText('Diagnostic results')).toBeTruthy()
    })

    it('a focus exam of UPCAT with no param keeps the UPCAT diagnostic', async () => {
      setupAcet()
      mockRunnable = [{ slug: 'upcat', name: 'UPCAT', acronym: 'UPCAT' }, ...acetRunnable]
      mockFocusSlugs = ['upcat', 'acet']
      mockBankRows = [
        { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null },
      ]
      render(<DiagnosticExam />)
      await waitFor(() => expect(screen.getByText('Sci Q1')).toBeTruthy())
    })

    it('a focus exam with no runnable blueprint is an honest state that never offers UPCAT questions instead', async () => {
      mockSearchParams = { exam: 'dcat-dlsu' }
      mockBankRows = [
        { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null },
      ]
      render(<DiagnosticExam />)
      expect(await screen.findByText("A diagnostic for DCAT-DLSU isn't available yet")).toBeTruthy()
      expect(screen.queryByText('Sci Q1')).toBeNull()
      expect(mockSaveRun).not.toHaveBeenCalled()
      expect(screen.queryByRole('button', { name: /UPCAT/ })).toBeNull()
      // Nothing to review either: the exam's page, which says practice is coming soon.
      fireEvent.press(screen.getByRole('button', { name: 'See exam details' }))
      expect(mockPush).toHaveBeenCalledWith('/listings/dcat-dlsu')
    })

    it('an exam with no runnable blueprint but review topics offers its topic review', async () => {
      mockSearchParams = { exam: 'dcat-dlsu' }
      mockReviewSlugs = ['dcat-dlsu']
      render(<DiagnosticExam />)
      expect(await screen.findByText("A diagnostic for DCAT-DLSU isn't available yet")).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'See exam details' })).toBeNull()
      fireEvent.press(screen.getByRole('button', { name: 'Review DCAT-DLSU topics' }))
      expect(mockPush).toHaveBeenCalledWith('/practice/review/dcat-dlsu')
    })

    it('a school focus (?exam=school:<id>) means the general entrance exam: never school:* links', async () => {
      mockSearchParams = { exam: 'school:abc' }
      render(<DiagnosticExam />)
      expect(await screen.findByText("A diagnostic for GENERAL-CET isn't available yet", {}, { timeout: 10_000 })).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: 'See exam details' }))
      expect(mockPush).toHaveBeenCalledWith('/listings/general-cet')
      expect(mockPush.mock.calls.flat().join(' ')).not.toMatch(/school/)
    })

    it('keys the saved run by exam and stores the exam slug', async () => {
      setupAcet()
      mockSearchParams = { exam: 'acet' }
      render(<DiagnosticExam />)
      await waitFor(() => expect(screen.getByText('Question 1 of 10')).toBeTruthy())
      expect(mockLoadRun).toHaveBeenCalledWith('diagnostic:acet:exam')
      await waitFor(() => expect(mockSaveRun).toHaveBeenCalled())
      expect(mockSaveRun.mock.calls[mockSaveRun.mock.calls.length - 1]![0]).toMatchObject({
        runKey: 'diagnostic:acet:exam', kind: 'diagnostic', slug: 'acet',
      })
    })

    it('a saved UPCAT run never resumes as the exam diagnostic', async () => {
      setupAcet()
      mockSearchParams = { exam: 'acet' }
      mockLoadRun.mockImplementation((key: string) => Promise.resolve(key === 'diagnostic:all'
        ? { runKey: 'diagnostic:all', kind: 'diagnostic', slug: 'all', mode: '', questionIds: ['S1'], sectionNames: ['Science'],
            answers: {}, idx: 0, sectionIdx: 0, floorIdx: 0, endTime: Date.now() + 60_000, sectionEndTime: null, startedAt: 1, updatedAt: 1 }
        : null))
      render(<DiagnosticExam />)
      await waitFor(() => expect(screen.getByText('Question 1 of 10')).toBeTruthy())
      expect(screen.queryByText('Resume where you left off?')).toBeNull()
    })

    it('resumes a saved exam run onto the same questions, keeping their section names', async () => {
      setupAcet()
      mockSearchParams = { exam: 'acet' }
      mockLoadRun.mockResolvedValue({
        runKey: 'diagnostic:acet:exam', kind: 'diagnostic', slug: 'acet', mode: '',
        questionIds: ['MAT3', 'ENG1'], sectionNames: ['Math', LANG],
        answers: { 0: 2 }, idx: 0, sectionIdx: 0, floorIdx: 0,
        endTime: Date.now() + 60_000, sectionEndTime: null, startedAt: 4242, updatedAt: Date.now(),
      })
      render(<DiagnosticExam />)
      fireEvent.press(await screen.findByText('Resume where you left off'))
      await waitFor(() => expect(screen.getByText('MAT Q3')).toBeTruthy())
      expect(screen.getByText('Question 1 of 2')).toBeTruthy()
      expect(screen.getByText('Math')).toBeTruthy()
      expect(screen.getByRole('radio', { name: 'c', checked: true })).toBeTruthy()
    })
  })
})
