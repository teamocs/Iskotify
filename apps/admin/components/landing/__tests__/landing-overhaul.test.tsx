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
