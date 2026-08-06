import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
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

const mockRecordSession = jest.fn(() => Promise.resolve())
jest.mock('../../../../hooks/useRecordSession', () => ({
  useRecordSession: () => ({ recordSession: mockRecordSession }),
}))

const mockRecordAttempts = jest.fn().mockResolvedValue(undefined)
jest.mock('../../../../hooks/useRecordAttempts', () => ({
  useRecordAttempts: () => ({ recordAttempts: mockRecordAttempts }),
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

describe('DiagnosticExam', () => {
  beforeEach(() => {
    jest.useRealTimers()
    mockPush.mockReset()
    mockReplace.mockReset()
    mockBack.mockReset()
    mockRecordSession.mockClear()
    mockRecordAttempts.mockClear()
    mockSearchParams = {}
    mockBankRows = []
  })

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
    fireEvent.press(screen.getByText('Submit'))

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
    fireEvent.press(screen.getByText('Submit'))

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
    fireEvent.press(screen.getByText('Submit'))

    // Reached results despite the telemetry insert rejecting — not stranded
    // behind the double-submit guard.
    await waitFor(() => expect(screen.getByText('Diagnostic results')).toBeTruthy())
    expect(warnSpy).toHaveBeenCalledWith('[practice/diagnostic] recordAttempts failed:', expect.any(Error))

    warnSpy.mockRestore()
  })

  it('selecting an option exposes accessibilityState={{selected:true}} on that option only', async () => {
    mockSearchParams = { subject: 'Science' }
    mockBankRows = [
      { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null },
    ]
    render(<DiagnosticExam />)
    await waitFor(() => expect(screen.getByText('Sci Q1')).toBeTruthy())

    fireEvent.press(screen.getByText('b'))

    const optionButtons = screen.getAllByRole('button').filter(b => b.props.accessibilityState?.selected !== undefined)
    expect(optionButtons).toHaveLength(4)
    const selected = optionButtons.filter(b => b.props.accessibilityState?.selected === true)
    expect(selected).toHaveLength(1)
  })

  it('"Back to Home" routes to the tabs root', async () => {
    mockSearchParams = { subject: 'Science' }
    mockBankRows = [
      { questionId: 'S1', subtest: 'Science', questionText: 'Sci Q1', options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null },
    ]
    render(<DiagnosticExam />)
    await waitFor(() => expect(screen.getByText('Sci Q1')).toBeTruthy())
    fireEvent.press(screen.getByText('a'))
    fireEvent.press(screen.getByText('Submit'))
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
    fireEvent.press(screen.getByText('Submit'))
    await waitFor(() => expect(screen.getByText('Diagnostic results')).toBeTruthy())

    fireEvent.press(screen.getByText(/Practice weakest subject/))
    expect(mockPush).toHaveBeenCalledWith('/practice/review/upcat')
  })
})
