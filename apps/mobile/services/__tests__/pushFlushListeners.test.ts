/** Batch C review (1c) — queued backup edits are flushed when the app is hidden / backgrounded. */
import { installPushFlushListeners } from '../pushFlushListeners'
const mockPlatform = { OS: 'ios' as string }
const mockAppStateListeners: ((s: string) => void)[] = []
const mockRemove = jest.fn()

jest.mock('react-native', () => ({
  get Platform() { return mockPlatform },
  AppState: {
    addEventListener: (_: string, cb: (s: string) => void) => {
      mockAppStateListeners.push(cb)
      return { remove: mockRemove }
    },
  },
}))
const mockFlush = jest.fn().mockResolvedValue(undefined)
jest.mock('../pushScheduler', () => ({ flushPendingPush: () => mockFlush() }))


beforeEach(() => {
  mockFlush.mockClear(); mockRemove.mockClear(); mockAppStateListeners.length = 0
})

describe('native', () => {
  beforeEach(() => { mockPlatform.OS = 'ios' })

  it('flushes when AppState goes to background, not when it becomes active', () => {
    const dispose = installPushFlushListeners()
    mockAppStateListeners[0]!('active')
    expect(mockFlush).not.toHaveBeenCalled()
    mockAppStateListeners[0]!('background')
    expect(mockFlush).toHaveBeenCalledTimes(1)
    dispose()
    expect(mockRemove).toHaveBeenCalled()
  })
})

describe('web', () => {
  const handlers: Record<string, (() => void)[]> = {}
  const doc = { visibilityState: 'visible' as string, addEventListener: jest.fn(), removeEventListener: jest.fn() }
  const win = { addEventListener: jest.fn(), removeEventListener: jest.fn() }
  beforeEach(() => {
    mockPlatform.OS = 'web'
    for (const k of Object.keys(handlers)) delete handlers[k]
    win.addEventListener.mockImplementation((e: string, cb: () => void) => { (handlers[`w:${e}`] ??= []).push(cb) })
    doc.addEventListener.mockImplementation((e: string, cb: () => void) => { (handlers[`d:${e}`] ??= []).push(cb) })
    doc.visibilityState = 'visible'
    ;(globalThis as any).window = win
    ;(globalThis as any).document = doc
  })
  afterEach(() => { delete (globalThis as any).window; delete (globalThis as any).document })

  it('flushes on pagehide and when the tab becomes hidden, but not when it becomes visible', () => {
    const dispose = installPushFlushListeners()
    handlers['w:pagehide']![0]!()
    expect(mockFlush).toHaveBeenCalledTimes(1)
    doc.visibilityState = 'visible'
    handlers['d:visibilitychange']![0]!()
    expect(mockFlush).toHaveBeenCalledTimes(1)
    doc.visibilityState = 'hidden'
    handlers['d:visibilitychange']![0]!()
    expect(mockFlush).toHaveBeenCalledTimes(2)
    dispose()
    expect(win.removeEventListener).toHaveBeenCalledWith('pagehide', expect.any(Function))
    expect(doc.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })
})
