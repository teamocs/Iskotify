/**
 * P1b analytics consent. Analytics never runs until consent allows it, stops
 * (and is opted out of the SDK) when switched off, and resumes when switched on.
 * Identity is held in memory only and sent after consent, never before.
 */
const OLD_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY
beforeEach(() => { process.env.EXPO_PUBLIC_POSTHOG_KEY = 'phc_test' })
afterAll(() => { process.env.EXPO_PUBLIC_POSTHOG_KEY = OLD_KEY })

describe('web (posthog-js)', () => {
  function load() {
    const ph = {
      init: jest.fn(), capture: jest.fn(), identify: jest.fn(), reset: jest.fn(),
      opt_in_capturing: jest.fn(), opt_out_capturing: jest.fn(), set_config: jest.fn(),
    }
    let a: typeof import('../analytics')
    jest.isolateModules(() => {
      jest.doMock('posthog-js', () => ({ __esModule: true, default: ph }))
      // Explicit extension: jest-expo would otherwise resolve the .native file.
      a = require('../analytics.ts')
    })
    return { ph, a: a! }
  }

  it('does not initialise or send anything before consent', () => {
    const { ph, a } = load()
    a.initAnalytics()
    a.capture('x')
    a.screenView('/home')
    a.identifyUser('user-1')
    expect(ph.init).not.toHaveBeenCalled()
    expect(ph.capture).not.toHaveBeenCalled()
    expect(ph.identify).not.toHaveBeenCalled()
  })

  it('initialises with autocapture on once consent allows it', () => {
    const { ph, a } = load()
    a.setAnalyticsConsent(true)
    expect(ph.init).toHaveBeenCalledTimes(1)
    expect(ph.init.mock.calls[0]![1]).toMatchObject({ autocapture: true })
    expect(ph.opt_in_capturing).toHaveBeenCalled()
    a.capture('x')
    expect(ph.capture).toHaveBeenCalledWith('x', undefined)
  })

  it('switching off opts the SDK out, disables autocapture, forgets the identity and stops events', () => {
    const { ph, a } = load()
    a.setAnalyticsConsent(true)
    a.setAnalyticsConsent(false)
    expect(ph.opt_out_capturing).toHaveBeenCalled()
    expect(ph.set_config).toHaveBeenCalledWith({ autocapture: false })
    expect(ph.reset).toHaveBeenCalled()
    ph.capture.mockClear()
    a.capture('after')
    a.screenView('/x')
    expect(ph.capture).not.toHaveBeenCalled()
  })

  it('switching back on opts in again and re-enables autocapture without a second init', () => {
    const { ph, a } = load()
    a.setAnalyticsConsent(true)
    a.setAnalyticsConsent(false)
    ph.opt_in_capturing.mockClear()
    a.setAnalyticsConsent(true)
    expect(ph.init).toHaveBeenCalledTimes(1)
    expect(ph.opt_in_capturing).toHaveBeenCalled()
    expect(ph.set_config).toHaveBeenLastCalledWith({ autocapture: true })
    a.capture('again')
    expect(ph.capture).toHaveBeenCalledWith('again', undefined)
  })

  it('an account id seen before consent is sent only after consent, and never if consent never comes', () => {
    const { ph, a } = load()
    a.identifyUser('user-1')
    expect(ph.identify).not.toHaveBeenCalled()
    a.setAnalyticsConsent(true)
    expect(ph.identify).toHaveBeenCalledWith('user-1')
  })

  it('turning consent off removes the held identity so a later opt-in does not resurrect it', () => {
    const { ph, a } = load()
    a.setAnalyticsConsent(true)
    a.identifyUser('user-1')
    a.setAnalyticsConsent(false)
    ph.identify.mockClear()
    a.setAnalyticsConsent(true)
    expect(ph.identify).not.toHaveBeenCalled()
  })

  it('resetAnalytics (sign-out, account switch, reset) also switches analytics off until consent is applied again', () => {
    const { ph, a } = load()
    a.setAnalyticsConsent(true)
    a.identifyUser('user-1')
    a.resetAnalytics()
    expect(ph.opt_out_capturing).toHaveBeenCalled()
    expect(ph.reset).toHaveBeenCalled()
    ph.capture.mockClear(); ph.identify.mockClear()
    a.capture('after')
    a.identifyUser('user-2')
    expect(ph.capture).not.toHaveBeenCalled()
    expect(ph.identify).not.toHaveBeenCalled()
  })

  it('applying the same "on" again (the root gate does on every route change) sends nothing new', () => {
    const { ph, a } = load()
    a.identifyUser('user-1')
    a.setAnalyticsConsent(true)
    ph.opt_in_capturing.mockClear(); ph.identify.mockClear(); ph.set_config.mockClear()
    a.setAnalyticsConsent(true)
    expect(ph.opt_in_capturing).not.toHaveBeenCalled()
    expect(ph.identify).not.toHaveBeenCalled()
    expect(ph.set_config).not.toHaveBeenCalled()
  })

  it('does nothing without a key', () => {
    process.env.EXPO_PUBLIC_POSTHOG_KEY = ''
    const { ph, a } = load()
    a.setAnalyticsConsent(true)
    expect(ph.init).not.toHaveBeenCalled()
  })
})

