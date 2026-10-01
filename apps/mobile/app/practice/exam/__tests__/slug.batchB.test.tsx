import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native'
import { Alert } from 'react-native'
import BlueprintExam from '../[slug]'
import type { ExamBlueprint } from '../../../../services/examBlueprints'
import type { RawUpcatQuestion } from '../../../../utils/upcatExam'

// Logic audit, Batch B — exam runner: section lock, chained section clocks,
// honest prestart counts, stale saved runs. Everything else about the screen
// lives in slug.test.tsx / slug.focus.test.tsx.

const mockRouterBack = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: () => {}, replace: () => {}, back: (...a: unknown[]) => mockRouterBack(...a) },
  useLocalSearchParams: () => ({ slug: 'test-mock' }),
}))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }))
jest.mock('../../../../services/questionReports', () => ({ submitQuestionReport: jest.fn().mockResolvedValue(undefined) }))
jest.mock('../../../../hooks/useDb', () => {
  const db = {}
  return { useDb: () => db }
})
const mockRecordSession = jest.fn(() => Promise.resolve())
jest.mock('../../../../hooks/useRecordSession', () => ({ useRecordSession: () => ({ recordSession: mockRecordSession }) }))
const mockRecordAttempts = jest.fn().mockResolvedValue(undefined)
jest.mock('../../../../hooks/useRecordAttempts', () => ({ useRecordAttempts: () => ({ recordAttempts: mockRecordAttempts }) }))
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
const mockSaveRun = jest.fn().mockResolvedValue(undefined)
const mockLoadRun = jest.fn().mockResolvedValue(null)
const mockClearRun = jest.fn().mockResolvedValue(undefined)
jest.mock('../../../../hooks/useExamRunPersistence', () => ({
  useExamRunPersistence: () => ({ saveRun: mockSaveRun, loadRun: mockLoadRun, clearRun: mockClearRun }),
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

describe('BlueprintExam: Batch B', () => {
  let randomSpy: jest.SpyInstance
  let alertSpy: jest.SpyInstance

  beforeEach(() => {
    jest.useRealTimers()
    mockRecordSession.mockClear(); mockRecordAttempts.mockClear(); mockRouterBack.mockClear()
    mockSaveRun.mockClear(); mockLoadRun.mockClear().mockResolvedValue(null); mockClearRun.mockClear()
    mockGetExamBlueprint.mockResolvedValue(BLOCKED)
    mockGetQuestionsByCategory.mockResolvedValue(new Map([['a', [A1, A2]], ['b', [B1, B2]]]))
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    // Math.random 0 reverses each 2-item pool: flat order is [A2, A1, B2, B1].
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0)
  })
  afterEach(() => { randomSpy.mockRestore(); alertSpy.mockRestore() })

  async function startFull() {
    render(<BlueprintExam />)
    await waitFor(() => expect(screen.getByText('Full Mock')).toBeTruthy())
    fireEvent.press(screen.getByText('Full Mock'))
    await waitFor(() => expect(screen.getByText('A2?')).toBeTruthy())
  }
  function confirmLast() {
    const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1]![2] as { text: string; style?: string; onPress?: () => void }[]
    return act(async () => { buttons.find(b => b.style !== 'cancel' && b.onPress)!.onPress!() })
  }

  // ── B1 ─────────────────────────────────────────────────────────────────
  describe('B1: section lock', () => {
    it('the last question of a section offers "Finish section", never Skip/Next into the next section', async () => {
      await startFull()
      fireEvent.press(screen.getByText('Skip')) // A2 -> A1 (last of Math)
      await waitFor(() => expect(screen.getByText('A1?')).toBeTruthy())
      expect(screen.queryByText('Skip')).toBeNull()
      expect(screen.queryByText('Next')).toBeNull()
      expect(screen.getByText('Finish section')).toBeTruthy()
      expect(screen.queryByText('Review & submit')).toBeNull()
    })

    it('Finish section asks for confirmation, then locks the section and opens the next', async () => {
      await startFull()
      fireEvent.press(screen.getByText('Skip'))
      await waitFor(() => expect(screen.getByText('A1?')).toBeTruthy())
      fireEvent.press(screen.getByText('Finish section'))
      expect(alertSpy).toHaveBeenCalled()
      expect(screen.getByText('A1?')).toBeTruthy() // not advanced until confirmed
      await confirmLast()
      await waitFor(() => expect(screen.getByText('B2?')).toBeTruthy())
      // Math is locked: Back at the first question of Science is disabled.
      fireEvent.press(screen.getByText('Back'))
      expect(screen.getByText('B2?')).toBeTruthy()
    })

    it('the navigator cannot jump into a later section', async () => {
      await startFull()
      fireEvent.press(screen.getByRole('button', { name: 'All questions' }))
      fireEvent.press(await screen.findByLabelText(/^Question 3,/)) // first Science question
      expect(screen.getByText('A2?')).toBeTruthy()
      expect(screen.queryByText('B2?')).toBeNull()
    })
  })

  // ── B3: chained section clocks ───────────────────────────────────────────
  describe('B3: section clocks chain from the previous end', () => {
    it('resuming after a section expired gives the next section the time left, not a fresh full clock', async () => {
      const expiredAt = Date.now() - 60_000 // Math (5 min) expired one minute ago
      mockLoadRun.mockResolvedValue({
        runKey: 'exam:test-mock', kind: 'exam', slug: 'test-mock', mode: 'full',
        questionIds: ['A2', 'A1', 'B2', 'B1'], sectionNames: ['Math', 'Math', 'Science', 'Science'],
        answers: {}, idx: 0, sectionIdx: 0, floorIdx: 0,
        endTime: Date.now() + 14 * 60_000, sectionEndTime: expiredAt, startedAt: Date.now() - 6 * 60_000, updatedAt: Date.now(),
      })
      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Resume where you left off')).toBeTruthy())
      fireEvent.press(screen.getByText('Resume where you left off'))
      await waitFor(() => expect(screen.getByText('B2?')).toBeTruthy())
      await waitFor(() => {
        const last = mockSaveRun.mock.calls[mockSaveRun.mock.calls.length - 1]![0]
        expect(last.sectionIdx).toBe(1)
        expect(last.sectionEndTime).toBe(expiredAt + 10 * 60_000)
      })
    })
  })

  // ── B4: honest prestart ──────────────────────────────────────────────────
  describe('B4: prestart shows what will really run', () => {
    it('lists the real built count per section and "Not available yet" for an empty section', async () => {
      mockGetExamBlueprint.mockResolvedValue({
        ...BLOCKED,
        totalItems: 99,
        sections: [sec('s1', 'Math', 'a', 5, 5, 0), sec('s2', 'Science', 'b', 2, 10, 1), sec('s3', 'Mechanical-Technical Ability', 'c', 5, 5, 2)],
      })
      mockGetQuestionsByCategory.mockResolvedValue(new Map([['a', [A1, A2]], ['b', [B1, B2]]]))
      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Full Mock')).toBeTruthy())
      expect(screen.getAllByText(/^2 items/).length).toBe(2)
      expect(screen.queryByText(/^5 items/)).toBeNull()
      expect(screen.getByText('Not available yet')).toBeTruthy()
      expect(screen.queryByText('Coming soon')).toBeNull()
      // Header "Items" is the real built total (4), not the declared 99.
      expect(screen.queryByText('99')).toBeNull()
      expect(screen.getByText('4')).toBeTruthy()
    })
  })

  // ── B5: stale saved runs ─────────────────────────────────────────────────
  describe('B5: a saved run whose time has run out', () => {
    const staleRun = () => ({
      runKey: 'exam:test-mock', kind: 'exam', slug: 'test-mock', mode: 'full',
      questionIds: ['A2', 'A1', 'B2', 'B1'], sectionNames: ['Math', 'Math', 'Science', 'Science'],
      answers: { 0: 1 }, idx: 1, sectionIdx: 0, floorIdx: 0,
      endTime: Date.now() - 3_600_000, sectionEndTime: null, startedAt: 424242, updatedAt: Date.now() - 3_600_000,
    })

    it('offers Submit / Discard instead of resuming, and does not auto-submit', async () => {
      mockGetExamBlueprint.mockResolvedValue({ ...BLOCKED, sectionBlocked: false })
      mockLoadRun.mockResolvedValue(staleRun())
      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Submit what I answered')).toBeTruthy())
      expect(screen.getByText('Discard')).toBeTruthy()
      expect(screen.queryByText('Resume where you left off')).toBeNull()
      expect(mockRecordAttempts).not.toHaveBeenCalled()
    })

    it('Submit writes only the questions the student reached, under the saved startedAt', async () => {
      mockGetExamBlueprint.mockResolvedValue({ ...BLOCKED, sectionBlocked: false })
      mockLoadRun.mockResolvedValue(staleRun())
      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Submit what I answered')).toBeTruthy())
      fireEvent.press(screen.getByText('Submit what I answered'))
      await waitFor(() => expect(screen.getByText('Per-section')).toBeTruthy())
      const rows = mockRecordAttempts.mock.calls[0]![0] as any[]
      // reached = answered (idx 0) + visited up to the saved position (idx 1); B2/B1 never seen.
      expect(rows.map(r => r.questionId)).toEqual(['A2', 'A1'])
      expect(rows[1].selectedIndex).toBeNull()
      expect(rows.every(r => r.sessionKey === 424242)).toBe(true)
      expect(mockRecordSession).toHaveBeenCalledWith(expect.objectContaining({ attemptKey: 424242, startTime: 424242 }))
      // Science was never reached: no 0% session is written for it.
      expect(mockRecordSession).toHaveBeenCalledTimes(1)
    })

    it('Discard clears the saved run and returns to a fresh start', async () => {
      mockGetExamBlueprint.mockResolvedValue({ ...BLOCKED, sectionBlocked: false })
      mockLoadRun.mockResolvedValue(staleRun())
      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Discard')).toBeTruthy())
      fireEvent.press(screen.getByText('Discard'))
      expect(mockClearRun).toHaveBeenCalledWith('exam:test-mock')
      await waitFor(() => expect(screen.queryByText('Submit what I answered')).toBeNull())
      expect(mockRecordAttempts).not.toHaveBeenCalled()
    })

    it('resuming a live run keeps the original startedAt for the attempt key', async () => {
      mockGetExamBlueprint.mockResolvedValue({ ...BLOCKED, sectionBlocked: false })
      mockLoadRun.mockResolvedValue({ ...staleRun(), endTime: Date.now() + 600_000, idx: 3, answers: { 0: 1, 1: 1, 2: 1, 3: 1 } })
      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Resume where you left off')).toBeTruthy())
      fireEvent.press(screen.getByText('Resume where you left off'))
      await waitFor(() => expect(screen.getByText('Review & submit')).toBeTruthy())
      fireEvent.press(screen.getByText('Review & submit'))
      fireEvent.press(await screen.findByRole('button', { name: /submit exam/i }))
      await confirmLast()
      expect(mockRecordAttempts.mock.calls[0]![0][0].sessionKey).toBe(424242)
    })
  })

  // ── Review fixes ───────────────────────────────────────────────────────────
  describe('finish-section confirm after the section clock expired', () => {
    afterEach(() => { jest.useRealTimers() })

    it('is a no-op: it neither moves the student back nor resets the running clock', async () => {
      jest.useFakeTimers()
      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Full Mock')).toBeTruthy())
      const t0 = Date.now()
      fireEvent.press(screen.getByText('Full Mock'))
      await waitFor(() => expect(screen.getByText('A2?')).toBeTruthy())
      fireEvent.press(screen.getByText('Skip'))
      await waitFor(() => expect(screen.getByText('A1?')).toBeTruthy())
      fireEvent.press(screen.getByText('Finish section')) // dialog opens, left unanswered
      // Math (5 min) runs out while the dialog is still open: the tick advances to Science.
      await act(async () => { jest.advanceTimersByTime(5 * 60_000 + 5_000) })
      await waitFor(() => expect(screen.getByText('B2?')).toBeTruthy())
      fireEvent.press(screen.getByText('Skip')) // student moves on inside Science
      await waitFor(() => expect(screen.getByText('B1?')).toBeTruthy())
      mockSaveRun.mockClear()
      await confirmLast() // the stale "Finish section" confirm fires now
      expect(screen.getByText('B1?')).toBeTruthy() // not dragged back to B2
      expect(screen.queryByText('B2?')).toBeNull()
      const runs = mockSaveRun.mock.calls.map(c => c[0])
      for (const r of runs) {
        expect(r.sectionIdx).toBe(1)
        expect(r.sectionEndTime).toBe(t0 + 15 * 60_000) // chained from Math's end, never reset to now + 10 min
      }
    })

    it('is a no-op once the exam was submitted', async () => {
      jest.useFakeTimers()
      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Full Mock')).toBeTruthy())
      fireEvent.press(screen.getByText('Full Mock'))
      await waitFor(() => expect(screen.getByText('A2?')).toBeTruthy())
      fireEvent.press(screen.getByText('Skip'))
      await waitFor(() => expect(screen.getByText('A1?')).toBeTruthy())
      fireEvent.press(screen.getByText('Finish section'))
      await act(async () => { jest.advanceTimersByTime(16 * 60_000) }) // whole exam runs out: auto-submit
      await waitFor(() => expect(screen.getByText('Per-section')).toBeTruthy())
      mockSaveRun.mockClear()
      await confirmLast()
      expect(screen.getByText('Per-section')).toBeTruthy()
      expect(mockSaveRun).not.toHaveBeenCalled()
    })
  })

  describe('session totals count only reached questions', () => {
    const run = (over: object = {}) => ({
      runKey: 'exam:test-mock', kind: 'exam', slug: 'test-mock', mode: 'full',
      questionIds: ['A2', 'A1', 'B2', 'B1'], sectionNames: ['Math', 'Math', 'Science', 'Science'],
      answers: { 0: 1 }, idx: 0, sectionIdx: 0, floorIdx: 0,
      endTime: Date.now() - 3_600_000, sectionEndTime: null, startedAt: 424242, updatedAt: Date.now() - 3_600_000, ...over,
    })

    it('a half-reached section is persisted as 1/1, matching its single attempt row', async () => {
      mockGetExamBlueprint.mockResolvedValue({ ...BLOCKED, sectionBlocked: false })
      mockLoadRun.mockResolvedValue(run())
      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Submit what I answered')).toBeTruthy())
      fireEvent.press(screen.getByText('Submit what I answered'))
      await waitFor(() => expect(screen.getByText('Per-section')).toBeTruthy())
      expect(mockRecordAttempts.mock.calls[0]![0]).toHaveLength(1)
      expect(mockRecordSession).toHaveBeenCalledTimes(1)
      expect(mockRecordSession).toHaveBeenCalledWith(expect.objectContaining({ score: 1, total: 1 }))
    })

    it('the results screen agrees: breakdown and score card use reached questions, with an honest note', async () => {
      mockGetExamBlueprint.mockResolvedValue({ ...BLOCKED, sectionBlocked: false })
      mockLoadRun.mockResolvedValue(run())
      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Submit what I answered')).toBeTruthy())
      fireEvent.press(screen.getByText('Submit what I answered'))
      await waitFor(() => expect(screen.getByText('Per-section')).toBeTruthy())
      expect(screen.getAllByText('1/1 correct · 100%').length).toBe(1)
      expect(screen.getByText('1/1 correct')).toBeTruthy()
      expect(screen.queryByLabelText('Science score')).toBeNull() // nothing reached: no breakdown row
      expect(screen.getByLabelText('Math score')).toBeTruthy()
      expect(screen.getByText(/Questions you never reached are not counted/)).toBeTruthy()
    })
  })

  describe('restoring a run into a shorter rebuilt exam', () => {
    const saved = (over: object = {}) => ({
      runKey: 'exam:test-mock', kind: 'exam', slug: 'test-mock', mode: 'full',
      questionIds: ['A2', 'A1', 'B2', 'B1'], sectionNames: ['Math', 'Math', 'Science', 'Science'],
      answers: {}, idx: 2, sectionIdx: 1, floorIdx: 2,
      endTime: Date.now() + 14 * 60_000, sectionEndTime: Date.now() + 9 * 60_000, startedAt: Date.now() - 60_000, updatedAt: Date.now(), ...over,
    })
    const resume = async () => {
      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Resume where you left off')).toBeTruthy())
      fireEvent.press(screen.getByText('Resume where you left off'))
    }
    const lastSaved = () => mockSaveRun.mock.calls[mockSaveRun.mock.calls.length - 1]![0]

    it('clamps a saved section index past the rebuilt sections, so the lock stays on', async () => {
      mockLoadRun.mockResolvedValue(saved({ sectionIdx: 7 }))
      await resume()
      await waitFor(() => expect(screen.getByText('B2?')).toBeTruthy())
      await waitFor(() => expect(lastSaved().sectionIdx).toBe(1))
      expect(lastSaved().floorIdx).toBe(2)
    })

    it('when the earlier section vanished, the surviving one becomes section 0 with its own floor', async () => {
      mockGetQuestionsByCategory.mockResolvedValue(new Map([['b', [B1, B2]]]))
      mockLoadRun.mockResolvedValue(saved())
      await resume()
      await waitFor(() => expect(screen.getByText('B2?')).toBeTruthy())
      await waitFor(() => expect(lastSaved().sectionIdx).toBe(0))
      expect(lastSaved().floorIdx).toBe(0)
    })
  })

  describe('prestart: "matched to the items available now" copy', () => {
    it('is not shown when every item is available and only the section minutes differ from the blueprint total', async () => {
      mockGetExamBlueprint.mockResolvedValue({ ...BLOCKED, totalTimeMinutes: 20 }) // sections run 5 + 10
      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Full Mock')).toBeTruthy())
      expect(screen.queryByText(/matched to the items available now/)).toBeNull()
    })

    it('is shown when the built exam really has fewer items than the blueprint sections declare', async () => {
      mockGetExamBlueprint.mockResolvedValue({
        ...BLOCKED, sections: [sec('s1', 'Math', 'a', 5, 5, 0), sec('s2', 'Science', 'b', 2, 10, 1)],
      })
      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Full Mock')).toBeTruthy())
      expect(screen.getByText(/matched to the items available now/)).toBeTruthy()
    })
  })
})
