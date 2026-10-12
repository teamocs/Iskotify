// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/image', () => ({
  default: ({ alt, src, width, height, className }: Record<string, unknown>) =>
    React.createElement('img', { alt, src, width, height, className }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('a', { href, ...rest }, children),
}))

import { Nav } from '../landing/Nav'
import { WEB_APP_URL } from '../../lib/links'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const LINKS = [
  ['/#practice', 'Practice'],
  ['/#explore', 'Explore'],
  ['/#progress', 'Progress'],
  ['/#faq', 'FAQ'],
] as const

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
  document.body.style.overflow = ''
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<Nav />))
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const toggle = () => host.querySelector<HTMLButtonElement>('button[aria-controls]')!
const menu = () => document.getElementById(toggle().getAttribute('aria-controls')!)!
const press = (k: string, shiftKey = false) =>
  act(() => { (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true })) })

describe('landing Nav: links and labels unchanged', () => {
  const html = renderToStaticMarkup(<Nav />)

  it('keeps the Main landmark, the logo and the untranslated wordmark', () => {
    expect(html).toContain('aria-label="Main"')
    expect(html).toMatch(/<img[^>]*src="\/logo.svg"/)
    expect(html).toMatch(/<span translate="no"[^>]*>Iskotify<\/span>/)
    expect(html).toMatch(/<a href="\/"/)
  })

  it('keeps the four section links with the same hrefs and labels, in order', () => {
    const bar = html.slice(0, html.indexOf('aria-controls'))
    const found = [...bar.matchAll(/<a href="(\/#[a-z]+)"[^>]*>([^<]+)<\/a>/g)].map(m => [m[1], m[2]])
    expect(found).toEqual(LINKS.map(l => [...l]))
  })

  it('keeps "Start studying" pointing at the web app, as a 32px maroon capsule', () => {
    expect(html).toMatch(new RegExp(`<a href="${WEB_APP_URL}"[^>]*class="[^"]*\\bh-8\\b[^"]*rounded-capsule[^"]*bg-maroon[^"]*"[^>]*>Start studying</a>`))
  })

  it('is a 52px frosted strip with a 3-column inner grid', () => {
    // The frosted strip is the header's first child (a filtered header would trap the fixed menu).
    expect(html).toMatch(/<header[^>]*class="[^"]*\bsticky top-0\b[^"]*"><div class="glass\b[^"]*"><nav/)
    expect(html).toMatch(/<nav[^>]*class="[^"]*h-\[52px\][^"]*max-w-\[1080px\][^"]*md:grid-cols-\[1fr_auto_1fr\]/)
  })

  it('gives the bar links 44px targets at 14px, ink at 88%', () => {
    expect(html).toMatch(/<a href="\/#practice" class="[^"]*min-h-11[^"]*text-sm[^"]*text-ink\/\[0\.88\]/)
  })
})

