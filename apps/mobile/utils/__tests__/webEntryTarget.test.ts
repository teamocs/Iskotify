import { webEntryTarget } from '../webEntryTarget'

describe('webEntryTarget', () => {
  it('returns /auth/sign-in when no session', () => {
    expect(webEntryTarget(false, null, false)).toBe('/auth/sign-in')
    expect(webEntryTarget(false, 'Maria', true)).toBe('/auth/sign-in')
  })

  // A new email/password account has a session but no saved name yet. It used
  // to be sent back to /auth/sign-in, where the signed-in student sat with no
  // message. Onboarding asks for the name first, so that is where it belongs.
  it('returns /onboarding when session exists but no fullName (new email account)', () => {
    expect(webEntryTarget(true, null, false)).toBe('/onboarding')
    expect(webEntryTarget(true, '', false)).toBe('/onboarding')
    expect(webEntryTarget(true, '   ', false)).toBe('/onboarding')
  })

  it('returns /onboarding when session + name but no focus', () => {
    expect(webEntryTarget(true, 'Maria', false)).toBe('/onboarding')
  })

  it('returns /(tabs) when session + name + focus', () => {
    expect(webEntryTarget(true, 'Maria', true)).toBe('/(tabs)')
  })
})

import { webGateRedirect } from '../webEntryTarget'

// Where the web gate sends a page load. `null` means "stay", which keeps the
// URL AND its query string (the ?error=link reason, a ?code=, a recovery hash).
describe('webGateRedirect', () => {
  describe('no session', () => {
    it('stays on sign-in so ?error=link survives a direct load', () => {
      expect(webGateRedirect('/auth/sign-in', '/auth/sign-in')).toBeNull()
    })

    it('stays on the callback and reset-password routes, which explain themselves', () => {
      expect(webGateRedirect('/auth/callback', '/auth/sign-in')).toBeNull()
      expect(webGateRedirect('/auth/reset-password', '/auth/sign-in')).toBeNull()
    })

    it('sends every app route to sign-in', () => {
      for (const p of ['/', '/practice', '/help', '/tour', '/onboarding', '/landing']) {
        expect(webGateRedirect(p, '/auth/sign-in')).toBe('/auth/sign-in')
      }
    })
  })

  describe('signed in, onboarding not finished', () => {
    it('sends app routes to onboarding', () => {
      expect(webGateRedirect('/', '/onboarding')).toBe('/onboarding')
      expect(webGateRedirect('/auth/sign-in', '/onboarding')).toBe('/onboarding')
      expect(webGateRedirect('/tour', '/onboarding')).toBe('/onboarding')
    })

    it('stays on onboarding itself (it resumes on its own)', () => {
      expect(webGateRedirect('/onboarding', '/onboarding')).toBeNull()
    })

    it('never interrupts a password reset or an OAuth callback', () => {
      expect(webGateRedirect('/auth/reset-password', '/onboarding')).toBeNull()
      expect(webGateRedirect('/auth/callback', '/onboarding')).toBeNull()
    })
  })

  describe('signed in and onboarded (returning student)', () => {
    it('leaves the sign-in form for Today instead of showing it to a signed-in student', () => {
      expect(webGateRedirect('/auth/sign-in', '/(tabs)')).toBe('/(tabs)')
      expect(webGateRedirect('/landing', '/(tabs)')).toBe('/(tabs)')
    })

    it('keeps a deep link inside the app, including a replay of the tour', () => {
      for (const p of ['/', '/practice', '/help', '/tour', '/practice/exam/upcat']) {
        expect(webGateRedirect(p, '/(tabs)')).toBeNull()
      }
    })

    it('does not pull a student out of onboarding mid-flow (a focus exists after the goal step)', () => {
      expect(webGateRedirect('/onboarding', '/(tabs)')).toBeNull()
    })

    it('never routes a returning student into the tour', () => {
      for (const p of ['/', '/auth/sign-in', '/landing', '/auth/callback']) {
        expect(String(webGateRedirect(p, '/(tabs)'))).not.toMatch(/tour/)
      }
    })

    it('ignores a trailing slash', () => {
      expect(webGateRedirect('/auth/sign-in/', '/(tabs)')).toBe('/(tabs)')
      expect(webGateRedirect('/auth/sign-in/', '/auth/sign-in')).toBeNull()
    })
  })
})
