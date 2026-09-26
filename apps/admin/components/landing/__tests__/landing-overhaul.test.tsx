import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi, beforeAll } from 'vitest'

// Next.js server components aren't available in Vitest's Node env — stub them
vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) =>
    React.createElement('img', { alt, src }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement('a', { href, className }, children),
}))

import { Nav } from '../Nav'
import { Hero } from '../Hero'
import { FAQ, faqs } from '../FAQ'
import { FooterCTA } from '../FooterCTA'
import { PracticeSection } from '../PracticeSection'
import { EarlyAccessForm } from '../EarlyAccessForm'

// The web app URL the landing buttons fall back to when no env var is set
// (see lib/links.ts). Vitest runs with NEXT_PUBLIC_* unset, so this is what
// renders into the markup.
const WEB_APP_URL = 'https://app.iskotify.ph'

const render = (c: React.FC) => renderToStaticMarkup(React.createElement(c))

// Guards carried over from the pre-launch pricing and honesty passes: no paid
// tiers, no store badges, no invented stats, no retired AI chat.
describe.each([
  ['Nav', Nav],
  ['Hero', Hero],
  ['FAQ', FAQ],
  ['FooterCTA', FooterCTA],
  ['PracticeSection', PracticeSection],
] as const)('%s honesty guards', (_name, Component) => {
  let html: string
  beforeAll(() => { html = render(Component) })

  it('shows no old price or lifetime tagline', () => {
    expect(html).not.toContain('₱129')
    expect(html).not.toMatch(/Lifetime access|one-time payment|Free forever|completely free/i)
  })

  it('shows no App Store / Google Play badges', () => {
    expect(html).not.toContain('App Store')
    expect(html).not.toContain('Google Play')
  })

  it('shows no invented stats', () => {
    expect(html).not.toContain('4.8')
    expect(html).not.toContain('10K+')
  })

  it('no longer markets Kuya Baw / AI chat', () => {
    expect(html).not.toMatch(/Ask Kuya Baw|AI Coach|AI Companion|study companion/)
  })

  it('does not use the elongated pill class on buttons', () => {
    expect(html).not.toContain('rounded-[980px]')
  })
})

// ─── Nav ──────────────────────────────────────────────────────────────────────
describe('Nav', () => {
  let html: string
  beforeAll(() => { html = render(Nav) })

  it('puts the web app behind the one primary nav action', () => {
    expect(html).toContain(`href="${WEB_APP_URL}"`)
    expect(html).toContain('Start studying')
  })

  it('uses root-relative anchors so it works from /listings too', () => {
    expect(html).toContain('href="/#practice"')
    expect(html).not.toContain('#testimonials')
  })
})

// ─── Hero ───────────────────────────────────────────────────────────────────
describe('Hero', () => {
  let html: string
  beforeAll(() => { html = render(Hero) })

  it('points "Start studying free" at the web app', () => {
    expect(html).toMatch(new RegExp(`href="${WEB_APP_URL}"[^>]*>\\s*Start studying free`))
  })

  it('keeps Android early access as the secondary action', () => {
    expect(html).toContain('href="#early-access"')
    expect(html).toContain('Get Android early access')
  })

  it('previews the current Today screen (One Next Step, 4-tab bar)', () => {
    expect(html).toContain('Your next step')
    for (const tab of ['Today', 'Practice', 'Explore', 'Progress']) expect(html).toContain(tab)
  })

  it('drops the old Home dashboard mock', () => {
    expect(html).not.toMatch(/My Focus|Subjects to improve|Quick Practice|Weak Areas|Days Left/)
  })

  it('labels the preview as a sample', () => {
    expect(html).toContain('role="img"')
    expect(html).toContain('Sample screen')
  })
})

// ─── FAQ ────────────────────────────────────────────────────────────────────
describe('FAQ', () => {
  let html: string
  beforeAll(() => { html = render(FAQ) })

  it('is native <details> disclosure (no client JS)', () => {
    expect(html.match(/<details/g)).toHaveLength(faqs.length)
    expect(html.match(/<summary/g)).toHaveLength(faqs.length)
  })

  it('mentions Early Access pricing', () => {
    expect(html).toContain('Early Access')
  })

  it('re-states the estimate disclaimer', () => {
    expect(html).toContain('Estimated Admission Score')
    expect(html).toMatch(/historical cutoffs/)
    expect(html).toMatch(/cannot tell you whether you will get in/)
  })

  it('says the Android app is not on the Play Store yet', () => {
    expect(html).toMatch(/not yet on the Play Store/)
  })

  it('no longer calls early access a "free trial"', () => {
    expect(html).not.toMatch(/free trial/i)
  })
})

// ─── FooterCTA ──────────────────────────────────────────────────────────────
describe('FooterCTA', () => {
  let html: string
  beforeAll(() => { html = render(FooterCTA) })

  it('closes on the approved tagline', () => {
    expect(html).toContain('Para sa mga Iskolar ng Bayan.')
  })

  it('makes the web app the primary action', () => {
    expect(html).toMatch(new RegExp(`href="${WEB_APP_URL}"[^>]*>\\s*Start studying free`))
  })

  it('points Android early access at the form on the home page', () => {
    expect(html).toContain('href="/#early-access"')
  })

  it('no longer says "Start free trial"', () => {
    expect(html).not.toContain('Start free trial')
  })

  it('keeps the legal and contact links', () => {
    for (const href of ['/privacy', '/terms', '/contact']) expect(html).toContain(`href="${href}"`)
  })
})

// ─── EarlyAccessForm ────────────────────────────────────────────────────────
describe('EarlyAccessForm', () => {
  let html: string
  beforeAll(() => { html = render(EarlyAccessForm) })

  it('renders the "Request early access" submit button', () => {
    expect(html).toContain('Request early access')
  })

  it('has labeled name and email inputs', () => {
    expect(html).toContain('for="ea-full-name"')
    expect(html).toContain('for="ea-email"')
    expect(html).toContain('type="email"')
  })

  it('explains the free early-access offer', () => {
    expect(html).toContain('free early access')
    expect(html).not.toContain('August 2, 2026')
  })
})
