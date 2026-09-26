import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

/*
 * Regression guard for the owner's report: "it has a scroll bar showing on it".
 * The nav used a bare `overflow-y-auto`, so on Windows (classic, always-visible
 * scrollbars) any viewport shorter than ~990px painted a full grey 17px
 * scrollbar down the sidebar. The fix lives in globals.css as `.sidebar-scroll`.
 */
const css = readFileSync(path.resolve(__dirname, '../../app/globals.css'), 'utf8')

function rule(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = css.match(new RegExp(`${esc}\\s*\\{([^}]*)\\}`))
  return m?.[1] ?? ''
}

describe('.sidebar-scroll', () => {
  it('scrolls, thin, with an invisible thumb at rest', () => {
    const r = rule('.sidebar-scroll')
    expect(r).toMatch(/overflow-y:\s*auto/)
    expect(r).toMatch(/scrollbar-width:\s*thin/)
    expect(r).toMatch(/scrollbar-color:\s*transparent transparent/)
  })

  it('reserves the gutter so revealing the thumb never shifts the nav', () => {
    expect(rule('.sidebar-scroll')).toMatch(/scrollbar-gutter:\s*stable/)
  })

  it('reveals the thumb only on hover or keyboard focus inside', () => {
    expect(css).toMatch(/\.sidebar-scroll:hover[\s\S]*?\.sidebar-scroll:focus-within[\s\S]*?scrollbar-color:\s*var\(--sidebar-scrollbar\)/)
  })

  it('covers WebKit engines without scrollbar-color', () => {
    expect(css).toMatch(/\.sidebar-scroll::-webkit-scrollbar-thumb\s*\{[^}]*background:\s*transparent/)
  })

  it('scrolls a focused item clear of the 28px edge fade', () => {
    expect(rule('.sidebar-scroll')).toMatch(/scroll-padding-block:\s*28px/)
  })

  it('drops the fade while focus is inside, so no focus ring is clipped', () => {
    expect(css).toMatch(/\.sidebar-scroll\[data-overflow\]:focus-within\s*\{[^}]*mask-image:\s*none/)
  })
})
