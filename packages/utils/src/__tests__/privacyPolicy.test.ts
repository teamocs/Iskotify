import { describe, it, expect } from 'vitest'
import {
  PRIVACY_LAST_UPDATED,
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_SECTIONS,
  PRIVACY_SUMMARY,
  NPC_WEBSITE,
  DPO_NAME,
  DPO_EMAIL,
  BUSINESS_ADDRESS,
  SUPABASE_REGION,
  UPSTASH_REGION,
  privacyPolicyText,
} from '../privacyPolicy'

const text = privacyPolicyText()
const section = (title: string) => JSON.stringify(PRIVACY_SECTIONS.find(s => s.title === title))

describe('privacy policy content (shared by the app and the website)', () => {
  it('carries the current "last updated" date and the contact address', () => {
    expect(PRIVACY_LAST_UPDATED).toBe('October 1, 2026')
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
      'Our legal basis',
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
    // No Google Calendar sync.
    expect(text).not.toMatch(/Google Calendar/i)
  })

  it('describes in-app account deletion, the web page and the email fallback', () => {
    expect(text).not.toMatch(/isn’t a delete-account button/)
    const rights = section('Your choices and your rights')
    expect(rights).toMatch(/Profile, then Your data, then Delete account/)
    expect(rights).toMatch(/type DELETE/)
    expect(rights).toContain('iskotify.ph/delete-account')
    expect(rights).toMatch(/within 7 days/)
    expect(rights).toMatch(/can’t be undone/)
    // Honest about what the button does NOT reach.
    expect(rights).toMatch(/PostHog/)
    const keep = section('How long we keep it')
    expect(keep).toMatch(/until you delete your account/)
    expect(keep).not.toMatch(/until you ask us to delete your account/)
  })

  it('discloses the services that receive data, including the leaked-password check', () => {
    for (const name of ['Supabase', 'Vercel', 'Google', 'PostHog', 'Expo', 'Resend', 'Upstash', 'Have I Been Pwned', 'RevenueCat', 'PayMongo', 'Google Play']) {
      expect(text).toContain(name)
    }
    expect(text).toMatch(/first 5 characters/)
    expect(text).toMatch(/Your password and the full code never leave your device/)
    // Mentioned once, in the sharing section only.
    const pwnedSections = PRIVACY_SECTIONS.filter(s => JSON.stringify(s).includes('Pwned'))
    expect(pwnedSections.map(s => s.title)).toEqual(['Who we share it with'])
    expect(PRIVACY_SUMMARY.join(' ')).not.toMatch(/Pwned/)
  })

  it('matches the sign-up consent step for under-18s without inventing verification', () => {
    const minors = section('Students under 18')
    expect(minors).toMatch(/under 18/)
    expect(minors).toMatch(/18 or older or under 18/)
    expect(minors).toMatch(/parent or guardian has agreed/)
    expect(minors).toMatch(/only if you turn on sharing them/)
    expect(minors).toMatch(/analytics stays off unless you turn it on/)
    expect(minors).toMatch(/under 13/)
    expect(minors).toMatch(/we’ll delete it/)
    expect(minors).not.toMatch(/doesn’t have a separate parent or guardian consent step/)
    expect(text).not.toMatch(/verified parental consent/i)
    // The age band is asked; the birthday is not.
    expect(section('What we collect')).toMatch(/whether you’re 18 or older/)
    expect(section('What we collect')).toMatch(/don’t ask for your birthday/)
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

  it('names Online Creative Solutions as the operator and the organisation responsible for your data', () => {
    const who = JSON.stringify(PRIVACY_SECTIONS.find(s => s.title === 'Who we are'))
    expect(who).toContain('“we” and “us” means Online Creative Solutions, who runs the Iskotify app and website')
    expect(who).toMatch(/personal information controller/)
    expect(who).not.toMatch(/the Iskotify team/)
    // The owner's exact name only: no invented legal suffix.
    expect(text).not.toMatch(/\b(Inc\.|Corporation|Corp\.|OPC|Ltd\.?)\b/)
  })
})

describe('P1d: lawful basis, processors, retention, DPO, rights, breaches', () => {
  it('gives a lawful basis for each purpose, citing RA 10173 Sections 12 and 13', () => {
    const basis = section('Our legal basis')
    expect(basis).toMatch(/Section 12/)
    expect(basis).toMatch(/Section 13\(a\)/)
    expect(basis).toMatch(/Running the app and backing up your data:","text":"needed to provide/)
    for (const d of ['grades', 'GWA', 'income bracket', 'Indigenous', 'school records']) expect(basis).toContain(d)
    expect(basis).toMatch(/separate consent/)
    expect(basis).toMatch(/Usage analytics:","text":"your consent/)
    expect(basis).toMatch(/legitimate interest/)
    expect(basis).toMatch(/spam/)
  })

  it('names the country of every service that receives data, and the service agreements', () => {
    const share = section('Who we share it with')
    // Supabase and Upstash name their region once the owner confirms it.
    if (SUPABASE_REGION) expect(share).toMatch(new RegExp(`Supabase","text":"[^"]*Servers: ${SUPABASE_REGION}`))
    for (const name of ['Vercel', 'Google', 'PostHog', 'Resend', 'Expo']) {
      expect(share).toMatch(new RegExp(`"${name}","text":"[^"]*United States`))
    }
    if (UPSTASH_REGION) expect(share).toMatch(new RegExp(`Upstash","text":"[^"]*Servers: ${UPSTASH_REGION}`))
    expect(share).toMatch(/"RevenueCat","text":"[^"]*account ID[^"]*Google Play purchase[^"]*Servers: United States/)
    expect(share).toMatch(/"PayMongo","text":"[^"]*web payments[^"]*payment details you enter on its page[^"]*Servers: Philippines/)
    expect(share).toMatch(/"Google Play","text":"[^"]*in-app payments[^"]*Google’s privacy policy/)
    expect(share).toMatch(/first 5 characters/)
    expect(share).toContain('We use service agreements requiring these providers to protect your data.')
  })

  it('states a retention period for each kind of data, with no open-ended "not yet" schedule', () => {
    const keep = section('How long we keep it')
    expect(keep).not.toMatch(/fixed schedule yet/)
    expect(keep).toMatch(/Bug reports and their screenshots:","text":"[^"]*12 months after we close the report/)
    expect(keep).toMatch(/Feedback, question reports and date suggestions:","text":"[^"]*12 months/)
    expect(keep).toMatch(/Analytics:","text":"[^"]*12 months/)
    expect(keep).toMatch(/Early access sign-ups:","text":"[^"]*6 months after Iskotify launches publicly/)
    expect(keep).toMatch(/When you delete your account:/)
    expect(keep).toMatch(/Purchase records:","text":"[^"]*as long as tax law requires[^"]*unlinked from you/)
  })

  it('collects purchases and says why, without claiming nothing is kept after deletion', () => {
    expect(section('What we collect')).toMatch(/Purchases\./)
    expect(section('Our legal basis')).toMatch(/Purchases[^"]*:","text":"[^"]*Section 12\(c\)/)
    expect(text).not.toMatch(/today, nothing/)
  })

  it('reaches the Data Protection Officer through a working inbox, leaving out details not supplied yet', () => {
    const contact = section('Contact us')
    expect(contact).toMatch(/Data Protection Officer/)
    expect(contact).toContain(PRIVACY_CONTACT_EMAIL)
    expect(contact).toContain('Online Creative Solutions')
    // Each owner-supplied detail appears only once it is filled in.
    for (const v of [DPO_NAME, DPO_EMAIL, BUSINESS_ADDRESS, SUPABASE_REGION, UPSTASH_REGION]) {
      if (v) expect(text).toContain(v)
    }
    if (!DPO_EMAIL) expect(text).not.toContain('dpo@')
    if (!SUPABASE_REGION) expect(section('Who we share it with')).not.toMatch(/Supabase[^}]*Servers:/)
  })

  it('never shows a bracketed placeholder publicly', () => {
    expect(text).not.toMatch(/\[[^\]]*\]/)
    expect(text).not.toMatch(/placeholder|to be appointed|region to confirm/i)
  })

  it('lets you withdraw consent and says where, and keeps the other rights', () => {
    const rights = section('Your choices and your rights')
    expect(rights).toMatch(/Withdraw consent/)
    expect(rights).toMatch(/Profile, then Scholarship info/)
    // The button the app actually shows (components/consent/WithdrawSensitiveButton.tsx).
    expect(rights).toMatch(/Withdraw consent and clear these details/)
    expect(rights).toMatch(/Settings, then Privacy/)
    expect(rights).toMatch(/Object/)
    expect(rights).toMatch(/National Privacy Commission at privacy\.gov\.ph/)
    expect(rights).toMatch(/Export Data[^"]*answer history[^"]*notes/)
    expect(rights).toMatch(/doesn’t include[^"]*email us/)
  })

  it('promises breach notification to the NPC and affected users', () => {
    expect(section('Where it’s stored')).toMatch(/notify the National Privacy Commission and the affected users/)
  })
})

describe('AI wording (the student app ships no AI and sends nothing to an AI provider)', () => {
  it('no longer mentions the removed on-device model, Hugging Face or Gemini ranking', () => {
    expect(text).not.toMatch(/Hugging Face/i)
    expect(text).not.toMatch(/on-device (AI )?model/i)
    expect(text).not.toMatch(/Gemini/i)
    expect(text).not.toMatch(/AI ranks/i)
  })

  it('says scholarship search words are not sent anywhere', () => {
    expect(text).toMatch(/Scholarship searches are ranked on your phone by keywords/)
    expect(text).toMatch(/never sent to an AI provider/)
  })

  it('discloses that some practice content is drafted with AI and reviewed by our team', () => {
    expect(text).toMatch(/drafted with the help of AI tools/)
  })
})
