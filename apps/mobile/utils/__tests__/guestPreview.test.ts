import {
  buildGuestExamOptions, guestDiagnosticHref, guestExamCaption, isDeviceHeldByAccount, GUEST_SIGNUP_HREF,
} from '../guestPreview'

const bp = (slug: string, acronym: string, items = 120) => ({
  slug, name: `${acronym} full name`, acronym, totalItems: items, totalTimeMinutes: 120, items, minutes: 120,
})

describe('buildGuestExamOptions', () => {
  it('always offers UPCAT first, then every exam with a runnable blueprint, in the given order', () => {
    const opts = buildGuestExamOptions([bp('acet', 'ACET'), bp('dcat', 'DCAT')])
    expect(opts.map(o => o.slug)).toEqual(['upcat', 'acet', 'dcat'])
    expect(opts[0]).toMatchObject({ slug: 'upcat', acronym: 'UPCAT', maxQuestions: 40 })
    expect(opts[1]).toMatchObject({ acronym: 'ACET', name: 'ACET full name' })
  })

  it('offers UPCAT once even when it also has a blueprint', () => {
    expect(buildGuestExamOptions([bp('upcat', 'UPCAT'), bp('acet', 'ACET')]).map(o => o.slug)).toEqual(['upcat', 'acet'])
  })

  it('offers UPCAT alone when nothing else is runnable', () => {
    expect(buildGuestExamOptions([]).map(o => o.slug)).toEqual(['upcat'])
  })

  it('caps an exam diagnostic at its sample size, or at what the exam can build', () => {
    const [, big, small] = buildGuestExamOptions([bp('acet', 'ACET', 200), bp('tiny', 'TINY', 8)])
    expect(big!.maxQuestions).toBe(30)
    expect(small!.maxQuestions).toBe(8)
  })

  it('falls back to the slug when a blueprint has no acronym', () => {
    expect(buildGuestExamOptions([bp('pup-cet', '')])[1]!.acronym).toBe('PUP-CET')
  })
})

describe('guestExamCaption', () => {
  it('says how long it can take, one minute per question', () => {
    expect(guestExamCaption({ maxQuestions: 40 })).toBe('Up to 40 questions · one minute each')
    expect(guestExamCaption({ maxQuestions: 1 })).toBe('Up to 1 question · one minute each')
  })
})

describe('guestDiagnosticHref', () => {
  it('opens the existing diagnostic for the chosen exam', () => {
    expect(guestDiagnosticHref('upcat')).toBe('/practice/diagnostic?exam=upcat')
    expect(guestDiagnosticHref('a b')).toBe('/practice/diagnostic?exam=a%20b')
  })
})

describe('GUEST_SIGNUP_HREF', () => {
  it('opens sign-in on the create-account form', () => {
    expect(GUEST_SIGNUP_HREF).toBe('/auth/sign-in?mode=signup')
  })
})

describe('isDeviceHeldByAccount', () => {
  it('is false for a fresh browser or a guest row', () => {
    expect(isDeviceHeldByAccount(undefined)).toBe(false)
    expect(isDeviceHeldByAccount({ ownerUserId: '', googleId: null, email: null, fullName: '' })).toBe(false)
  })

  it('is true when the browser still holds an account that signed out (any evidence of whose data it is)', () => {
    expect(isDeviceHeldByAccount({ ownerUserId: 'user-a' })).toBe(true)
    expect(isDeviceHeldByAccount({ ownerUserId: '', googleId: 'legacy-uid' })).toBe(true)
    expect(isDeviceHeldByAccount({ ownerUserId: '', email: 'a@b.ph' })).toBe(true)
    expect(isDeviceHeldByAccount({ ownerUserId: '', fullName: 'Juan' })).toBe(true)
  })

  it('ignores blank values', () => {
    expect(isDeviceHeldByAccount({ ownerUserId: '  ', googleId: ' ', email: '', fullName: '   ' })).toBe(false)
  })
})
