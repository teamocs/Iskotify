import {
  CONSENT_VERSION, isConsentCurrent, consentFormReason, analyticsAllowed,
  analyticsDefault, hasSensitiveConsent, gateSensitive, mergeConsent,
  SENSITIVE_CLEARED,
} from '../consent'

const adult = { ageBand: 'adult', consentVersion: CONSENT_VERSION, consentedAt: 10, guardianConsentAt: 0 }
const minor = { ageBand: 'minor', consentVersion: CONSENT_VERSION, consentedAt: 10, guardianConsentAt: 11 }

describe('isConsentCurrent', () => {
  it('is true for an adult who accepted the current version', () => {
    expect(isConsentCurrent(adult)).toBe(true)
  })
  it('is true for a minor with a guardian attestation', () => {
    expect(isConsentCurrent(minor)).toBe(true)
  })
  it('is false for a minor without a guardian attestation', () => {
    expect(isConsentCurrent({ ...minor, guardianConsentAt: 0 })).toBe(false)
  })
  it('is false with no consent recorded (fresh or pre-consent user)', () => {
    expect(isConsentCurrent({ ageBand: '', consentVersion: '', consentedAt: 0, guardianConsentAt: 0 })).toBe(false)
  })
  it('is false for an older version, true for a newer one', () => {
    expect(isConsentCurrent({ ...adult, consentVersion: '2026-01-01' })).toBe(false)
    expect(isConsentCurrent({ ...adult, consentVersion: '2027-01-01' })).toBe(true)
  })
  it('is false when the timestamp is missing even if a version is stored', () => {
    expect(isConsentCurrent({ ...adult, consentedAt: 0 })).toBe(false)
  })
  it('is false for an unknown age band', () => {
    expect(isConsentCurrent({ ...adult, ageBand: 'kid' })).toBe(false)
  })
})

describe('consentFormReason (why Continue is disabled)', () => {
  it('asks for an age band first', () => {
    expect(consentFormReason({ ageBand: null, terms: false, guardian: false })).toMatch(/age/i)
  })
  it('asks for the terms box next', () => {
    expect(consentFormReason({ ageBand: 'adult', terms: false, guardian: false })).toMatch(/Terms and the Privacy Policy/)
  })
  it('asks a minor for the guardian box', () => {
    expect(consentFormReason({ ageBand: 'minor', terms: true, guardian: false })).toMatch(/parent or guardian/i)
  })
  it('is null when an adult ticked the terms box', () => {
    expect(consentFormReason({ ageBand: 'adult', terms: true, guardian: false })).toBeNull()
  })
  it('is null when a minor ticked both', () => {
    expect(consentFormReason({ ageBand: 'minor', terms: true, guardian: true })).toBeNull()
  })
  it('ignores a stale guardian tick for an adult', () => {
    expect(consentFormReason({ ageBand: 'adult', terms: true, guardian: true })).toBeNull()
  })
})

describe('analytics consent', () => {
  it('defaults OFF for minors and ON for adults', () => {
    expect(analyticsDefault('minor')).toBe(false)
    expect(analyticsDefault('adult')).toBe(true)
  })
  it('never runs before an age band / consent exists', () => {
    expect(analyticsAllowed({ ageBand: '', consentedAt: 0, analyticsOptIn: null })).toBe(false)
    expect(analyticsAllowed({ ageBand: '', consentedAt: 0, analyticsOptIn: 1 })).toBe(false)
  })
  it('derives from the age band while unset', () => {
    expect(analyticsAllowed({ ageBand: 'adult', consentedAt: 5, analyticsOptIn: null })).toBe(true)
    expect(analyticsAllowed({ ageBand: 'minor', consentedAt: 5, analyticsOptIn: null })).toBe(false)
  })
  it('honours an explicit choice either way', () => {
    expect(analyticsAllowed({ ageBand: 'adult', consentedAt: 5, analyticsOptIn: 0 })).toBe(false)
    expect(analyticsAllowed({ ageBand: 'minor', consentedAt: 5, analyticsOptIn: 1 })).toBe(true)
  })
})

