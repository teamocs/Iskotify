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
