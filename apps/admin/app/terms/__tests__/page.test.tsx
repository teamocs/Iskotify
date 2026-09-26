import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TERMS_LAST_UPDATED, TERMS_SECTIONS } from '@iskotify/utils/terms-of-service'

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span data-img={alt} />,
}))

import TermsPage, { metadata } from '../page'

const html = renderToStaticMarkup(<TermsPage />)
const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map(m => (m[1] ?? '').replace(/<[^>]+>/g, ''))
const unescape = (s: string) => s.replace(/&#x27;/g, '\'').replace(/&amp;/g, '&').replace(/&quot;/g, '"')

describe('public terms page (text shared with the app via @iskotify/utils/terms-of-service)', () => {
  it('renders the shared sections in order, after "The short version"', () => {
    expect(h2s.map(unescape)).toEqual(['The short version', ...TERMS_SECTIONS.map(s => s.title)])
  })

  it('shows the shared "last updated" date', () => {
    expect(html).toContain(`Last updated: ${TERMS_LAST_UPDATED}`)
    expect(TERMS_LAST_UPDATED).toBe('September 26, 2026')
  })

  it('drops Calendar sync, payments and "continued use means acceptance"', () => {
    expect(html).not.toMatch(/Google Calendar/i)
    expect(html).not.toMatch(/non-refundable/i)
    expect(html).not.toMatch(/continued use/i)
    expect(h2s.join(' ')).not.toMatch(/Payments/)
  })

  it('names Online Creative Solutions and links the contact address', () => {
    expect(html).toContain('Online Creative Solutions')
    expect(html).toContain('href="mailto:teamocsph@gmail.com"')
  })

  it('links "Privacy Policy" inside the text and in the footer', () => {
    const links = html.match(/<a[^>]*href="\/privacy"[^>]*>Privacy Policy<\/a>/g) ?? []
    expect(links.length).toBeGreaterThanOrEqual(2)
  })

  it('sets a canonical URL of /terms', () => {
    expect(metadata.alternates?.canonical).toBe('/terms')
  })
})
