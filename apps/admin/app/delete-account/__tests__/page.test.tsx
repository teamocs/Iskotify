import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span data-img={alt} />,
}))

import DeleteAccountPage, { metadata } from '../page'
import { config as middlewareConfig } from '../../../middleware'

const html = renderToStaticMarkup(<DeleteAccountPage />)
const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '\'').replace(/&amp;/g, '&').replace(/\s+/g, ' ')

describe('public /delete-account page (Google Play data deletion link)', () => {
  it('names the app and the developer', () => {
    expect(html).toMatch(/<h1[^>]*>[^<]*Delete your Iskotify account/)
    expect(text).toContain('Iskotify')
    expect(text).toContain('Online Creative Solutions')
  })

  it('explains how to delete inside the app and on the web app', () => {
    expect(text).toMatch(/Profile/)
    expect(text).toMatch(/Your data/)
    expect(text).toMatch(/Delete account/)
    expect(text).toMatch(/type DELETE/)
    expect(html).toContain('href="https://app.iskotify.ph"')
  })

  it('gives the email fallback with the exact subject and a 7-day promise', () => {
    expect(html).toContain('href="mailto:teamocsph@gmail.com?subject=Delete%20my%20Iskotify%20account"')
    expect(text).toContain('teamocsph@gmail.com')
    expect(text).toContain('Delete my Iskotify account')
    expect(text).toMatch(/email address (on|of) your account/)
    expect(text).toMatch(/within 7 days/)
  })

  it('lists what is deleted', () => {
    expect(text).toMatch(/account and sign-in/i)
    expect(text).toMatch(/cloud backup/i)
    expect(text).toMatch(/bug reports, feedback, question reports and date suggestions/i)
    expect(text).toMatch(/screenshots/i)
    expect(text).toMatch(/early.access sign-up/i)
  })

  it('says what is kept: nothing, except where the law requires (none today)', () => {
    expect(text).toMatch(/We keep nothing about you/i)
    expect(text).toMatch(/where the law requires/i)
    expect(text).toMatch(/none today/i)
    expect(text).toMatch(/PostHog/)
  })

  it('links to the privacy policy and terms, and is not a login page', () => {
    expect(html).toContain('href="/privacy"')
    expect(html).toContain('href="/terms"')
    expect(html).not.toMatch(/<form/)
  })

  it('has one h1 and a canonical URL', () => {
    expect((html.match(/<h1/g) ?? []).length).toBe(1)
    expect(metadata.alternates?.canonical).toBe('/delete-account')
    expect(String(metadata.title)).toMatch(/Delete/)
  })
})

describe('middleware does not gate /delete-account', () => {
  it('only runs on /admin, /api and /login, so the page needs no session', () => {
    const matchers = middlewareConfig.matcher as string[]
    const covers = (path: string) => matchers.some(m => {
      const base = m.replace(/\/:path\*$/, '')
      return path === base || path.startsWith(`${base}/`)
    })
    expect(covers('/delete-account')).toBe(false)
    expect(covers('/privacy')).toBe(false)
    expect(covers('/admin/listings')).toBe(true)
  })
})
