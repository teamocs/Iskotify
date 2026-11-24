/** P3 Full Access: what the practice runners ask before starting a run. */
import { practiceAllowanceNow, fullMockAllowedNow } from '../premiumGate'

const mockSnap = { enabled: true, isPremium: false, unlimited: false, loading: false }
const mockReady = jest.fn(async () => undefined)
jest.mock('../premiumState', () => ({ getPremiumSnapshot: () => mockSnap, whenPremiumReady: () => mockReady() }))

const mockCount = jest.fn()
const mockMocks = jest.fn()
const mockHeld = jest.fn()
const mockHeldMock = jest.fn()
jest.mock('../premiumUsage', () => ({
  countPracticeAnswersToday: (...a: unknown[]) => mockCount(...a),
  countFullMocks: (...a: unknown[]) => mockMocks(...a),
  countPracticeHeld: (...a: unknown[]) => mockHeld(...a),
  hasHeldFullMock: (...a: unknown[]) => mockHeldMock(...a),
}))

const db = { tag: 'db' } as never

beforeEach(() => {
  Object.assign(mockSnap, { enabled: true, isPremium: false, unlimited: false, loading: false })
  mockCount.mockReset().mockResolvedValue(0)
  mockMocks.mockReset().mockResolvedValue(0)
  mockHeld.mockReset().mockResolvedValue(0)
  mockHeldMock.mockReset().mockResolvedValue(false)
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('practiceAllowanceNow', () => {
  it('flag off or Full Access: unlimited, and nothing is counted', async () => {
    Object.assign(mockSnap, { enabled: false, unlimited: true })
    expect(await practiceAllowanceNow(db)).toBe(Infinity)
    Object.assign(mockSnap, { enabled: true, isPremium: true, unlimited: true })
    expect(await practiceAllowanceNow(db)).toBe(Infinity)
    expect(mockCount).not.toHaveBeenCalled()
  })

  it('free: what is left of the 30 today', async () => {
    mockCount.mockResolvedValue(22)
    expect(await practiceAllowanceNow(db)).toBe(8)
    mockCount.mockResolvedValue(30)
    expect(await practiceAllowanceNow(db)).toBe(0)
  })

  it('free: unfinished runs hold part of the 30', async () => {
    mockCount.mockResolvedValue(10)
    mockHeld.mockResolvedValue(15)
    expect(await practiceAllowanceNow(db, 'upcat:Math:quick')).toBe(5)
    expect(mockHeld).toHaveBeenCalledWith(db, 'upcat:Math:quick')
    mockHeld.mockResolvedValue(25)
    expect(await practiceAllowanceNow(db, 'upcat:Math:quick')).toBe(0)
  })

  it('never blocks while the premium state is still loading, or when counting fails', async () => {
    mockSnap.loading = true
    expect(await practiceAllowanceNow(db)).toBe(Infinity)
    mockSnap.loading = false
    mockCount.mockRejectedValue(new Error('disk'))
    expect(await practiceAllowanceNow(db)).toBe(Infinity)
  })
})

describe('fullMockAllowedNow', () => {
  it('free: one full mock per exam', async () => {
    expect(await fullMockAllowedNow(db, 'upcat')).toBe(true)
    mockMocks.mockResolvedValue(1)
    expect(await fullMockAllowedNow(db, 'upcat')).toBe(false)
    expect(mockMocks).toHaveBeenCalledWith(db, 'upcat')
  })

  it('free: another full mock still in progress is the one free mock', async () => {
    mockHeldMock.mockResolvedValue(true)
    expect(await fullMockAllowedNow(db, 'upcat', 'exam:upcat')).toBe(false)
    expect(mockHeldMock).toHaveBeenCalledWith(db, 'upcat', 'exam:upcat')
  })

  it('flag off or Full Access: always allowed', async () => {
    mockMocks.mockResolvedValue(5)
    Object.assign(mockSnap, { enabled: false, unlimited: true })
    expect(await fullMockAllowedNow(db, 'upcat')).toBe(true)
    expect(mockMocks).not.toHaveBeenCalled()
  })
})

it('waits for the first premium answer instead of handing out unlimited access', async () => {
  mockSnap.loading = true
  mockCount.mockResolvedValue(30)
  mockMocks.mockResolvedValue(1)
  mockReady.mockImplementationOnce(async () => { mockSnap.loading = false })
  expect(await practiceAllowanceNow(db)).toBe(0)
  mockSnap.loading = true
  mockReady.mockImplementationOnce(async () => { mockSnap.loading = false })
  expect(await fullMockAllowedNow(db, 'upcat')).toBe(false)
})
