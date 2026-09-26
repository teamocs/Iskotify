import { describe, it, expect } from 'vitest'
import {
  TERMS_LAST_UPDATED,
  TERMS_CONTACT_EMAIL,
  TERMS_OPERATOR,
  TERMS_PRIVACY_LINK,
  TERMS_SECTIONS,
  TERMS_SUMMARY,
  termsOfServiceText,
} from '../termsOfService'

const text = termsOfServiceText()
const section = (title: string) => JSON.stringify(TERMS_SECTIONS.find(s => s.title === title))

describe('terms of service content (shared by the app and the website)', () => {
  it('carries the current "last updated" date, the operator and the contact address', () => {
    expect(TERMS_LAST_UPDATED).toBe('September 26, 2026')
    expect(TERMS_OPERATOR).toBe('Online Creative Solutions')
    expect(TERMS_CONTACT_EMAIL).toBe('teamocsph@gmail.com')
    expect(text).toContain('teamocsph@gmail.com')
  })

  it('opens with a short summary', () => {
    expect(TERMS_SUMMARY.length).toBeGreaterThanOrEqual(3)
    expect(TERMS_SUMMARY.length).toBeLessThanOrEqual(6)
  })

  it('has the agreed plain-language sections, in order', () => {
    expect(TERMS_SECTIONS.map(s => s.title)).toEqual([
      'Who we are',
      'What Iskotify is',
      'Iskotify is free',
      'Your account',
      'Students under 18',
      'Exam, school and scholarship details',
      'The Estimated Admission Score',
      'The on-device AI model',
      'Using Iskotify fairly',
      'Your content',
      'Our content',
      'Availability and our responsibility',
      'Ending your account',
      'Your privacy',
      'Changes to these terms',
      'Governing law',
      'Contact us',
    ])
    for (const s of TERMS_SECTIONS) expect(s.blocks.length).toBeGreaterThan(0)
  })

  it('says who runs Iskotify', () => {
    expect(section('Who we are')).toContain('“we” and “us” means Online Creative Solutions')
    expect(text).not.toMatch(/\b(Inc\.|Corporation|Corp\.|OPC|Ltd\.?)\b/)
  })

  it('describes only features that exist', () => {
    const what = section('What Iskotify is')
    for (const f of ['Practice questions', 'mock exams', 'Estimated Admission Score', 'scholarships', 'Notes']) {
      expect(what).toContain(f)
    }
    // Retired or never-built features from the old web-only terms.
    expect(text).not.toMatch(/Google Calendar/i)
    expect(text).not.toMatch(/calendar sync|reminder syncing/i)
    expect(text).not.toMatch(/AI Coach/i)
  })

  it('is free, with no payments section and no refund rules', () => {
    expect(TERMS_SECTIONS.map(s => s.title).join(' ')).not.toMatch(/payment/i)
    expect(section('Iskotify is free')).toMatch(/no payments/)
    expect(section('Iskotify is free')).toMatch(/we’ll tell you first/)
    expect(text).not.toMatch(/non-refundable|fees are shown|one-time or paid/i)
  })

  it('never treats continued use as acceptance of changes', () => {
    expect(text).not.toMatch(/continued use|continuing to use|keep using .* means/i)
    const changes = section('Changes to these terms')
    expect(changes).toMatch(/new date/)
    expect(changes).toMatch(/point it out in the app/)
    expect(changes).toMatch(/stop using Iskotify and ask us to delete your account/)
  })

  it('applies Philippine law', () => {
    expect(section('Governing law')).toMatch(/laws of the Philippines/)
    expect(section('Availability and our responsibility')).toMatch(/as Philippine law allows/)
    expect(section('Availability and our responsibility')).toMatch(/“as is”/)
  })

  it('tells students to confirm details on the official site and disclaims affiliation', () => {
    const info = section('Exam, school and scholarship details')
    expect(info).toMatch(/public sources and research by our staff/)
    expect(info).toMatch(/can change/)
    expect(info).toMatch(/mistakes/)
    expect(info).toMatch(/official website/)
    expect(info).toMatch(/isn’t affiliated with/)
    expect(info).toMatch(/University of the Philippines/)
    expect(info).toMatch(/DOST/)
  })

  it('keeps the Estimated Admission Score an estimate from historical cutoffs, never a decision', () => {
    const eas = section('The Estimated Admission Score')
    expect(eas).toMatch(/historical cutoffs/)
    expect(eas).toMatch(/not an official score/)
    expect(eas).toMatch(/not an admission decision/)
  })

  it('uses none of the estimator’s banned words (apps/mobile/app/estimator/__tests__/compliance)', () => {
    for (const banned of [/your upg/i, /upg is/i, /will qualify/i, /\bpass(ed)?\b/i, /\bfail(ed)?\b/i, /guarantee/i]) {
      expect(text).not.toMatch(banned)
    }
  })

  it('says the optional AI model runs on your device and may be wrong', () => {
    const ai = section('The on-device AI model')
    expect(ai).toMatch(/optional/)
    expect(ai).toMatch(/runs on your device/)
    expect(ai).toMatch(/can be wrong/)
  })

  it('asks under-18s to use Iskotify with a parent or guardian’s awareness, without an invented age check', () => {
    expect(section('Students under 18')).toMatch(/parent or guardian’s awareness/)
    expect(text).not.toMatch(/verify your age|age verification|verified parental consent/i)
  })

  it('covers acceptable use: cheating, scraping, abuse, other people’s data, harassment', () => {
    const fair = section('Using Iskotify fairly')
    expect(fair).toMatch(/cheat/)
    expect(fair).toMatch(/scrape/)
    expect(fair).toMatch(/Harass/)
    expect(fair).toMatch(/other people’s personal information/)
    expect(fair).toMatch(/screenshots/)
  })

  it('keeps notes yours and explains how reports and feedback are used', () => {
    const yours = section('Your content')
    expect(yours).toMatch(/Your notes are yours/)
    expect(yours).toMatch(/improve Iskotify/)
    expect(section('Our content')).toMatch(/personal study/)
    expect(section('Our content')).toMatch(/republish/)
  })

  it('explains account deletion by email and suspension for breaking the terms', () => {
    const ending = section('Ending your account')
    expect(ending).toContain(`email ${TERMS_CONTACT_EMAIL}`)
    expect(ending).toMatch(/suspend/)
  })

  it('points to the privacy policy with a link both apps can render', () => {
    expect(TERMS_PRIVACY_LINK).toEqual({ text: 'Privacy Policy', href: '/privacy' })
    expect(section('Your privacy')).toContain(TERMS_PRIVACY_LINK.text)
  })
})

// The on-device model writes extra answer choices for practice questions
// (apps/mobile/hooks/useAiEnhancement.ts). Its search/embedding side is
// dormant, and students don't type into it, so neither may be claimed.
describe('on-device AI model wording', () => {
  it('describes what the model really does', () => {
    expect(text).toMatch(/answer choices/)
    expect(text).not.toMatch(/helps with search/)
    expect(text).not.toMatch(/what you type into it/)
  })
})
