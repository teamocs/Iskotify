/**
 * The consent gate sits at the root so it covers every route (deep links to
 * notes, listings, the estimator…), not just the tabs. Source-level guard, like
 * noLockoutGate.test.ts: the root layout is too heavy to render in a test. The
 * gate's behaviour is covered by components/consent/__tests__/ConsentGate.test.tsx.
 */
import fs from 'fs'
import path from 'path'

const mobileRoot = path.resolve(__dirname, '..', '..')
const read = (rel: string) => fs.readFileSync(path.join(mobileRoot, rel), 'utf8')

describe('root consent gate', () => {
  it('app/_layout.tsx wraps the root navigator in the ConsentGate, enabled once launch routing is done', () => {
    const src = read('app/_layout.tsx')
    expect(src).toMatch(/import \{ ConsentGate \} from '..\/components\/consent\/ConsentGate'/)
    expect(src).toMatch(/<ConsentGate enabled=\{ready\}>/)
  })

  it('the tabs no longer carry their own gate', () => {
    expect(read('app/(tabs)/_layout.tsx')).not.toMatch(/ConsentGate/)
  })
})

describe('web sign-in identity', () => {
  it('identifies the account only after the backup pull (account switch + restored consent) and never before it', () => {
    const src = read('app/_layout.tsx')
    const body = src.slice(src.indexOf('const resolveTarget'), src.indexOf('return runWebEntryGate'))
    const pull = body.indexOf('await pullUserData(db)')
    const identify = body.indexOf('identifyAfterConsent(db')
    expect(pull).toBeGreaterThan(-1)
    expect(identify).toBeGreaterThan(pull)
    expect(body).not.toMatch(/identifyUser\(/)
  })
})

// The web glimpse (P4). A signed-out web visitor (a guest trying the diagnostic)
// has consented to nothing, but this browser may still hold another person's
// stored consent. On web, the stored choice is applied only for a signed-in
// student, after the backup pull (identifyAfterConsent applies it); never at
// launch before the session is known.
describe('web guest preview', () => {
  const src = read('app/_layout.tsx')
  const init = src.slice(src.indexOf('const initialize = useCallback'), src.indexOf('// ── Web: auth-first entry gate'))

  it('applies stored analytics consent at launch on native only', () => {
    expect(init).toMatch(/if \(Platform\.OS !== 'web'\) \{\s*await applyAnalyticsConsent\(db\)/)
    expect(init.replace(/if \(Platform\.OS !== 'web'\) \{\s*await applyAnalyticsConsent\(db\)/, '')).not.toMatch(/applyAnalyticsConsent\(/)
  })

  it('re-applies the signed-out allowlist on every route change (in-app links from the guest diagnostic)', () => {
    expect(src).toMatch(/import \{ WebGuestRouteGuard \} from '..\/components\/auth\/WebGuestRouteGuard'/)
    expect(src).toMatch(/<WebGuestRouteGuard enabled=\{ready\} \/>/)
  })
})