describe('sensitive consent', () => {
  it('needs a positive timestamp', () => {
    expect(hasSensitiveConsent({ sensitiveConsentAt: 0 })).toBe(false)
    expect(hasSensitiveConsent({ sensitiveConsentAt: null })).toBe(false)
    expect(hasSensitiveConsent({ sensitiveConsentAt: 99 })).toBe(true)
  })
  const raw = {
    incomeBracket: '100k-300k' as const, gwa: 90, hsGwaG8: 88, hsGwaG9: 89, hsGwaG10: 90, hsGwaG11: 91,
    isIndigenous: true, province: 'Cebu', gradeLevel: 11,
  }
  it('masks every sensitive field when consent is off, leaving the rest', () => {
    const out = gateSensitive({ ...raw, sensitiveConsentAt: 0 })
    expect(out).toMatchObject({
      incomeBracket: null, gwa: null, hsGwaG8: null, hsGwaG9: null, hsGwaG10: null, hsGwaG11: null,
      isIndigenous: false, province: 'Cebu', gradeLevel: 11,
    })
  })
  it('returns values untouched when consent is on', () => {
    const out = gateSensitive({ ...raw, sensitiveConsentAt: 5 })
    expect(out.gwa).toBe(90)
    expect(out.isIndigenous).toBe(true)
  })
  it('SENSITIVE_CLEARED nulls every sensitive column', () => {
    expect(SENSITIVE_CLEARED).toEqual({
      incomeBracket: null, gwa: null, hsGwaG8: null, hsGwaG9: null, hsGwaG10: null, hsGwaG11: null,
      isIndigenous: false, sensitiveConsentAt: 0,
    })
  })
})

