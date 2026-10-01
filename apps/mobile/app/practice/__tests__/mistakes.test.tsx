import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native'
import { Alert } from 'react-native'
import MistakesScreen from '../mistakes'

// P4 Mistakes mode: /practice/mistakes retries the UPCAT questions the student
// got wrong and hasn't answered correctly since, on the UPCAT runner.
// Same mock conventions as upcat/__tests__/subtest.test.tsx.

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockRouterBack = jest.fn()

jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockPush(...a),
    replace: (...a: unknown[]) => mockReplace(...a),
    back: (...a: unknown[]) => mockRouterBack(...a),
    canGoBack: () => false,
  },
  useLocalSearchParams: () => ({}),
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('../../../hooks/useBreakpoint', () => ({
  ...jest.requireActual('../../../hooks/useBreakpoint'),
  useBreakpoint: () => 'compact',
}))

jest.mock('../../../services/questionReports', () => ({
  submitQuestionReport: jest.fn().mockResolvedValue(undefined),
}))

const mockRecordSession = jest.fn(() => Promise.resolve())
jest.mock('../../../hooks/useRecordSession', () => ({
  useRecordSession: () => ({ recordSession: mockRecordSession }),
}))

const mockRecordAttempts = jest.fn().mockResolvedValue(undefined)
jest.mock('../../../hooks/useRecordAttempts', () => ({
  useRecordAttempts: () => ({ recordAttempts: mockRecordAttempts }),
}))

jest.mock('../../../hooks/useAdmissionEstimate', () => ({
  loadAdmissionEstimateSnapshot: jest.fn().mockResolvedValue({ status: 'not-ready', readiness: null, result: null }),
}))

jest.mock('../../../hooks/usePreventLeave', () => ({ usePreventLeave: jest.fn() }))

const mockSaveRun = jest.fn().mockResolvedValue(undefined)
const mockLoadRun = jest.fn().mockResolvedValue(null)
const mockClearRun = jest.fn().mockResolvedValue(undefined)
jest.mock('../../../hooks/useExamRunPersistence', () => ({
  useExamRunPersistence: () => ({ saveRun: mockSaveRun, loadRun: mockLoadRun, clearRun: mockClearRun }),
}))

const mockGate = { allowance: Infinity, fullMockAllowed: true }
const mockPracticeAllowance = jest.fn(async () => mockGate.allowance)
const mockFullMockAllowed = jest.fn(async () => mockGate.fullMockAllowed)
jest.mock('../../../services/premiumGate', () => ({
  practiceAllowanceNow: () => mockPracticeAllowance(),
  fullMockAllowedNow: () => mockFullMockAllowed(),
}))

const mockPremium = { enabled: false, isPremium: false, unlimited: true, loading: false }
jest.mock('../../../hooks/usePremium', () => ({ usePremium: () => ({ ...mockPremium, refresh: async () => mockPremium.isPremium }) }))

let mockMistakeIds: string[] = []
const mockGetOpenMistakeIds = jest.fn(async () => mockMistakeIds)
jest.mock('../../../services/questionHistory', () => ({
  getOpenMistakeIds: () => mockGetOpenMistakeIds(),
  lastSeenOrEmpty: jest.fn(async () => new Map()),
}))

let mockQuestionRows: any[] = []
let mockPassageRows: any[] = []
jest.mock('../../../hooks/useDb', () => {
  function fromResult(rows: any[]) {
    const p: any = Promise.resolve(rows)
    p.where = () => Promise.resolve(rows)
    return p
  }
  const db = {
    select: () => ({
      from: (table: unknown) => {
        const { upcatPassages: passagesTable } = require('../../../db/schema')
        if (table === passagesTable) return fromResult(mockPassageRows)
        return fromResult(mockQuestionRows)
      },
    }),
  }
  return { useDb: () => db }
})

const row = (questionId: string, questionText: string, over: Record<string, unknown> = {}) => ({
  questionId, subtest: 'Mathematics', questionText, options: JSON.stringify(['w', 'x', 'y', 'z']),
  correctIndex: 1, explanation: '', setId: null, setPosition: null, topic: 'Algebra', ...over,
})

async function reviewAndConfirmSubmit(alertSpy: jest.SpyInstance) {
  fireEvent.press(screen.getByText('Review & submit'))
  fireEvent.press(await screen.findByRole('button', { name: /submit exam/i }))
  const call = alertSpy.mock.calls[alertSpy.mock.calls.length - 1]!
  const buttons = call[2] as { text: string; onPress?: () => void }[]
  await act(async () => {
    buttons.find(b => b.text.toLowerCase() === 'submit')!.onPress!()
  })
}

