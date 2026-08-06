import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native'
import UpcatExam from '../[subtest]'

// ---------------------------------------------------------------------------
// Mocks — same conventions as FlashcardExam.test.tsx / diagnostic/index.test.tsx
// ---------------------------------------------------------------------------

const mockPush = jest.fn()
const mockReplace = jest.fn()
let mockSearchParams: { subtest?: string; mode?: string } = {}

jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: (...a: unknown[]) => mockReplace(...a), back: () => {} },
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

describe('UpcatExam', () => {
  beforeEach(() => {
    jest.useRealTimers()
    mockPush.mockReset()
    mockReplace.mockReset()
    mockRecordSession.mockClear()
    mockRecordAttempts.mockClear()
    mockSearchParams = {}
    mockQuestionRows = []
    mockPassageRows = []
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

    await act(async () => {
      fireEvent.press(screen.getByText('Submit'))
    })

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
    expect(mockRecordSession).toHaveBeenCalledWith(
      expect.objectContaining({ listingSlug: 'upcat', subtest: 'Mathematics', score: 2, total: 2 }),
    )
  })

  it('records an incorrect attempt row when the selected answer is wrong', async () => {
    mockSearchParams = { subtest: 'Mathematics' }
    mockQuestionRows = [
      { questionId: 'Q1', subtest: 'Mathematics', questionText: '1+1?', options: JSON.stringify(['1', '2', '3', '4']), correctIndex: 1, explanation: '', setId: null, setPosition: null, topic: null },
    ]

    render(<UpcatExam />)
    await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())

    fireEvent.press(screen.getByText('1')) // wrong (correct is index 1)
    await act(async () => {
      fireEvent.press(screen.getByText('Submit'))
    })

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

    await act(async () => {
      fireEvent.press(screen.getByText('Submit'))
    })

    // Reached results despite the telemetry insert rejecting — not stranded
    // behind the double-submit guard.
    expect(screen.getByText('Per-subtest')).toBeTruthy()
    expect(warnSpy).toHaveBeenCalledWith('[practice/upcat/[subtest]] recordAttempts failed:', expect.any(Error))

    warnSpy.mockRestore()
  })
})
