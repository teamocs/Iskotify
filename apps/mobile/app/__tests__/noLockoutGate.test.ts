/**
 * Regression guard: no early-access lockout gate survives in the mobile app.
 *
 * There is no test harness covering app/_layout.tsx's routing directly (it
 * pulls in SQLiteProvider, fonts, and several native-only providers that make
 * a full render-based test expensive). Instead this guard proves the gate is
 * gone by (1) asserting the gate-pattern text is absent from the two files
 * that used to enforce it, and (2) asserting the gate modules/screens were
 * actually deleted rather than merely dead-code'd — so a future edit can't
 * silently reintroduce a lockout path in a new location without this test
 * having to be updated to look there too.
 *
 * The three gates removed:
 *  1. Build-expiry gate (isEarlyAccessExpired / EARLY_ACCESS_EXPIRY_MS) —
 *     routed every launch to /expired once the build's hardcoded date passed.
 *  2. Dormant approved-account gate (EARLY_ACCESS_GATE_ENABLED /
 *     early_access_status RPC) — routed to /early-access-required.
 *  3. Native activation gate (isEarlyAccessActivated / earlyAccessActivation) —
 *     routed fresh installs to /activate, including on a fail-closed RPC error.
 */
import fs from 'fs'
import path from 'path'

const GATE_PATTERN =
  /isEarlyAccessExpired|EARLY_ACCESS_|earlyAccessActivation|isEarlyAccessActivated|\/expired|early-access-required|early_access_status/

const mobileRoot = path.resolve(__dirname, '..', '..')

function read(relPath: string): string {
  return fs.readFileSync(path.join(mobileRoot, relPath), 'utf8')
}

describe('open access — no lockout gate survives', () => {
  it('app/_layout.tsx contains no early-access gate reference', () => {
    const source = read('app/_layout.tsx')
    expect(source).not.toMatch(GATE_PATTERN)
  })

  it('app/auth/callback.tsx contains no early-access gate reference', () => {
    const source = read('app/auth/callback.tsx')
    expect(source).not.toMatch(GATE_PATTERN)
    // The old gate routed here before the profile was ever written.
    expect(source).not.toContain("router.replace('/activate')")
  })

  it.each([
    'utils/earlyAccess.ts',
    'utils/earlyAccessActivation.ts',
    'app/expired.tsx',
    'app/activate.tsx',
    'app/early-access-required.tsx',
    'utils/__tests__/earlyAccess.test.ts',
    'utils/__tests__/earlyAccessActivation.test.ts',
    'app/__tests__/activate.test.tsx',
    'app/__tests__/early-access-required.test.tsx',
  ])('%s was deleted, not left dormant', (relPath) => {
    expect(fs.existsSync(path.join(mobileRoot, relPath))).toBe(false)
  })
})
