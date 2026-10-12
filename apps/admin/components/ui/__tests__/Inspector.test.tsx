// @vitest-environment jsdom
import React, { act, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }))

import { Drawer } from '../Drawer'
import { INSPECTOR_QUERY } from '../useMediaQuery'
import { resetTrapStack } from '../trapStack'
import { QuestionEditDrawer } from '@/components/admin/QuestionEditDrawer'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let wide = true
function installMatchMedia() {
  window.matchMedia = ((query: string) => ({
    matches: query === INSPECTOR_QUERY ? wide : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  installMatchMedia()
  resetTrapStack()
  document.body.style.overflow = ''
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  document.body.innerHTML = ''
})

const press = (k: string, target: Element = document.activeElement ?? document.body, shiftKey = false) =>
  act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true })) })

/** A list with an Edit button that opens an inspector Drawer, like the review queue. */
function Harness({ dirty = false, onClose }: { dirty?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  const first = useRef<HTMLInputElement>(null)
  return (
    <div data-testid="page">
      <button type="button" id="opener" onClick={() => setOpen(true)}>Edit</button>
      <Drawer
        inspector
        open={open}
        onClose={() => { onClose?.(); setOpen(false) }}
        title="Edit question M001"
        initialFocusRef={first}
        dirty={dirty}
        footer={<button type="button">Save</button>}
      >
        <input ref={first} aria-label="Question text" />
      </Drawer>
    </div>
  )
}

function openHarness(props: React.ComponentProps<typeof Harness> = {}) {
  act(() => root.render(<Harness {...props} />))
  const opener = host.querySelector<HTMLButtonElement>('#opener')!
  opener.focus()
  act(() => opener.click())
  return opener
}

describe('Drawer inspector at xl and above', () => {
  it('renders as a non-modal pane in the page, not a portalled modal', () => {
    openHarness()
    const pane = host.querySelector('[data-inspector]')!
    expect(pane).toBeTruthy()
    expect(pane.tagName).toBe('ASIDE')
    expect(pane.getAttribute('aria-modal')).toBeNull()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.querySelector('.bg-scrim')).toBeNull()
    const label = document.getElementById(pane.getAttribute('aria-labelledby')!)
    expect(label?.textContent).toBe('Edit question M001')
  })

  it('leaves the page usable: no scroll lock and no focus trap', () => {
    openHarness()
    expect(document.body.style.overflow).toBe('')
    const save = host.querySelector<HTMLButtonElement>('[data-inspector] button[type="button"]:last-of-type')!
    save.focus()
    press('Tab')
    // Tab is not intercepted; the browser would move on to the page.
    expect(document.activeElement).toBe(save)
  })

  it('moves focus in on open, Escape closes, and focus returns to the opener', () => {
    const onClose = vi.fn()
    const opener = openHarness({ onClose })
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Question text')
    press('Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[data-inspector]')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('keeps the dirty guard: Escape asks first, and the prompt owns Escape', () => {
    const onClose = vi.fn()
    openHarness({ dirty: true, onClose })
    press('Escape')
    expect(onClose).not.toHaveBeenCalled()
    const prompt = document.querySelector('[role="alertdialog"]')!
    expect(prompt.textContent).toContain('Discard unsaved changes?')
    // Escape inside the prompt keeps editing; it does not also close the pane.
    press('Escape')
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(host.querySelector('[data-inspector]')).toBeTruthy()
  })
})

describe('Drawer inspector below xl', () => {
  beforeEach(() => { wide = false })
  afterEach(() => { wide = true })

  it('falls back to the modal Drawer: portalled, aria-modal, scrim, scroll lock', () => {
    openHarness()
    expect(host.querySelector('[data-inspector]')).toBeNull()
    const dialog = document.body.querySelector('[role="dialog"]')!
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(host.contains(dialog)).toBe(false)
    expect(document.querySelector('.bg-scrim')).toBeTruthy()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('keeps the focus trap: Tab wraps inside, Escape closes and restores focus', () => {
    const opener = openHarness()
    const dialog = document.body.querySelector('[role="dialog"]')!
    const save = Array.from(dialog.querySelectorAll('button')).pop()!
    save.focus()
    press('Tab')
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(save)
    press('Escape')
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
})

describe('server render', () => {
  it('renders the modal Drawer before the viewport is known (no hydration mismatch)', () => {
    const html = renderToStaticMarkup(<Drawer inspector open onClose={() => {}} title="T">b</Drawer>)
    expect(html).toContain('aria-modal="true"')
    expect(html).not.toContain('data-inspector')
  })
})

describe('QuestionEditDrawer', () => {
  it('opens as the inspector pane when asked, at xl', () => {
    const q = { question_id: 'M001', question_text: 'Which is prime?', options: ['12', '15', '13', '9'], correct_index: 2 }
    act(() => root.render(<QuestionEditDrawer inspector question={q} onClose={() => {}} />))
    const pane = host.querySelector('[data-inspector]')!
    expect(pane).toBeTruthy()
    expect(pane.querySelector('form')).toBeTruthy()
    expect(document.activeElement?.tagName).toBe('TEXTAREA')
  })
})
