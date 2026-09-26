/**
 * Analytics identifies a student by their account ID only. No email, name or
 * other personal property may reach PostHog (the privacy policy says so).
 *
 *  1. Both SDK wrappers forward ONLY the id, whatever a caller passes.
 *  2. A source scan: no identifyUser() call passes a second argument, and no
 *     capture()/screenView() call sends an email or name property.
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '../..')

describe('identifyUser sends the account ID only', () => {
  const OLD_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY
  beforeEach(() => { process.env.EXPO_PUBLIC_POSTHOG_KEY = 'phc_test' })
  afterAll(() => { process.env.EXPO_PUBLIC_POSTHOG_KEY = OLD_KEY })

  it('native: calls PostHog identify with the id and nothing else', () => {
    const identify = jest.fn()
    jest.isolateModules(() => {
      jest.doMock('posthog-react-native', () => ({
        __esModule: true,
        default: jest.fn().mockImplementation(() => ({ identify })),
      }))
      const a = require('../analytics.native')
      a.initAnalytics()
      ;(a.identifyUser as (...args: unknown[]) => void)('user-1', { email: 'student@example.com', name: 'Juan' })
    })
    expect(identify).toHaveBeenCalledTimes(1)
    expect(identify.mock.calls[0]).toEqual(['user-1'])
  })

  it('web: calls posthog-js identify with the id and nothing else', () => {
    const identify = jest.fn()
    jest.isolateModules(() => {
      jest.doMock('posthog-js', () => ({ __esModule: true, default: { init: jest.fn(), identify } }))
      // Explicit extension: jest-expo would otherwise resolve the .native file.
      const a = require('../analytics.ts')
      a.initAnalytics()
      ;(a.identifyUser as (...args: unknown[]) => void)('user-1', { email: 'student@example.com' })
    })
    expect(identify).toHaveBeenCalledTimes(1)
    expect(identify.mock.calls[0]).toEqual(['user-1'])
  })
})

describe('no call site sends personal properties to analytics', () => {
  const DIRS = ['app', 'components', 'hooks', 'services', 'lib', 'utils']

  function walk(dir: string): string[] {
    const abs = path.join(ROOT, dir)
    if (!fs.existsSync(abs)) return []
    return fs.readdirSync(abs, { withFileTypes: true }).flatMap(e => {
      if (e.name === '__tests__' || e.name === 'node_modules') return []
      const rel = path.join(dir, e.name)
      if (e.isDirectory()) return walk(rel)
      return /\.(ts|tsx)$/.test(e.name) ? [rel] : []
    })
  }
  const files = DIRS.flatMap(walk).filter(f => !/^lib[\\/]analytics/.test(f))

  it('never passes a second argument to identifyUser', () => {
    const offenders = files.flatMap(f => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
      return [...src.matchAll(/identifyUser\(([^()]*(?:\([^()]*\))?[^()]*)\)/g)]
        .filter(m => (m[1] ?? '').includes(','))
        .map(m => `${f}: ${m[0]}`)
    })
    expect(offenders).toEqual([])
  })

  it('never sends an email or name in capture()/screenView() properties', () => {
    const offenders = files.flatMap(f => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
      return [...src.matchAll(/\b(?:capture|screenView)\(([\s\S]*?)\)\s*$/gm)]
        .filter(m => /\b(email|fullName|full_name|name)\s*[:,}]/.test(m[1] ?? ''))
        .map(m => `${f}: ${m[0].slice(0, 120)}`)
    })
    expect(offenders).toEqual([])
  })
})
