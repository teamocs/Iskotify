// Review finding #3 (MEDIUM): db/webPersist.ts's debounced schedule can lose
// the latest write on tab close. flushWebPersist() gives callers (the
// beforeunload handler) a way to force an immediate, un-debounced persist.
//
// Each test re-requires the module in isolation (jest.isolateModules) so the
// module-level _scheduleFn/_flushFn registration from one test never leaks
// into another — this module's state is intentionally a singleton in
// production (one web db per app instance), which would otherwise make these
// tests order-dependent.
function freshModule() {
  let mod: typeof import('../webPersist')
  jest.isolateModules(() => {
    mod = require('../webPersist')
  })
  return mod!
}

describe('webPersist', () => {
  it('scheduleWebPersist is a no-op before anything registers', () => {
    const { scheduleWebPersist } = freshModule()
    expect(() => scheduleWebPersist()).not.toThrow()
  })

  it('flushWebPersist is a no-op before anything registers', () => {
    const { flushWebPersist } = freshModule()
    expect(() => flushWebPersist()).not.toThrow()
  })

  it('scheduleWebPersist calls the registered schedule function', () => {
    const { registerWebPersist, scheduleWebPersist } = freshModule()
    const scheduleFn = jest.fn()
    registerWebPersist(scheduleFn)
    scheduleWebPersist()
    expect(scheduleFn).toHaveBeenCalledTimes(1)
  })

  it('flushWebPersist calls the registered flush function, not the schedule one', () => {
    const { registerWebPersist, flushWebPersist } = freshModule()
    const scheduleFn = jest.fn()
    const flushFn = jest.fn()
    registerWebPersist(scheduleFn, flushFn)
    flushWebPersist()
    expect(flushFn).toHaveBeenCalledTimes(1)
    expect(scheduleFn).not.toHaveBeenCalled()
  })

  it('falls back to the schedule function as the flush when no explicit flush is registered', () => {
    const { registerWebPersist, flushWebPersist } = freshModule()
    const scheduleFn = jest.fn()
    registerWebPersist(scheduleFn)
    flushWebPersist()
    expect(scheduleFn).toHaveBeenCalledTimes(1)
  })
})
