import { renderHook } from '@testing-library/react-native'
import { useExamRunPersistence } from '../useExamRunPersistence'

const mockDb = { __marker: 'db' }
jest.mock('../useDb', () => ({ useDb: () => mockDb }))

const mockSave = jest.fn().mockResolvedValue(undefined)
const mockLoad = jest.fn().mockResolvedValue(null)
const mockClear = jest.fn().mockResolvedValue(undefined)
jest.mock('../../services/examRuns', () => ({
  saveExamRun: (...args: unknown[]) => mockSave(...args),
  loadExamRun: (...args: unknown[]) => mockLoad(...args),
  clearExamRun: (...args: unknown[]) => mockClear(...args),
}))

describe('useExamRunPersistence', () => {
  beforeEach(() => jest.clearAllMocks())

  it('binds saveRun/loadRun/clearRun to the current db from useDb()', async () => {
    const { result } = renderHook(() => useExamRunPersistence())
    const state = {
      runKey: 'exam:upcat', kind: 'exam', slug: 'upcat', mode: 'full',
      questionIds: [], sectionNames: [], answers: {}, idx: 0, sectionIdx: 0,
      floorIdx: 0, endTime: null, sectionEndTime: null, startedAt: 1,
    }
    await result.current.saveRun(state)
    expect(mockSave).toHaveBeenCalledWith(mockDb, state)

    await result.current.loadRun('exam:upcat')
    expect(mockLoad).toHaveBeenCalledWith(mockDb, 'exam:upcat')

    await result.current.clearRun('exam:upcat')
    expect(mockClear).toHaveBeenCalledWith(mockDb, 'exam:upcat')
  })
})
