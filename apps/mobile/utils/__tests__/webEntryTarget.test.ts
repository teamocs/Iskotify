import { webEntryTarget, webGateRedirect, GUEST_ROUTES, isGuestPath } from '../webEntryTarget'

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

  describe('the Terms and Privacy Policy pages (reached from the consent step, sign-in and landing)', () => {
    it('are never redirected away, whoever is asking', () => {
      for (const target of ['/auth/sign-in', '/onboarding', '/(tabs)'] as const) {
        expect(webGateRedirect('/terms', target)).toBeNull()
        expect(webGateRedirect('/privacy', target)).toBeNull()
        expect(webGateRedirect('/privacy/', target)).toBeNull()
      }
    })
  })
})

// The web glimpse (P4): a signed-out visitor may try the free diagnostic. The
// allowlist is explicit and small: the intro page and the diagnostic run (its
// review and results are views of that one route). Nothing else opens.
describe('guest preview allowlist', () => {
  it('is exactly the intro page and the diagnostic', () => {
    expect([...GUEST_ROUTES]).toEqual(['/try', '/practice/diagnostic'])
  })

  it('recognises the guest routes, with or without a trailing slash or query', () => {
    for (const p of ['/try', '/try/', '/practice/diagnostic', '/practice/diagnostic/', '/practice/diagnostic?exam=upcat']) {
      expect(isGuestPath(p)).toBe(true)
    }
  })

  it('does not stretch to neighbouring routes', () => {
    for (const p of ['/', '/tryx', '/try/more', '/practice', '/practice/diagnostic/x', '/practice/upcat/all',
      '/practice/exam/upcat', '/practice/review/upcat', '/practice/start/upcat', '/practice/mistakes', '/upgrade', '/(tabs)']) {
      expect(isGuestPath(p)).toBe(false)
    }
  })

  it('lets a signed-out visitor stay on the guest routes', () => {
    expect(webGateRedirect('/try', '/auth/sign-in')).toBeNull()
    expect(webGateRedirect('/practice/diagnostic', '/auth/sign-in')).toBeNull()
    expect(webGateRedirect('/practice/diagnostic/', '/auth/sign-in')).toBeNull()
  })

  it('still sends a signed-out visitor everywhere else to sign-in', () => {
    for (const p of ['/', '/practice', '/practice/upcat/all', '/practice/exam/upcat', '/practice/review/upcat',
      '/practice/diagnostic/x', '/tryx', '/upgrade', '/notes', '/settings', '/onboarding', '/landing']) {
      expect(webGateRedirect(p, '/auth/sign-in')).toBe('/auth/sign-in')
    }
  })

  it('sends a signed-in student off the guest intro (to onboarding, or to Today once onboarded)', () => {
    expect(webGateRedirect('/try', '/onboarding')).toBe('/onboarding')
    expect(webGateRedirect('/try', '/(tabs)')).toBe('/(tabs)')
    expect(webGateRedirect('/try/', '/(tabs)')).toBe('/(tabs)')
  })

  it('treats the diagnostic as an ordinary app route once signed in', () => {
    expect(webGateRedirect('/practice/diagnostic', '/onboarding')).toBe('/onboarding')
    expect(webGateRedirect('/practice/diagnostic', '/(tabs)')).toBeNull()
  })
})