describe('native (posthog-react-native)', () => {
  function load() {
    const client = { capture: jest.fn(), identify: jest.fn(), screen: jest.fn(), reset: jest.fn(), optIn: jest.fn(), optOut: jest.fn() }
    const Ctor = jest.fn().mockImplementation(() => client)
    let a: typeof import('../analytics')
    // The SDK is required lazily (after this callback returns), so drop the module cache first.
    jest.resetModules()
    jest.isolateModules(() => {
      jest.doMock('posthog-react-native', () => ({ __esModule: true, default: Ctor }))
      a = require('../analytics.native')
    })
    return { client, Ctor, a: a! }
  }

  it('never constructs the SDK or sends anything before consent', () => {
    const { client, Ctor, a } = load()
    a.initAnalytics()
    a.capture('x')
    a.screenView('/home')
    a.identifyUser('user-1')
    expect(Ctor).not.toHaveBeenCalled()
    expect(client.capture).not.toHaveBeenCalled()
    expect(client.identify).not.toHaveBeenCalled()
  })

  it('starts once consent allows it, then opts out and in as the switch moves', () => {
    const { client, Ctor, a } = load()
    a.setAnalyticsConsent(true)
    expect(Ctor).toHaveBeenCalledTimes(1)
    a.capture('x')
    expect(client.capture).toHaveBeenCalledTimes(1)

    a.setAnalyticsConsent(false)
    expect(client.optOut).toHaveBeenCalled()
    expect(client.reset).toHaveBeenCalled()
    client.capture.mockClear()
    a.capture('y')
    a.screenView('/z')
    expect(client.capture).not.toHaveBeenCalled()
    expect(client.screen).not.toHaveBeenCalled()

    a.setAnalyticsConsent(true)
    expect(Ctor).toHaveBeenCalledTimes(1)
    expect(client.optIn).toHaveBeenCalled()
    a.capture('again')
    expect(client.capture).toHaveBeenCalledTimes(1)
  })

  it('resetAnalytics also switches analytics off: the next account id is only held', () => {
    const { client, a } = load()
    a.setAnalyticsConsent(true)
    a.resetAnalytics()
    expect(client.optOut).toHaveBeenCalled()
    expect(client.reset).toHaveBeenCalled()
    client.capture.mockClear()
    a.capture('after')
    a.identifyUser('user-2')
    expect(client.capture).not.toHaveBeenCalled()
    expect(client.identify).not.toHaveBeenCalled()
  })

  it('applying the same "on" again sends nothing new', () => {
    const { client, a } = load()
    a.identifyUser('user-1')
    a.setAnalyticsConsent(true)
    client.optIn.mockClear(); client.identify.mockClear()
    a.setAnalyticsConsent(true)
    expect(client.optIn).not.toHaveBeenCalled()
    expect(client.identify).not.toHaveBeenCalled()
  })

  it('holds an account id until consent, then identifies by id only', () => {
    const { client, a } = load()
    a.identifyUser('user-1')
    expect(client.identify).not.toHaveBeenCalled()
    a.setAnalyticsConsent(true)
    expect(client.identify.mock.calls).toEqual([['user-1']])
  })
})
