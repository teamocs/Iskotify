import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PRIVACY_LAST_UPDATED, PRIVACY_SECTIONS } from '@iskotify/utils/privacy-policy'

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span data-img={alt} />,
}))

import PrivacyPage from '../page'

const html = renderToStaticMarkup(<PrivacyPage />)
const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map(m => (m[1] ?? '').replace(/<[^>]+>/g, ''))
const unescape = (s: string) => s.replace(/&#x27;/g, '\'').replace(/&amp;/g, '&').replace(/&quot;/g, '"')

describe('public privacy page (text shared with the app via @iskotify/utils/privacy-policy)', () => {
  it('renders the shared sections in order, after "The short version"', () => {
    expect(h2s.map(unescape)).toEqual(['The short version', ...PRIVACY_SECTIONS.map(s => s.title)])
  })

  it('shows the shared "last updated" date', () => {
    expect(html).toContain(`Last updated: ${PRIVACY_LAST_UPDATED}`)
    expect(PRIVACY_LAST_UPDATED).toBe('September 26, 2026')
  })

  it('drops the retired AI Coach and the Export-Data-in-Settings claim', () => {
    expect(html).not.toMatch(/AI Coach/)
    expect(html).not.toMatch(/Export Data (feature )?in Settings/)
  })

  it('links the contact address and the National Privacy Commission', () => {
    expect(html).toContain('href="mailto:teamocsph@gmail.com"')
    expect(html).toContain('National Privacy Commission')
    expect(html).toMatch(/href="https:\/\/privacy\.gov\.ph"[^>]*rel="noopener noreferrer"/)
  })

  it('still links to the Terms of Service', () => {
    expect(html).toContain('href="/terms"')
  })
})

describe('privacy page metadata', () => {
  it('sets a canonical URL of /privacy', async () => {
    const { metadata } = await import('../page')
    expect(metadata.alternates?.canonical).toBe('/privacy')
  })
})
