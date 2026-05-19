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

import { Hero } from '../Hero'
import { Testimonials } from '../Testimonials'
import { FAQ } from '../FAQ'
import { FooterCTA } from '../FooterCTA'
import { KuyaBawCTA } from '../KuyaBawCTA'

// ─── Hero ───────────────────────────────────────────────────────────────────
describe('Hero', () => {
  let html: string
  beforeAll(() => { html = renderToStaticMarkup(React.createElement(Hero)) })

  it('does not use the elongated pill class', () => {
    expect(html).not.toContain('rounded-[980px]')
  })

  it('uses properly-sized rounded-xl on download buttons', () => {
    expect(html).toContain('rounded-xl')
  })

  it('shows one-time price', () => {
    expect(html).toContain('₱129')
  })

  it('shows no-subscription messaging', () => {
    expect(html).toContain('No subscription')
  })

  it('shows early-adopter call-to-action', () => {
    expect(html).toContain('Be among the first')
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

  it('has App Store review CTA', () => {
    expect(html).toContain('Leave a review on App Store')
  })

  it('has Google Play review CTA', () => {
    expect(html).toContain('Rate on Google Play')
  })
})

// ─── FAQ ────────────────────────────────────────────────────────────────────
describe('FAQ', () => {
  let html: string
  beforeAll(() => { html = renderToStaticMarkup(React.createElement(FAQ)) })

  it('shows one-time payment amount', () => {
    expect(html).toContain('₱129')
  })

  it('mentions one-time payment in pricing answer', () => {
    expect(html).toContain('one-time payment')
  })

  it('does not say the app is completely free', () => {
    expect(html).not.toContain('completely free')
  })

  it('does not say "for free" in download answer', () => {
    expect(html).not.toContain('for free')
  })
})

// ─── FooterCTA ──────────────────────────────────────────────────────────────
describe('FooterCTA', () => {
  let html: string
  beforeAll(() => { html = renderToStaticMarkup(React.createElement(FooterCTA)) })

  it('does not use the elongated pill class', () => {
    expect(html).not.toContain('rounded-[980px]')
  })

  it('uses rounded-xl on download buttons', () => {
    expect(html).toContain('rounded-xl')
  })

  it('shows ₱129 in tagline', () => {
    expect(html).toContain('₱129')
  })

  it('shows lifetime access in tagline', () => {
    expect(html).toContain('Lifetime access')
  })

  it('does not say "Free forever"', () => {
    expect(html).not.toContain('Free forever')
  })
})

// ─── KuyaBawCTA ─────────────────────────────────────────────────────────────
describe('KuyaBawCTA', () => {
  let html: string
  beforeAll(() => { html = renderToStaticMarkup(React.createElement(KuyaBawCTA)) })

  it('does not say "Download Free"', () => {
    expect(html).not.toContain('Download Free')
  })

  it('does not use the elongated pill class', () => {
    expect(html).not.toContain('rounded-[980px]')
  })
})
