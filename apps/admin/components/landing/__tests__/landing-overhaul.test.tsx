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
import { Testimonials } from '../Testimonials'
import { FAQ } from '../FAQ'
import { FooterCTA } from '../FooterCTA'
import { Features } from '../Features'
import { EarlyAccessForm } from '../EarlyAccessForm'

// The web app URL the landing buttons fall back to when no env var is set
// (see lib/links.ts). Vitest runs with NEXT_PUBLIC_* unset, so this is what
// renders into the markup.
const WEB_APP_URL = 'https://app.iskotify.ph'

// ─── Nav ──────────────────────────────────────────────────────────────────────
describe('Nav', () => {
  let html: string
  beforeAll(() => { html = renderToStaticMarkup(React.createElement(Nav)) })

  it('renders a "Try on Web" button', () => {
    expect(html).toContain('Try on Web')
  })

  it('links "Try on Web" to the web app', () => {
    expect(html).toContain(WEB_APP_URL)
  })
})

// ─── Hero ───────────────────────────────────────────────────────────────────
describe('Hero', () => {
  let html: string
  beforeAll(() => { html = renderToStaticMarkup(React.createElement(Hero)) })

  it('does not use the elongated pill class', () => {
    expect(html).not.toContain('rounded-[980px]')
  })

  it('uses properly-sized rounded-xl on CTA buttons', () => {
    expect(html).toContain('rounded-xl')
  })

  it('shows Early Access pricing (free)', () => {
    expect(html).toContain('Early access')
    expect(html).toContain('Start for free')
  })

  it('no longer shows the old one-time price', () => {
    expect(html).not.toContain('₱129')
  })

  it('shows no-subscription messaging', () => {
    expect(html).toContain('No subscription')
  })

  it('shows early-adopter call-to-action', () => {
    expect(html).toContain('Be among the first')
  })

  it('has a "Try on Web" button pointing at the web app', () => {
    expect(html).toContain('Try on Web')
    expect(html).toContain(WEB_APP_URL)
  })

  it('points the Android "Start for free" CTA at the early-access form', () => {
    expect(html).toContain('href="#early-access"')
  })

  it('no longer shows App Store / Google Play download badges', () => {
    expect(html).not.toContain('App Store')
    expect(html).not.toContain('Google Play')
  })

  it('does not show fake rating stat', () => {
    expect(html).not.toContain('4.8')
  })

  it('does not show fake student count', () => {
    expect(html).not.toContain('10K+')
  })

  it('does not show "Free to Use"', () => {
    expect(html).not.toContain('Free to Use')
  })

  // Mockup fidelity — the phone mockup must mirror the CURRENT Home dashboard,
  // not the old one. Guard against regressing to the previous design.
  it('mockup reflects the current Home sections', () => {
    expect(html).toContain('My Focus')
    expect(html).toContain('Subjects to improve')
  })

  it('mockup drops the old dashboard design', () => {
    expect(html).not.toContain('Quick Practice')
    expect(html).not.toContain('Weak Areas')
    expect(html).not.toContain('Days Left')
  })

  // Kuya Baw / AI-chat marketing was retired — the mock app has no chat FAB
  // or Kuya hero band (real app: 4-tab bar, focus-tile home, no chat).
  it('no longer markets Kuya Baw / AI chat in the mock', () => {
    expect(html).not.toContain('Ask Kuya Baw')
    expect(html).not.toContain('Kuya Baw')
    expect(html).not.toContain('AI Coach')
  })
})

// ─── Testimonials ───────────────────────────────────────────────────────────
describe('Testimonials', () => {
  let html: string
  beforeAll(() => { html = renderToStaticMarkup(React.createElement(Testimonials)) })

  it('shows empty-state heading', () => {
    expect(html).toContain('Be the first to review Iskotify')
  })

  it('does not show fake student names', () => {
    expect(html).not.toContain('Maria Santos')
    expect(html).not.toContain('Juan dela Cruz')
    expect(html).not.toContain('Ana Reyes')
  })

  it('has a feedback CTA', () => {
    expect(html).toContain('Share your feedback')
  })

  it('no longer shows App Store / Google Play review CTAs', () => {
    expect(html).not.toContain('App Store')
    expect(html).not.toContain('Google Play')
  })
})

// ─── FAQ ────────────────────────────────────────────────────────────────────
describe('FAQ', () => {
  let html: string
  beforeAll(() => { html = renderToStaticMarkup(React.createElement(FAQ)) })

  it('mentions Early Access pricing', () => {
    expect(html).toContain('Early Access')
  })

  it('no longer mentions the old one-time payment price', () => {
    expect(html).not.toContain('₱129')
    expect(html).not.toContain('one-time payment')
  })

  it('does not say the app is completely free', () => {
    expect(html).not.toContain('completely free')
  })

  it('does not dangle a misleading "for free" download claim', () => {
    expect(html).not.toContain('for free')
  })

  it('no longer points to App Store / Google Play', () => {
    expect(html).not.toContain('App Store')
    expect(html).not.toContain('Google Play')
  })
})

// ─── FooterCTA ──────────────────────────────────────────────────────────────
describe('FooterCTA', () => {
  let html: string
  beforeAll(() => { html = renderToStaticMarkup(React.createElement(FooterCTA)) })

  it('does not use the elongated pill class', () => {
    expect(html).not.toContain('rounded-[980px]')
  })

  it('uses rounded-xl on CTA buttons', () => {
    expect(html).toContain('rounded-xl')
  })

  it('shows the "Start for free on Early access" tagline', () => {
    expect(html).toContain('Start for free on Early access')
  })

  it('no longer shows the old ₱129 / lifetime tagline', () => {
    expect(html).not.toContain('₱129')
    expect(html).not.toContain('Lifetime access')
  })

  it('does not say "Free forever"', () => {
    expect(html).not.toContain('Free forever')
  })

  it('removes App Store / Google Play download badges', () => {
    expect(html).not.toContain('App Store')
    expect(html).not.toContain('Google Play')
  })

  it('offers an Android free-trial CTA', () => {
    expect(html).toContain('Start free trial')
  })

  it('points the Android free-trial CTA at the early-access form', () => {
    expect(html).toContain('href="#early-access"')
  })

  it('has a "Try on Web" button pointing at the web app', () => {
    expect(html).toContain('Try on Web')
    expect(html).toContain(WEB_APP_URL)
  })
})

// ─── EarlyAccessForm ────────────────────────────────────────────────────────
describe('EarlyAccessForm', () => {
  let html: string
  beforeAll(() => { html = renderToStaticMarkup(React.createElement(EarlyAccessForm)) })

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

// ─── Features ───────────────────────────────────────────────────────────────
describe('Features', () => {
  let html: string
  beforeAll(() => { html = renderToStaticMarkup(React.createElement(Features)) })

  it('no longer markets Kuya Baw / AI chat', () => {
    expect(html).not.toContain('Kuya Baw')
    expect(html).not.toContain('AI Companion')
    expect(html).not.toContain('study companion')
  })

  it('replaces the retired benefit card with the study-plan/analytics card', () => {
    expect(html).toContain('Smart study plan &amp; progress analytics')
    expect(html).toContain('spaced-repetition flashcards')
  })

  it('keeps the career AI-impact and AI-proof course copy', () => {
    expect(html).toContain('AI-proof course')
    expect(html).toContain('AI&#x27;s impact')
  })

  it('keeps the AI flashcards exam-prep copy', () => {
    expect(html).toContain('AI flashcards')
  })
})
