import React from 'react'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi, beforeAll } from 'vitest'

/*
 * The whole landing page (app/page.tsx), rendered the way the server renders
 * it. These guard the 2026-09 relaunch decisions: the web app is the primary
 * action, every showcased feature has a section, no testimonials without real
 * consenting students, and the Estimated Admission Score keeps the mobile
 * app's compliance framing (apps/mobile/app/estimator/__tests__/compliance).
 */

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => React.createElement('img', { alt, src }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement('a', { href, className }, children),
}))

const LISTING = {
  id: 'l1', title: 'Sample Scholarship', slug: 'sample', type: 'scholarship', status: 'active',
  provider: 'Sample Provider', region: 'National', grant_amount: null, coverage: 'Tuition',
  deadline: '2026-12-01', exam_date: null, external_url: 'https://example.org',
}
vi.mock('@iskotify/utils', () => ({
  createServerClient: () => ({
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [LISTING] }) }) }),
  }),
}))

import HomePage, { metadata } from '../../../app/page'

const WEB_APP_URL = 'https://app.iskotify.ph'
const LANDING_DIR = path.resolve(__dirname, '..')

let html: string
/** Visible text only: tags stripped, entities for quotes and ampersands decoded. */
let text: string

beforeAll(async () => {
  html = renderToStaticMarkup(await HomePage())
  text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
})

/** The <section> (or other element) with this id, up to its closing tag. */
function sectionHtml(id: string): string {
  const start = html.indexOf(`id="${id}"`)
  expect(start, `section #${id} is missing`).toBeGreaterThan(-1)
  const end = html.indexOf('</section>', start)
  return html.slice(start, end === -1 ? undefined : end)
}

describe('landing page structure', () => {
  it('has exactly one h1', () => {
    expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1)
  })

  it('wraps the content in the <main id="main-content"> the skip link targets', () => {
    expect(html).toContain('<main id="main-content"')
  })

  it('never skips a heading level (h1 → h2 → h3)', () => {
    const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map(m => Number(m[1]))
    expect(levels[0]).toBe(1)
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]! - levels[i - 1]!, `h${levels[i - 1]} → h${levels[i]}`).toBeLessThanOrEqual(1)
    }
  })

  it('uses no eyebrow kicker labels above headings', () => {
    expect(html).not.toMatch(/uppercase tracking-\[0\.14em\]/)
  })
})

describe('hero and calls to action', () => {
  it('leads with the study-coach promise for entrance exams', () => {
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)![1]!.replace(/<[^>]+>/g, '')
    expect(h1).toMatch(/one next step/i)
    expect(text).toMatch(/UPCAT/)
    expect(text).toMatch(/free entrance-exam practice/i)
    expect(text).toMatch(/scholarship finder/i)
  })

  it('keeps the approved tagline', () => {
    expect(text).toContain('Para sa mga Iskolar ng Bayan')
  })

  it('makes the web app the primary hero action, ahead of Android early access', () => {
    const hero = sectionHtml('top')
    const web = hero.indexOf(`href="${WEB_APP_URL}"`)
    const android = hero.indexOf('href="#early-access"')
    expect(web).toBeGreaterThan(-1)
    expect(android).toBeGreaterThan(-1)
    expect(web).toBeLessThan(android)
    expect(hero).toMatch(/Start studying free/)
  })

  it('gives the primary CTAs a 44px minimum target', () => {
    const hero = sectionHtml('top')
    const ctas = [...hero.matchAll(/<a [^>]*href="(?:https:\/\/app\.iskotify\.ph|#early-access)"[^>]*>/g)]
    expect(ctas.length).toBeGreaterThanOrEqual(2)
    for (const [tag] of ctas) expect(tag).toMatch(/min-h-11|min-h-12/)
  })

  it('never claims the Android app can be downloaded today', () => {
    expect(text).not.toMatch(/Get it on Google Play|Download (it|now|the app)|available on (the )?(Google )?Play/i)
    expect(text).not.toMatch(/App Store/)
  })

  it('points the nav and the closing CTA at the web app too', () => {
    const nav = html.slice(0, html.indexOf('<main'))
    expect(nav).toContain(`href="${WEB_APP_URL}"`)
    expect(sectionHtml('start')).toContain(`href="${WEB_APP_URL}"`)
  })
})

