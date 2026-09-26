import { describe, it, expect } from 'vitest'
import {
  PRIVACY_LAST_UPDATED,
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_SECTIONS,
  PRIVACY_SUMMARY,
  NPC_WEBSITE,
  privacyPolicyText,
} from '../privacyPolicy'

const text = privacyPolicyText()

describe('privacy policy content (shared by the app and the website)', () => {
  it('carries the current "last updated" date and the contact address', () => {
    expect(PRIVACY_LAST_UPDATED).toBe('September 26, 2026')
    expect(PRIVACY_CONTACT_EMAIL).toBe('teamocsph@gmail.com')
    expect(text).toContain('teamocsph@gmail.com')
  })

  it('opens with a short summary', () => {
    expect(PRIVACY_SUMMARY.length).toBeGreaterThanOrEqual(3)
  })

  it('has the agreed plain-language sections, in order', () => {
    expect(PRIVACY_SECTIONS.map(s => s.title)).toEqual([
      'Who we are',
      'What we collect',
      'Why we use it',
      'Where it’s stored',
      'Who we share it with',
      'How long we keep it',
      'Your choices and your rights',
      'Students under 18',
      'Changes to this policy',
      'Contact us',
    ])
    for (const s of PRIVACY_SECTIONS) expect(s.blocks.length).toBeGreaterThan(0)
  })

  it('is framed around RA 10173 and names every data-subject right', () => {
    expect(text).toMatch(/Data Privacy Act of 2012/)
    expect(text).toMatch(/Republic Act No\. 10173/)
    for (const right of ['Be informed', 'Access', 'Object', 'Erasure or blocking', 'Rectification', 'Data portability', 'Damages']) {
      expect(text).toContain(right)
    }
  })

  it('tells students they can complain to the National Privacy Commission', () => {
    expect(NPC_WEBSITE).toBe('privacy.gov.ph')
    expect(text).toContain('National Privacy Commission')
    expect(text).toContain('privacy.gov.ph')
  })

  it('drops the claims that stopped being true', () => {
    expect(text).not.toMatch(/AI Coach/i)
    // The old text put Export Data in Settings; it lives in Profile > Your data.
    expect(text).not.toMatch(/Export Data (feature )?in Settings/i)
    expect(text).toMatch(/Profile, then Your data, then Export Data/)
    // Local data is not encrypted by the app, and analytics is not anonymised.
    expect(text).not.toMatch(/encrypted SQLite/i)
    expect(text).not.toMatch(/anonymi[sz]ed/i)
    // There is no in-app account deletion and no Google Calendar sync.
    expect(text).not.toMatch(/Google Calendar/i)
    expect(text).toMatch(/There isn’t a delete-account button yet/)
  })

  it('discloses the services that receive data, including the leaked-password check', () => {
    for (const name of ['Supabase', 'Vercel', 'Google', 'PostHog', 'Hugging Face', 'Expo', 'Resend', 'Upstash', 'Have I Been Pwned']) {
      expect(text).toContain(name)
    }
    expect(text).toMatch(/first 5 characters/)
    expect(text).toMatch(/Your password and the full code never leave your device/)
    // Mentioned once, in the sharing section only.
    const pwnedSections = PRIVACY_SECTIONS.filter(s => JSON.stringify(s).includes('Pwned'))
    expect(pwnedSections.map(s => s.title)).toEqual(['Who we share it with'])
    expect(PRIVACY_SUMMARY.join(' ')).not.toMatch(/Pwned/)
  })

  it('is honest about minors without inventing a consent mechanism', () => {
    const minors = JSON.stringify(PRIVACY_SECTIONS.find(s => s.title === 'Students under 18'))
    expect(minors).toMatch(/under 18/)
    expect(minors).toMatch(/doesn’t have a separate parent or guardian consent step/)
    expect(text).not.toMatch(/verified parental consent/i)
  })

  it('says analytics is linked to the account ID only, never the email', () => {
    expect(text).toMatch(/linked to your account ID only/)
    expect(text).not.toMatch(/account ID and email/)
  })

  it('says bug screenshots are private to our team (no public links)', () => {
    expect(text).toMatch(/screenshot[^.]*private/i)
    expect(text).toMatch(/only our team can view/i)
    expect(text).not.toMatch(/hard-to-guess/)
    expect(text).not.toMatch(/Anyone who has that exact link/)
  })

  it('describes the phone reset as clearing all study data and keeping notes', () => {
    const rights = JSON.stringify(PRIVACY_SECTIONS.find(s => s.title === 'Your choices and your rights'))
    expect(rights).toMatch(/Reset App Data removes all your study data/)
    expect(rights).toMatch(/keeps your notes/)
    expect(rights).toMatch(/delete them in Notes/)
    expect(rights).not.toMatch(/removes your progress, settings and focus list;/)
  })

  it('never names an operating company', () => {
    expect(text).not.toMatch(/\b(Inc\.|Corporation|Corp\.|OPC|Ltd\.?)\b/)
  })
})
