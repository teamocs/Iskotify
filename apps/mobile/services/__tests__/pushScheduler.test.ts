/**
 * Batch C review (5) — pushes are serialized: one in flight at a time, calls
 * made during a push collapse into exactly ONE trailing push, so an older push
 * can never land after a newer one. Also flush-on-demand for pull/background.
 */
import {
  schedulePushUserData, flushPendingPush, cancelPendingPush, registerPusher, PUSH_DEBOUNCE_MS, _resetPushSchedulerForTests,
} from '../pushScheduler'

const DB = {} as never

function deferred() {
  let resolve!: (v: boolean) => void
  const promise = new Promise<boolean>(r => { resolve = r })
  return { promise, resolve }
}

beforeEach(() => { jest.useFakeTimers(); _resetPushSchedulerForTests() })
afterEach(() => { jest.useRealTimers() })

describe('serialized push scheduler', () => {
  it('never runs two pushes concurrently and sends exactly one trailing push', async () => {
    const gates = [deferred(), deferred(), deferred()]
    let started = 0
    let running = 0
    let maxRunning = 0
    registerPusher(async () => {
      const g = gates[started++]!
      running++; maxRunning = Math.max(maxRunning, running)
      const ok = await g.promise
      running--
      return ok
    })

    schedulePushUserData(DB)
    await jest.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS)
    expect(started).toBe(1)

    // Three more bursts while push #1 is still in flight.
    for (let i = 0; i < 3; i++) {
      schedulePushUserData(DB)
      await jest.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS)
    }
    expect(started).toBe(1) // nothing overlapped

    gates[0]!.resolve(true)
    await jest.advanceTimersByTimeAsync(0)
    expect(started).toBe(2) // exactly one trailing push starts, after #1 finished
    gates[1]!.resolve(true)
    await jest.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS * 2)
    expect(started).toBe(2) // and no further ones
    expect(maxRunning).toBe(1)
  })

  it('an older push can never finish after a newer one starts', async () => {
    const order: string[] = []
    const g1 = deferred()
    let n = 0
    registerPusher(async () => {
      const id = ++n
      order.push(`start${id}`)
      if (id === 1) await g1.promise
      order.push(`end${id}`)
      return true
    })
    schedulePushUserData(DB)
    await jest.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS)
    schedulePushUserData(DB)
    await jest.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS)
    g1.resolve(true)
    await jest.advanceTimersByTimeAsync(0)
    expect(order).toEqual(['start1', 'end1', 'start2', 'end2'])
  })

  it('a rejected push does not wedge the queue', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const push = jest.fn().mockRejectedValueOnce(new Error('net')).mockResolvedValue(true)
    registerPusher(push)
    schedulePushUserData(DB)
    await jest.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS)
    schedulePushUserData(DB)
    await jest.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS)
    expect(push).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })
})

describe('flushPendingPush', () => {
  it('runs a debounced-but-not-yet-fired push immediately and resolves after it lands', async () => {
    const g = deferred()
    const push = jest.fn(() => g.promise)
    registerPusher(push)
    schedulePushUserData(DB)
    expect(push).not.toHaveBeenCalled()
    let done = false
    const flushed = flushPendingPush().then(() => { done = true })
    await jest.advanceTimersByTimeAsync(0)
    expect(push).toHaveBeenCalledTimes(1)
    expect(done).toBe(false)
    g.resolve(true)
    await flushed
    expect(done).toBe(true)
    await jest.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS * 2)
    expect(push).toHaveBeenCalledTimes(1) // the timer was consumed, not left to double-fire
  })

  it('waits for a push already in flight (and its trailing push)', async () => {
    const g1 = deferred(); const g2 = deferred()
    const gates = [g1, g2]
    let i = 0
    const push = jest.fn(() => gates[i++]!.promise)
    registerPusher(push)
    schedulePushUserData(DB)
    await jest.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS)
    schedulePushUserData(DB)
    await jest.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS) // dirty
    let done = false
    const flushed = flushPendingPush().then(() => { done = true })
    g1.resolve(true)
    await jest.advanceTimersByTimeAsync(0)
    expect(done).toBe(false) // trailing push still running
    g2.resolve(true)
    await flushed
    expect(done).toBe(true)
  })

  it('resolves immediately when nothing is pending', async () => {
    const push = jest.fn().mockResolvedValue(true)
    registerPusher(push)
    await flushPendingPush()
    expect(push).not.toHaveBeenCalled()
  })

  it('cancelPendingPush drops a queued push without sending it', async () => {
    const push = jest.fn().mockResolvedValue(true)
    registerPusher(push)
    schedulePushUserData(DB)
    cancelPendingPush()
    await jest.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS * 2)
    expect(push).not.toHaveBeenCalled()
  })
})

describe('flushPendingPush reports whether the edit landed', () => {
  it('resolves false when the push fails (the edit stays dirty) and true when it lands', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    registerPusher(jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true))
    schedulePushUserData(DB)
    expect(await flushPendingPush()).toBe(false)
    schedulePushUserData(DB)
    expect(await flushPendingPush()).toBe(true)
    warn.mockRestore()
  })

  it('resolves false when the pusher throws, and true when nothing is pending', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    registerPusher(jest.fn().mockRejectedValue(new Error('net')))
    schedulePushUserData(DB)
    expect(await flushPendingPush()).toBe(false)
    expect(await flushPendingPush()).toBe(true)
    warn.mockRestore()
  })
})
