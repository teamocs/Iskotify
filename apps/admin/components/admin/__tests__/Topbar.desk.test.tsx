// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Topbar } from '../Topbar'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const searchButton = () => Array.from(host.querySelectorAll('button')).find(b => b.textContent?.startsWith('Search'))

describe('Topbar (macOS-style toolbar)', () => {
  it('is a translucent sticky toolbar holding the single 20px bold h1', () => {
    const html = renderToStaticMarkup(<Topbar title="Home" />)
    expect(html).toMatch(/<header[^>]*class="[^"]*\bglass\b[^"]*"/)
    expect(html).toMatch(/<header[^>]*class="[^"]*\bsticky top-0\b/)
    expect(html).toMatch(/<h1[^>]*class="[^"]*text-title-3[^"]*font-bold[^"]*"[^>]*>Home<\/h1>/)
    expect(html.match(/<h1/g)).toHaveLength(1)
  })

  it('shows no search affordance when the page has no search box (never a fake one)', () => {
    act(() => root.render(<Topbar title="Settings" />))
    expect(searchButton()).toBeUndefined()
  })

  it('offers the page search with its real "/" shortcut hint, and focuses it', () => {
    act(() => root.render(
      <>
        <Topbar title="All listings" />
        <input type="search" data-shortcut-search="" aria-label="Search listings" defaultValue="abc" />
      </>,
    ))
    const btn = searchButton()!
    expect(btn).toBeTruthy()
    expect(btn.getAttribute('aria-keyshortcuts')).toBe('/')
    expect(btn.querySelector('kbd')?.textContent).toBe('/')
    expect(btn.textContent).not.toMatch(/Ctrl|⌘\s*K/)
    act(() => btn.click())
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Search listings')
  })
})