describe('feature sections', () => {
  it.each(['top', 'today', 'practice', 'estimate', 'explore', 'progress', 'anywhere', 'faq', 'early-access', 'start'])(
    'has the #%s section',
    id => { expect(html).toContain(`id="${id}"`) },
  )

  it('Today: one next study action', () => {
    expect(sectionHtml('today')).toMatch(/One Next Step/)
  })

  it('Practice: mocks that save and resume, review before submit, neutral per-subtest results, flashcards, diagnostic, figures', () => {
    const s = sectionHtml('practice').replace(/<[^>]+>/g, ' ')
    expect(s).toMatch(/save[sd]? as you go/i)
    expect(s).toMatch(/resume/i)
    expect(s).toMatch(/review .*before (you )?submit/i)
    expect(s).toMatch(/per subtest|per-subtest/i)
    expect(s).toMatch(/flashcards/i)
    expect(s).toMatch(/spaced/i)
    expect(s).toMatch(/diagnostic/i)
    expect(s).toMatch(/figure|diagram/i)
  })

  it('Estimated Admission Score: an estimate from historical cutoffs, computed on the device', () => {
    const s = sectionHtml('estimate').replace(/<[^>]+>/g, ' ')
    expect(s).toContain('Estimated Admission Score')
    expect(s).toMatch(/historical cutoffs/i)
    expect(s).toMatch(/on your (phone|device)|on this device/i)
    expect(s).toMatch(/only an estimate/i)
  })

  it('Explore: schools and exams, scholarships, courses, destinations, news and dates, with live listings', () => {
    const s = sectionHtml('explore').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&')
    for (const area of ['Schools & exams', 'Scholarships', 'Courses', 'Destinations', 'News & dates']) {
      expect(s).toContain(area)
    }
    expect(text).toContain('Sample Scholarship')
  })

  it('Progress: readiness by subject, stats and trends, plus notes', () => {
    const s = sectionHtml('progress').replace(/<[^>]+>/g, ' ')
    expect(s).toMatch(/readiness by subject/i)
    expect(s).toMatch(/trend/i)
    expect(s).toMatch(/notes/i)
  })

  it('Anywhere: offline, backed up, phone/tablet/desktop, accessible, guided tour', () => {
    const s = sectionHtml('anywhere').replace(/<[^>]+>/g, ' ')
    expect(s).toMatch(/offline/i)
    // The web app needs a connection to open, so the heading itself scopes offline to Android.
    expect(s).toMatch(/Works offline on Android/)
    expect(s).toMatch(/backed up to your account/i)
    expect(s).toMatch(/phone, tablet (and|&) (desktop|computer)/i)
    expect(s).toMatch(/screen reader/i)
    expect(s).toMatch(/guided tour/i)
  })
})

describe('honesty guards', () => {
  it('has no testimonials section, nav link or component', () => {
    expect(html).not.toContain('id="testimonials"')
    expect(html).not.toContain('href="#testimonials"')
    expect(text).not.toMatch(/What Students Are Saying|Student Reviews/i)
    expect(existsSync(path.join(LANDING_DIR, 'Testimonials.tsx'))).toBe(false)
  })

  it('never frames the estimate as a prediction or an official score', () => {
    expect(text).not.toMatch(/predict/i)
    expect(text).not.toMatch(/official (admission )?score/i)
    expect(text).not.toMatch(/your UPG/i)
    expect(text).not.toMatch(/will qualify|guarantee/i)
    expect(text).not.toMatch(/\b(pass|passed|fail|failed)\b/i)
  })

  it('invents no social proof', () => {
    expect(text).not.toMatch(/\d+[kK]\+|\d{2,}% of students|students admitted|★/)
  })

  it('no longer markets the retired AI chat', () => {
    expect(text).not.toMatch(/Kuya Baw|AI Coach|AI Companion/)
  })
})

describe('landing metadata', () => {
  it('describes the study coach for entrance exams and scholarships', () => {
    expect(String(metadata.title)).toMatch(/UPCAT|entrance exam/i)
    expect(String(metadata.description)).toMatch(/scholarship/i)
    expect(String(metadata.description)).toMatch(/free/i)
  })

  it('sets Open Graph and Twitter cards to the same promise', () => {
    expect(String(metadata.openGraph?.title)).toMatch(/UPCAT|entrance exam/i)
    expect(String(metadata.openGraph?.description)).toMatch(/scholarship/i)
    expect(metadata.openGraph?.images).toBeTruthy()
    expect(String(metadata.twitter?.description)).toMatch(/scholarship/i)
  })
})

describe('landing design tokens', () => {
  // Same banned set as lib/__tests__/noRawColours.test.ts, plus the 12px floor.
  const ARBITRARY = /-\[#[0-9a-fA-F]{3,8}\]/
  const PALETTE = /(?:bg|text|border|ring|divide|from|to|via|fill|stroke|outline|placeholder|shadow|accent)-(?:gray|slate|purple|red)-\d{2,3}\b/
  const HEX_IN_STRING = /(['"`])[^'"`\n]*#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z])[^'"`\n]*\1/
  const SUB_12PX = /text-\[(?:[0-9]|1[01])(?:\.\d+)?px\]/

  const files = readdirSync(LANDING_DIR).filter(f => f.endsWith('.tsx'))

  it.each(files)('%s uses tokens only and no text under 12px', f => {
    const src = readFileSync(path.join(LANDING_DIR, f), 'utf8')
    expect(src).not.toMatch(ARBITRARY)
    expect(src).not.toMatch(PALETTE)
    expect(src).not.toMatch(HEX_IN_STRING)
    expect(src).not.toMatch(SUB_12PX)
  })
})
