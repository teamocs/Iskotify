/**
 * The web entry gate (app/_layout.tsx, web branch). Regression cover for the
 * September 2026 flow trace in the exported web build:
 *  - a visitor who opened the app signed OUT, then signed in or created an
 *    account, was never routed: the gate returned before it subscribed to
 *    auth changes, so the form just sat there until a manual reload;
 *  - a direct load of /auth/sign-in?error=link was replaced with a bare
 *    /auth/sign-in, dropping the reason the student was sent back;
 *  - a signed-in student who opened /auth/sign-in saw the sign-in form.
 */
import { runWebEntryGate, type WebGateDeps } from '../webEntryGate'

type Listener = (event: string, hasSession: boolean) => void

function makeDeps(over: Partial<WebGateDeps> & { path?: string } = {}) {
  let listener: Listener | null = null
  const replace = jest.fn()
  const deps: WebGateDeps = {
    hasSession: jest.fn().mockResolvedValue(false),
    resolveTarget: jest.fn().mockResolvedValue('/onboarding'),
    subscribe: jest.fn((l: Listener) => { listener = l; return jest.fn() }),
    currentPath: () => over.path ?? '/',
    replace,
    onReady: jest.fn(),
    onSignedOut: jest.fn(),
    ...over,
  }
  return { deps, replace, fire: (e: string, s = true) => listener?.(e, s) }
}

const flush = () => new Promise(r => setTimeout(r, 0))

describe('runWebEntryGate', () => {
  it('signed out on an app route: goes to sign-in and hides the splash', async () => {
    const { deps, replace } = makeDeps({ path: '/practice' })
    await runWebEntryGate(deps)
    expect(replace).toHaveBeenCalledWith('/auth/sign-in')
    expect(deps.onReady).toHaveBeenCalled()
  })

  it('signed out on /auth/sign-in: stays, so ?error=link is kept', async () => {
    const { deps, replace } = makeDeps({ path: '/auth/sign-in' })
    await runWebEntryGate(deps)
    expect(replace).not.toHaveBeenCalled()
  })

  it('signed out: still listens, so signing in on the form routes the student', async () => {
    const { deps, replace, fire } = makeDeps({ path: '/auth/sign-in' })
    await runWebEntryGate(deps)
    expect(deps.subscribe).toHaveBeenCalledTimes(1)
    fire('SIGNED_IN')
    await flush()
    expect(deps.resolveTarget).toHaveBeenCalledWith('signed-in')
    expect(replace).toHaveBeenCalledWith('/onboarding')
  })

  it('a returning account that signs in on the form goes to Today, not the tour', async () => {
    const { deps, replace, fire } = makeDeps({
      path: '/auth/sign-in',
      resolveTarget: jest.fn().mockResolvedValue('/(tabs)'),
    })
    await runWebEntryGate(deps)
    fire('SIGNED_IN')
    await flush()
    expect(replace).toHaveBeenCalledWith('/(tabs)')
    expect(replace).not.toHaveBeenCalledWith(expect.stringMatching(/tour/))
  })

  it('signed in on /auth/sign-in at launch: leaves the form for the right screen', async () => {
    const { deps, replace } = makeDeps({
      path: '/auth/sign-in',
      hasSession: jest.fn().mockResolvedValue(true),
      resolveTarget: jest.fn().mockResolvedValue('/(tabs)'),
    })
    await runWebEntryGate(deps)
    expect(deps.resolveTarget).toHaveBeenCalledWith('launch')
    expect(replace).toHaveBeenCalledWith('/(tabs)')
  })

  it('a SIGNED_IN event never yanks a student who is already inside the app', async () => {
    const { deps, replace, fire } = makeDeps({
      path: '/practice/exam/upcat',
      hasSession: jest.fn().mockResolvedValue(true),
      resolveTarget: jest.fn().mockResolvedValue('/(tabs)'),
    })
    await runWebEntryGate(deps)
    fire('SIGNED_IN')
    await flush()
    expect(replace).not.toHaveBeenCalled()
  })

  it('SIGNED_OUT returns to sign-in', async () => {
    const { deps, replace, fire } = makeDeps({ path: '/', hasSession: jest.fn().mockResolvedValue(true), resolveTarget: jest.fn().mockResolvedValue('/(tabs)') })
    await runWebEntryGate(deps)
    fire('SIGNED_OUT', false)
    await flush()
    expect(deps.onSignedOut).toHaveBeenCalled()
    expect(replace).toHaveBeenLastCalledWith('/auth/sign-in')
  })

  it('a failed launch check falls back to sign-in (keeping an auth route) and still hides the splash', async () => {
    const { deps, replace } = makeDeps({ path: '/help', hasSession: jest.fn().mockRejectedValue(new Error('offline')) })
    await runWebEntryGate(deps)
    expect(replace).toHaveBeenCalledWith('/auth/sign-in')
    expect(deps.onReady).toHaveBeenCalled()
  })

  it('returns an unsubscribe for the auth listener', async () => {
    const unsub = jest.fn()
    const { deps } = makeDeps({ subscribe: jest.fn(() => unsub) })
    const stop = await runWebEntryGate(deps)
    stop()
    expect(unsub).toHaveBeenCalled()
  })
})

describe('app/_layout.tsx wiring', () => {
  const fs = require('fs') as typeof import('fs')
  const path = require('path') as typeof import('path')
  const src = fs.readFileSync(path.join(__dirname, '../../../app/_layout.tsx'), 'utf8')

  it('the web branch runs through runWebEntryGate', () => {
    expect(src).toMatch(/runWebEntryGate\(/)
  })

  it('has no early return that skips the auth subscription when signed out', () => {
    expect(src).not.toMatch(/router\.replace\('\/auth\/sign-in'\)\s*\n\s*onReady\(\)\s*\n\s*return/)
  })
})
