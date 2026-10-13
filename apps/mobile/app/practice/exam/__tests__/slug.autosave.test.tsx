import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native'
import { Alert } from 'react-native'
import BlueprintExam from '../[slug]'
import type { ExamBlueprint } from '../../../../services/examBlueprints'
import type { RawUpcatQuestion } from '../../../../utils/upcatExam'

// Autosave cadence. The other exam suites mock useExamRunPersistence with
// stable functions; this one runs the REAL hook (only the SQLite service is
// mocked) so a hook that hands out new function identities on every render
// shows up here: the 1 Hz timer re-renders the screen, and an unstable
// saveRun in the autosave effect's deps would write the run every second.

jest.mock('expo-router', () => ({
  router: { push: () => {}, replace: () => {}, back: () => {} },
  useLocalSearchParams: () => ({ slug: 'test-mock' }),
}))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }))
jest.mock('../../../../services/questionReports', () => ({ submitQuestionReport: jest.fn().mockResolvedValue(undefined) }))
jest.mock('../../../../hooks/useDb', () => {
  const db = {}
  return { useDb: () => db }
})
jest.mock('../../../../hooks/useRecordSession', () => ({ useRecordSession: () => ({ recordSession: jest.fn(() => Promise.resolve()) }) }))
jest.mock('../../../../hooks/useRecordAttempts', () => ({ useRecordAttempts: () => ({ recordAttempts: jest.fn().mockResolvedValue(undefined) }) }))
jest.mock('../../../../hooks/useAdmissionEstimate', () => ({
  loadAdmissionEstimateSnapshot: jest.fn().mockResolvedValue({ status: 'not-ready', readiness: null, result: null }),
}))
const mockGetExamBlueprint = jest.fn()
const mockGetQuestionsByCategory = jest.fn()
jest.mock('../../../../services/examBlueprints', () => ({
  getExamBlueprint: (...a: unknown[]) => mockGetExamBlueprint(...a),
  getQuestionsByCategory: (...a: unknown[]) => mockGetQuestionsByCategory(...a),
  getAllPassages: jest.fn().mockResolvedValue([]),
  getTargetCourseClusters: jest.fn().mockResolvedValue([]),
}))
jest.mock('../../../../hooks/usePreventLeave', () => ({ usePreventLeave: jest.fn() }))

// The real useExamRunPersistence, over a mocked SQLite service.
const mockSaveExamRun = jest.fn().mockResolvedValue(undefined)
jest.mock('../../../../services/examRuns', () => ({
  saveExamRun: (...a: unknown[]) => mockSaveExamRun(...a),
  loadExamRun: jest.fn().mockResolvedValue(null),
  clearExamRun: jest.fn().mockResolvedValue(undefined),
}))

const mkQ = (id: string, text: string, subtest = 'Mathematics'): RawUpcatQuestion => ({
  questionId: id, subtest, questionText: text, options: ['o1', 'o2', 'o3', 'o4'],
  correctIndex: 1, explanation: '', setId: null, setPosition: null,
})
const A1 = mkQ('A1', 'A1?'), A2 = mkQ('A2', 'A2?'), B1 = mkQ('B1', 'B1?', 'Science'), B2 = mkQ('B2', 'B2?', 'Science')
const sec = (id: string, name: string, skillCategory: string, itemCount: number, timeMinutes: number | null, displayOrder: number) =>
  ({ id, name, skillCategory, itemCount, timeMinutes, requiresSpatialLogic: false, displayOrder })

const BLOCKED: ExamBlueprint = {
  slug: 'test-mock', name: 'Blocked Mock', acronym: 'BM', totalItems: 4, totalTimeMinutes: 15,
  hasGuessingPenalty: false, guessingPenalty: 0.25, sectionBlocked: true, scoringNote: '', mechanicsNote: '',
  sections: [sec('s1', 'Math', 'a', 2, 5, 0), sec('s2', 'Science', 'b', 2, 10, 1)],
  courseNotes: [],
}

type Saved = { answers: Record<number, number>; idx: number; sectionIdx: number }
const lastSaved = () => mockSaveExamRun.mock.calls[mockSaveExamRun.mock.calls.length - 1]![1] as Saved

describe('BlueprintExam autosave cadence (real useExamRunPersistence)', () => {
  let randomSpy: jest.SpyInstance
  let alertSpy: jest.SpyInstance

  beforeEach(() => {
    jest.useFakeTimers()
    mockSaveExamRun.mockClear()
    mockGetExamBlueprint.mockResolvedValue(BLOCKED)
    mockGetQuestionsByCategory.mockResolvedValue(new Map([['a', [A1, A2]], ['b', [B1, B2]]]))
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    // Math.random 0 reverses each 2-item pool: flat order is [A2, A1, B2, B1].
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0)
  })
  afterEach(() => { randomSpy.mockRestore(); alertSpy.mockRestore(); jest.useRealTimers() })

  async function startFull() {
    render(<BlueprintExam />)
    await waitFor(() => expect(screen.getByText('Full Mock')).toBeTruthy())
    fireEvent.press(screen.getByText('Full Mock'))
    await waitFor(() => expect(screen.getByText('A2?')).toBeTruthy())
    await waitFor(() => expect(mockSaveExamRun).toHaveBeenCalled())
  }

  it('10 s of the clock running without an answer does not write the run again', async () => {
    await startFull()
    const before = mockSaveExamRun.mock.calls.length
    for (let s = 0; s < 10; s++) await act(async () => { jest.advanceTimersByTime(1000) })
    expect(mockSaveExamRun.mock.calls.length - before).toBeLessThanOrEqual(1)
  })

  it('answering saves the answer', async () => {
    await startFull()
    const before = mockSaveExamRun.mock.calls.length
    fireEvent.press(screen.getByText('o2'))
    await waitFor(() => expect(mockSaveExamRun.mock.calls.length).toBeGreaterThan(before))
    expect(lastSaved().answers).toEqual({ 0: 1 })
  })

  it('moving to another question saves the new index', async () => {
    await startFull()
    const before = mockSaveExamRun.mock.calls.length
    fireEvent.press(screen.getByText('Skip'))
    await waitFor(() => expect(screen.getByText('A1?')).toBeTruthy())
    await waitFor(() => expect(mockSaveExamRun.mock.calls.length).toBeGreaterThan(before))
    expect(lastSaved().idx).toBe(1)
  })

  it('finishing a section saves the new section', async () => {
    await startFull()
    fireEvent.press(screen.getByText('Skip'))
    await waitFor(() => expect(screen.getByText('A1?')).toBeTruthy())
    fireEvent.press(screen.getByText('Finish section'))
    const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1]![2] as { style?: string; onPress?: () => void }[]
    const before = mockSaveExamRun.mock.calls.length
    await act(async () => { buttons.find(b => b.style !== 'cancel' && b.onPress)!.onPress!() })
    await waitFor(() => expect(screen.getByText('B2?')).toBeTruthy())
    await waitFor(() => expect(mockSaveExamRun.mock.calls.length).toBeGreaterThan(before))
    expect(lastSaved()).toMatchObject({ idx: 2, sectionIdx: 1 })
  })
})