describe('Mistakes mode (/practice/mistakes)', () => {
  let alertSpy: jest.SpyInstance

  beforeEach(() => {
    jest.useRealTimers()
    mockPush.mockReset()
    mockReplace.mockReset()
    mockRecordSession.mockClear()
    mockRecordAttempts.mockClear()
    mockSaveRun.mockClear()
    mockLoadRun.mockClear().mockResolvedValue(null)
    mockClearRun.mockClear()
    mockGetOpenMistakeIds.mockClear()
    mockPracticeAllowance.mockClear()
    mockFullMockAllowed.mockClear()
    mockGate.allowance = Infinity
    mockMistakeIds = []
    mockQuestionRows = []
    mockPassageRows = []
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  })

  afterEach(() => alertSpy.mockRestore())

  it('empty state: says what will show up here and links back to Practice', async () => {
    mockQuestionRows = [row('Q1', 'One?')]
    render(<MistakesScreen />)
    expect(await screen.findByText('No mistakes to review.')).toBeTruthy()
    expect(screen.getByText('Questions you get wrong will show up here.')).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Practice' }))
    expect(mockReplace).toHaveBeenCalledWith('/practice')
    // Nothing to serve: no free-practice allowance is checked or spent.
    expect(mockPracticeAllowance).not.toHaveBeenCalled()
  })

  it('serves the open mistakes newest first, as a drill run titled Mistakes', async () => {
    mockQuestionRows = [row('Q1', 'One?'), row('Q2', 'Two?'), row('Q3', 'Three?')]
    mockMistakeIds = ['Q3', 'Q1']
    render(<MistakesScreen />)
    expect(await screen.findByText('Three?')).toBeTruthy()
    expect(screen.getAllByText(/Mistakes/).length).toBeGreaterThan(0)
    expect(screen.queryByText('Two?')).toBeNull()

    // Persisted as its own run (resume restores it by ids).
    await waitFor(() => expect(mockSaveRun).toHaveBeenCalled())
    expect(mockSaveRun.mock.calls[mockSaveRun.mock.calls.length - 1]![0]).toMatchObject({
      kind: 'upcat', slug: 'mistakes', questionIds: ['Q3', 'Q1'],
    })

    fireEvent.press(screen.getByText('x')) // right this time
    fireEvent.press(screen.getByText('Next'))
    await waitFor(() => expect(screen.getByText('One?')).toBeTruthy())
    fireEvent.press(screen.getByText('w')) // wrong again
    await reviewAndConfirmSubmit(alertSpy)

    const rows = mockRecordAttempts.mock.calls[0]![0] as any[]
    expect(rows.map(r => [r.questionId, r.sourceTable, r.correct])).toEqual([
      ['Q3', 'upcat_questions', true],
      ['Q1', 'upcat_questions', false],
    ])
    // A drill (counts toward the free daily cap), labelled Mistakes.
    expect(mockRecordSession).toHaveBeenCalledWith(expect.objectContaining({
      listingSlug: 'upcat', topicId: 'mistakes', subtest: 'Mathematics', kind: 'drill', score: 1, total: 2,
    }))
    expect(await screen.findByText('You fixed 1 of 2 mistakes.')).toBeTruthy()
  })

  it('serves a whole passage set when one member is a mistake, but counts only the mistake', async () => {
    mockQuestionRows = [
      row('R2', 'Second about the passage?', { subtest: 'Reading Comprehension', setId: 'S1', setPosition: 2 }),
      row('R1', 'First about the passage?', { subtest: 'Reading Comprehension', setId: 'S1', setPosition: 1 }),
    ]
    mockPassageRows = [{ setId: 'S1', subtest: 'Reading Comprehension', passageText: 'Once upon a time.' }]
    mockMistakeIds = ['R2']
    render(<MistakesScreen />)
    expect(await screen.findByText('First about the passage?')).toBeTruthy()
    fireEvent.press(screen.getByText('x'))
    fireEvent.press(screen.getByText('Next'))
    await waitFor(() => expect(screen.getByText('Second about the passage?')).toBeTruthy())
    fireEvent.press(screen.getByText('x'))
    await reviewAndConfirmSubmit(alertSpy)
    expect(await screen.findByText('You fixed 1 of 1 mistake.')).toBeTruthy()
  })

  it('is a practice run: the free daily cap applies', async () => {
    mockGate.allowance = 0
    mockQuestionRows = [row('Q1', 'One?')]
    mockMistakeIds = ['Q1']
    render(<MistakesScreen />)
    expect(await screen.findByText("That's today's free practice")).toBeTruthy()
    expect(mockFullMockAllowed).not.toHaveBeenCalled()
  })
})
