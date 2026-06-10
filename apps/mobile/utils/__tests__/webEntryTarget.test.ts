import { webEntryTarget } from '../webEntryTarget'

describe('webEntryTarget', () => {
  it('returns /auth/sign-in when no session', () => {
    expect(webEntryTarget(false, null, false)).toBe('/auth/sign-in')
    expect(webEntryTarget(false, 'Maria', true)).toBe('/auth/sign-in')
  })

  it('returns /auth/sign-in when session exists but no fullName', () => {
    expect(webEntryTarget(true, null, false)).toBe('/auth/sign-in')
    expect(webEntryTarget(true, '', false)).toBe('/auth/sign-in')
    expect(webEntryTarget(true, '   ', false)).toBe('/auth/sign-in')
  })

  it('returns /onboarding when session + name but no focus', () => {
    expect(webEntryTarget(true, 'Maria', false)).toBe('/onboarding')
  })

  it('returns /(tabs) when session + name + focus', () => {
    expect(webEntryTarget(true, 'Maria', true)).toBe('/(tabs)')
  })
})
