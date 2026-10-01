import { describe, it, expect } from 'vitest'
import {
  TERMS_LAST_UPDATED,
  TERMS_CONTACT_EMAIL,
  TERMS_OPERATOR,
  TERMS_PRIVACY_LINK,
  TERMS_SECTIONS,
  TERMS_SUMMARY,
  TERMS_BUSINESS_ADDRESS,
  TERMS_DTI_BN,
  termsOfServiceText,
} from '../termsOfService'
import { BUSINESS_ADDRESS } from '../privacyPolicy'

const text = termsOfServiceText()
const section = (title: string) => JSON.stringify(TERMS_SECTIONS.find(s => s.title === title))

describe('terms of service content (shared by the app and the website)', () => {
  it('carries the current "last updated" date, the operator and the contact address', () => {
    expect(TERMS_LAST_UPDATED).toBe('October 1, 2026')
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
      'Free features and Iskotify Full Access',
      'Your account',
      'Students under 18',
      'Exam, school and scholarship details',
      'The Estimated Admission Score',
      'AI-assisted content',
      'Using Iskotify fairly',
      'Your content',
      'Our content',
      'Availability and our responsibility',
      'Ending your account',
      'Your privacy',
      'Changes to these terms',
      'Governing law',
      'Complaints',
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

  it('keeps the core free and describes the optional one-time Full Access honestly', () => {
    const paid = section('Free features and Iskotify Full Access')
    expect(paid).toMatch(/core features are free/)
    expect(paid).toMatch(/stay free/)
    expect(paid).toMatch(/optional one-time purchase/)
    expect(paid).toMatch(/isn’t a subscription/)
    // What it unlocks, matching the upgrade screen.
    expect(paid).toMatch(/unlimited practice questions/)
    expect(paid).toMatch(/unlimited full mock exams/)
    // Explanations (including why each wrong choice is wrong) are free, never part of Full Access.
    expect(paid).not.toMatch(/explanations for every answer choice/)
    expect(paid).toMatch(/explanations stay free for everyone/)
    expect(paid).toMatch(/may not be on sale yet/)
    expect(paid).toMatch(/Before you pay, we’ll show you the price/)
    expect(paid).toMatch(/what Full Access includes/)
    expect(paid).toMatch(/for as long as we offer Iskotify/)
    // No longer future tense: it can be bought now.
    expect(paid).not.toMatch(/costs money today|may offer Iskotify Full Access|before anyone is asked to pay/)
    expect(TERMS_SUMMARY.join(' ')).not.toMatch(/Iskotify is a free study app/)
    expect(text).not.toMatch(/Iskotify is free to use/)
  })

  it('says where Full Access is bought, without steering Android readers to another payment (shared text)', () => {
    const paid = section('Free features and Iskotify Full Access')
    expect(paid).toMatch(/Android app[^"]*through Google Play/)
    expect(paid).toMatch(/other Iskotify platforms where it’s offered/)
    // The in-app Terms on Android shows this same text: no web prices, methods or links.
    expect(paid).not.toMatch(/GCash|Maya|QR Ph|PayMongo|₱|iskotify\.ph|website/i)
  })

  it('gives real refund routes and never says "no refunds"', () => {
    const paid = section('Free features and Iskotify Full Access')
    expect(paid).toMatch(/Google Play’s refund process/)
    expect(paid).toMatch(/email us for a refund/)
    expect(paid).toMatch(/doesn’t work as described and we can’t fix it/)
    expect(paid).toMatch(/where the law gives you a right to one/)
    expect(text).not.toMatch(/no refunds|all sales are final|non-refundable/i)
  })

  it('asks under-18s to buy only with a parent or guardian’s permission', () => {
    const paid = section('Free features and Iskotify Full Access')
    expect(paid).toMatch(/under 18[^"]*parent or guardian’s permission/)
    expect(paid).toMatch(/parent or guardian can email us/)
  })

  it('names the business behind Iskotify, adding its address and registration once supplied', () => {
    // One address for the whole business: the privacy policy uses the same value.
    expect(TERMS_BUSINESS_ADDRESS).toBe(BUSINESS_ADDRESS)
    const who = section('Who we are')
    expect(who).toContain(TERMS_OPERATOR)
    if (TERMS_BUSINESS_ADDRESS) expect(who).toContain(TERMS_BUSINESS_ADDRESS)
    else expect(who).not.toMatch(/Business address/)
    if (TERMS_DTI_BN) expect(who).toContain(TERMS_DTI_BN)
    else expect(who).not.toMatch(/Business name registration/)
  })

  it('never shows a bracketed placeholder publicly', () => {
    expect(text).not.toMatch(/\[[^\]]*\]/)
    expect(text).not.toMatch(/placeholder|to be appointed|region to confirm/i)
  })

  it('explains how to complain, how fast we reply and how to escalate to the DTI', () => {
    const complaints = section('Complaints')
    expect(complaints).toContain(TERMS_CONTACT_EMAIL)
    expect(complaints).toMatch(/within 7 days/)
    expect(complaints).toMatch(/Department of Trade and Industry/)
    expect(complaints).toContain('consumercare@dti.gov.ph')
    expect(complaints).toMatch(/National Privacy Commission/)
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
    expect(info).toMatch(/isn’t affiliated with or endorsed by/)
    for (const org of ['University of the Philippines', 'Ateneo de Manila University', 'De La Salle University', 'University of Santo Tomas', 'DOST-SEI']) {
      expect(info).toContain(org)
    }
    expect(info).toMatch(/Exam names[^"]*trademarks of their owners/)
    expect(info).toMatch(/Cutoffs[^"]*historical[^"]*change/)
    // No promise of a result (the word "guarantee" stays banned, see below).
    expect(info).toMatch(/can’t promise any exam result, admission or scholarship/)
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

  it('discloses AI-assisted content, that our team checks it, that it can be wrong and how to report it', () => {
    const ai = section('AI-assisted content')
    expect(ai).toMatch(/AI tools/)
    expect(ai).toMatch(/checked/)
    expect(ai).toMatch(/can be wrong/)
    expect(ai).toMatch(/Report/)
  })

  it('matches the sign-up step for under-18s (age band + parent or guardian agreement), without an invented age check', () => {
    const minors = section('Students under 18')
    expect(minors).toMatch(/18 or older or under 18/)
    expect(minors).toMatch(/parent or guardian has agreed/)
    expect(minors).toContain(TERMS_PRIVACY_LINK.text)
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

  it('explains in-app account deletion, the web page, the email fallback and suspension', () => {
    const ending = section('Ending your account')
    expect(ending).not.toMatch(/isn’t a delete-account button/)
    expect(ending).toMatch(/Profile, then Your data, then Delete account/)
    expect(ending).toContain('iskotify.ph/delete-account')
    expect(ending).toContain(`email ${TERMS_CONTACT_EMAIL}`)
    expect(ending).toMatch(/suspend/)
    expect(TERMS_SUMMARY.join(' ')).toMatch(/delete your account (in the app|from Profile)/)
  })

  it('points to the privacy policy with a link both apps can render', () => {
    expect(TERMS_PRIVACY_LINK).toEqual({ text: 'Privacy Policy', href: '/privacy' })
    expect(section('Your privacy')).toContain(TERMS_PRIVACY_LINK.text)
  })
})

// The on-device model was removed (P1c): nothing may still offer a download.
describe('no on-device AI model', () => {
  it('no longer offers or describes a downloadable model', () => {
    expect(text).not.toMatch(/download an optional AI model/)
    expect(text).not.toMatch(/runs on your device, without internet/)
  })
})
