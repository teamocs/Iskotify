import React from 'react'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react-native'
import { Alert } from 'react-native'
import DiagnosticExam from '../index'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockBack = jest.fn()
let mockSearchParams: { subject?: string } = {}

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
      listingSlug: 'upcat', topicId: '', subtest: 'Science', score: 1, total: 1,
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

  it('"Practice weakest subject" routes to the UPCAT review screen', async () => {
    mockSearchParams = { subject: 'Science' }
    mockBankRows = [
      { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 1, explanation: '', setId: null },
    ]
    render(<DiagnosticExam />)
    await waitFor(() => expect(screen.getByText('Sci Q1')).toBeTruthy())
    fireEvent.press(screen.getByText('a')) // wrong answer (correctIndex is 1)
    await reviewAndConfirmSubmit(alertSpy)
    await waitFor(() => expect(screen.getByText('Diagnostic results')).toBeTruthy())

    fireEvent.press(screen.getByText(/Practice weakest subject/))
    expect(mockPush).toHaveBeenCalledWith('/practice/review/upcat')
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
    expect(flat.color).toBe('#ffffff') // theme mock textPrimary — never success/danger
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
})