describe('mergeConsent (cloud backup vs this device)', () => {
  const none = {
    ageBand: '', consentVersion: '', consentedAt: 0, guardianConsentAt: 0,
    sensitiveConsentAt: 0, sensitiveWithdrawnAt: 0, analyticsOptIn: null as number | null, analyticsChoiceAt: 0,
  }
  const local = { ...none, ...adult, sensitiveConsentAt: 50 }
  it('keeps local consent when the backup predates consent', () => {
    expect(mergeConsent(local, none)).toEqual(local)
  })
  it('adopts the backup consent when this device has none', () => {
    const remote = { ...none, ...minor, analyticsOptIn: 1, analyticsChoiceAt: 12 }
    expect(mergeConsent(none, remote)).toEqual(remote)
  })
  it('takes the Terms record (age band, version, dates) from the newer version', () => {
    const remote = { ...none, ...minor, consentVersion: '2027-02-02', consentedAt: 90, guardianConsentAt: 91 }
    expect(mergeConsent(local, remote)).toMatchObject({ ageBand: 'minor', consentVersion: '2027-02-02', consentedAt: 90, guardianConsentAt: 91 })
    expect(mergeConsent(remote, local)).toMatchObject({ ageBand: 'minor', consentVersion: '2027-02-02', consentedAt: 90, guardianConsentAt: 91 })
  })
  it('on equal versions the later acceptance wins; a full tie keeps this device (so a protective merge survives the next push)', () => {
    const earlier = { ...none, ...adult, consentedAt: 10 }
    const later = { ...none, ...minor, consentedAt: 20, guardianConsentAt: 20 }
    expect(mergeConsent(earlier, later)).toMatchObject({ ageBand: 'minor', consentedAt: 20 })
    expect(mergeConsent(later, earlier)).toMatchObject({ ageBand: 'minor', consentedAt: 20 })
    const mergedMinor = { ...none, ...minor, consentedAt: 30, guardianConsentAt: 11 }
    expect(mergeConsent(mergedMinor, { ...none, ...adult, consentedAt: 30 })).toMatchObject({ ageBand: 'minor', guardianConsentAt: 11 })
  })
  it('an analytics tie keeps this device (an explicit off from a first sign-in merge is not undone)', () => {
    const off = { ...local, analyticsOptIn: 0, analyticsChoiceAt: 99 }
    expect(mergeConsent(off, { ...local, analyticsOptIn: 1, analyticsChoiceAt: 99 }).analyticsOptIn).toBe(0)
  })
  it('a newer Terms version never decides the sensitive or analytics choices', () => {
    // This device re-accepted newer Terms; the other device withdrew and opted out later than this device's choices.
    const here = { ...local, consentVersion: '2027-02-02', sensitiveConsentAt: 50, analyticsOptIn: 1, analyticsChoiceAt: 40 }
    const cloud = { ...none, ...adult, sensitiveWithdrawnAt: 60, analyticsOptIn: 0, analyticsChoiceAt: 70 }
    expect(mergeConsent(here, cloud)).toMatchObject({
      consentVersion: '2027-02-02', sensitiveConsentAt: 0, sensitiveWithdrawnAt: 60, analyticsOptIn: 0, analyticsChoiceAt: 70,
    })
  })
  it('sensitive consent follows the latest of grant and withdrawal, from either side', () => {
    const withdrawnElsewhere = { ...none, ...adult, sensitiveWithdrawnAt: 60 }
    expect(mergeConsent(local, withdrawnElsewhere)).toMatchObject({ sensitiveConsentAt: 0, sensitiveWithdrawnAt: 60 })
    expect(mergeConsent(withdrawnElsewhere, local)).toMatchObject({ sensitiveConsentAt: 0, sensitiveWithdrawnAt: 60 })
    const regranted = { ...local, sensitiveConsentAt: 80 }
    expect(mergeConsent(regranted, withdrawnElsewhere)).toMatchObject({ sensitiveConsentAt: 80, sensitiveWithdrawnAt: 60 })
    expect(mergeConsent(withdrawnElsewhere, regranted)).toMatchObject({ sensitiveConsentAt: 80, sensitiveWithdrawnAt: 60 })
  })
  it('a backup that never saw a withdrawal does not undo one made here', () => {
    const here = { ...local, sensitiveConsentAt: 0, sensitiveWithdrawnAt: 60 }
    const staleCloud = { ...none, ...adult, sensitiveConsentAt: 50 }
    expect(mergeConsent(here, staleCloud)).toMatchObject({ sensitiveConsentAt: 0, sensitiveWithdrawnAt: 60 })
  })
  it('analytics follows the latest choice, from either side', () => {
    const on = { ...local, analyticsOptIn: 1, analyticsChoiceAt: 100 }
    const off = { ...local, analyticsOptIn: 0, analyticsChoiceAt: 200 }
    expect(mergeConsent(on, off).analyticsOptIn).toBe(0)
    expect(mergeConsent(off, on).analyticsOptIn).toBe(0)
    expect(mergeConsent(off, { ...on, analyticsChoiceAt: 300 })).toMatchObject({ analyticsOptIn: 1, analyticsChoiceAt: 300 })
  })
  it('keeps a local analytics choice the backup never recorded', () => {
    expect(mergeConsent({ ...local, analyticsOptIn: 0 }, { ...none, ...adult }).analyticsOptIn).toBe(0)
  })
  it('on a first sign-in merge, keeps a sensitive consent given here that the backup never withdrew', () => {
    expect(mergeConsent(local, { ...none, ...adult }, true).sensitiveConsentAt).toBe(50)
    expect(mergeConsent({ ...local, sensitiveConsentAt: 0 }, { ...none, ...adult, sensitiveConsentAt: 70 }, true).sensitiveConsentAt).toBe(70)
  })
  it('on a first sign-in merge, a minor on either side stays a minor, with the guardian attestation kept', () => {
    const here = { ...none, ...adult, consentedAt: 30 }
    const cloud = { ...none, ...minor }
    expect(mergeConsent(here, cloud, true)).toMatchObject({ ageBand: 'minor', guardianConsentAt: 11 })
    expect(mergeConsent(cloud, here, true)).toMatchObject({ ageBand: 'minor', guardianConsentAt: 11 })
    const newerAdult = { ...here, consentVersion: '2027-02-02' }
    expect(mergeConsent(cloud, newerAdult, true)).toMatchObject({ ageBand: 'minor', consentVersion: '2027-02-02', guardianConsentAt: 11 })
  })
  it('on a first sign-in merge, an explicit analytics "off" on either side wins', () => {
    const off = { ...local, analyticsOptIn: 0, analyticsChoiceAt: 10 }
    const on = { ...local, analyticsOptIn: 1, analyticsChoiceAt: 99 }
    expect(mergeConsent(off, on, true).analyticsOptIn).toBe(0)
    expect(mergeConsent(on, off, true).analyticsOptIn).toBe(0)
  })
})