describe('landing Nav: phone menu', () => {
  it('has a two-line menu button, collapsed, controlling a hidden menu', () => {
    const btn = toggle()
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(btn.getAttribute('aria-label')).toBe('Menu')
    expect(btn.querySelectorAll('[data-line]')).toHaveLength(2)
    expect(menu().hidden).toBe(true)
  })

  it('opens a full-screen frosted menu with the same links, large, and the CTA at the bottom', () => {
    act(() => toggle().click())
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    const m = menu()
    expect(m.hidden).toBe(false)
    expect(m.className).toMatch(/\bglass\b/)
    expect(m.className).toMatch(/\bfixed inset-0\b/)
    const links = Array.from(m.querySelectorAll('a'))
    expect(links.slice(0, 4).map(a => [a.getAttribute('href'), a.textContent])).toEqual(LINKS.map(l => [...l]))
    expect(links[0]!.className).toMatch(/text-\[28px\][^"]*font-semibold/)
    expect(links.at(-1)!.getAttribute('href')).toBe(WEB_APP_URL)
    expect(links.at(-1)!.textContent).toBe('Start studying')
  })

  it('staggers the entrance, but only when motion is allowed', () => {
    act(() => toggle().click())
    const items = Array.from(menu().querySelectorAll('li'))
    expect(items.every(li => /motion-safe:animate-slideUp/.test(li.className))).toBe(true)
    const delays = items.map(li => li.style.animationDelay)
    expect(new Set(delays).size).toBe(items.length)
  })

  it('moves focus into the menu and locks page scroll', () => {
    act(() => toggle().click())
    expect(menu().contains(document.activeElement)).toBe(true)
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close menu')
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('closes on Escape, returns focus to the menu button and unlocks scroll', () => {
    act(() => toggle().click())
    press('Escape')
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(menu().hidden).toBe(true)
    expect(document.activeElement).toBe(toggle())
    expect(document.body.style.overflow).toBe('')
  })

  it('closes when the button is pressed again, returning focus to it', () => {
    act(() => toggle().click())
    act(() => toggle().click())
    expect(menu().hidden).toBe(true)
    expect(document.activeElement).toBe(toggle())
  })

  it('closes when a menu link is clicked', () => {
    act(() => toggle().click())
    const link = menu().querySelector<HTMLAnchorElement>('a[href="/#faq"]')!
    link.addEventListener('click', e => e.preventDefault())
    act(() => link.click())
    expect(menu().hidden).toBe(true)
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
  })

  it('is a labelled modal dialog while open', () => {
    act(() => toggle().click())
    const m = menu()
    expect(m.getAttribute('role')).toBe('dialog')
    expect(m.getAttribute('aria-modal')).toBe('true')
    expect(m.getAttribute('aria-label')).toBe('Menu')
  })

  it('makes the page behind inert while open, and restores it on close', () => {
    const page = document.createElement('main')
    document.body.appendChild(page)
    const before = document.createElement('div')
    before.setAttribute('inert', '')
    document.body.appendChild(before)
    act(() => toggle().click())
    expect(page.hasAttribute('inert')).toBe(true)
    expect(host.hasAttribute('inert')).toBe(false)
    expect(toggle().closest('[inert]')).toBeNull()
    press('Escape')
    expect(page.hasAttribute('inert')).toBe(false)
    // Something that was already inert stays inert.
    expect(before.hasAttribute('inert')).toBe(true)
    page.remove()
    before.remove()
  })

  it('locks scroll iOS-style (position: fixed at the saved offset) and restores the offset', () => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 420 })
    const scrollTo = vi.fn()
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo
    act(() => toggle().click())
    expect(document.body.style.position).toBe('fixed')
    expect(document.body.style.top).toBe('-420px')
    press('Escape')
    expect(document.body.style.position).toBe('')
    expect(document.body.style.top).toBe('')
    expect(scrollTo).toHaveBeenCalledWith(0, 420)
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
  })

  it('has its own labelled Close button first in the dialog (screen readers cannot reach the toggle behind aria-modal)', () => {
    act(() => toggle().click())
    const close = menu().querySelector<HTMLButtonElement>('button[aria-label="Close menu"]')!
    expect(close).toBeTruthy()
    expect(menu().querySelector('a, button')).toBe(close)
    expect(close.className).toMatch(/\bh-11\b[^"]*\bw-11\b/)
    expect(close.querySelectorAll('[data-line]')).toHaveLength(2)
    expect(document.activeElement).toBe(close)
  })

  it('activating Close closes the menu and returns focus to the toggle', () => {
    act(() => toggle().click())
    const close = menu().querySelector<HTMLButtonElement>('button[aria-label="Close menu"]')!
    act(() => close.click())
    expect(menu().hidden).toBe(true)
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(toggle())
    expect(document.body.style.overflow).toBe('')
  })

  it('keeps Tab inside the open menu dialog (Close through the CTA)', () => {
    act(() => toggle().click())
    const close = menu().querySelector<HTMLButtonElement>('button[aria-label="Close menu"]')!
    const cta = Array.from(menu().querySelectorAll('a')).at(-1)!
    cta.focus()
    press('Tab')
    expect(document.activeElement).toBe(close)
    press('Tab', true)
    expect(document.activeElement).toBe(cta)
  })
})
