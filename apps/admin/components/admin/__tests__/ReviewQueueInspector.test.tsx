// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/upcat/review-queue',
  useSearchParams: () => new URLSearchParams(''),
}))

import { ReviewQueueTable, type ReviewItem } from '../ReviewQueueTable'
import { INSPECTOR_QUERY } from '@/components/ui/useMediaQuery'
import { resetTrapStack } from '@/components/ui/trapStack'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const A: ReviewItem = {
  question_id: 'M001', question_text: 'Which is prime?', options: ['12', '15', '13', 'All of the above'],
  correct_index: 2, main_subject: 'Math', topic: 'Number theory', flags: ['none_or_all_of_above'],
}
const B: ReviewItem = {
  question_id: 'S002', question_text: 'Unit of force?', options: ['N', 'Joule', 'Watt', 'Pascal'],
  correct_index: 0, main_subject: 'Science', topic: 'Physics', flags: ['length_asymmetry'],
}

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  window.matchMedia = ((q: string) => ({
    matches: q === INSPECTOR_QUERY, media: q, addEventListener: () => {}, removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
  resetTrapStack()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  document.body.innerHTML = ''
})

const show = (items: ReviewItem[]) => act(() => root.render(<ReviewQueueTable items={items} dismissals={[]} />))
const edit = (id: string) => {
  const btn = host.querySelector<HTMLButtonElement>(`button[aria-label="Edit question ${id}"]`)!
  act(() => btn.click())
  return btn
}
const pane = () => host.querySelector('[data-inspector]')
const paneTitle = () => pane()?.querySelector('h2')?.textContent
const textarea = () => pane()!.querySelector('textarea')!
function type(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  act(() => { setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })) })
}
const prompt = () => document.querySelector('[role="alertdialog"]')
const promptButton = (name: string) => Array.from(prompt()!.querySelectorAll('button')).find(b => b.textContent === name)!

describe('review queue inspector: switching rows', () => {
  it('switches immediately when the editor is clean', () => {
    show([A, B])
    edit('M001')
    expect(paneTitle()).toBe('Edit question M001')
    edit('S002')
    expect(prompt()).toBeNull()
    expect(paneTitle()).toBe('Edit question S002')
  })

  it('asks before throwing away unsaved edits, with Keep editing focused', () => {
    show([A, B])
    edit('M001')
    type(textarea(), 'Which number is prime?')
    edit('S002')
    expect(prompt()?.textContent).toContain('Discard unsaved changes?')
    expect(document.activeElement?.textContent).toBe('Keep editing')
    expect(paneTitle()).toBe('Edit question M001')
  })

  it('Keep editing preserves the draft on the same question', () => {
    show([A, B])
    edit('M001')
    type(textarea(), 'Which number is prime?')
    edit('S002')
    act(() => promptButton('Keep editing').click())
    expect(prompt()).toBeNull()
    expect(paneTitle()).toBe('Edit question M001')
    expect(textarea().value).toBe('Which number is prime?')
  })

  it('Discard changes switches to the other question', () => {
    show([A, B])
    edit('M001')
    type(textarea(), 'Which number is prime?')
    edit('S002')
    act(() => promptButton('Discard changes').click())
    expect(prompt()).toBeNull()
    expect(paneTitle()).toBe('Edit question S002')
    expect(textarea().value).toBe('Unit of force?')
  })
})

describe('review queue inspector: after a refresh', () => {
  it('re-syncs a clean editor to the refreshed question', () => {
    show([A, B])
    edit('M001')
    show([{ ...A, question_text: 'Which of these is prime?' }, B])
    expect(paneTitle()).toBe('Edit question M001')
    expect(textarea().value).toBe('Which of these is prime?')
  })

  it('keeps a dirty draft when the question refreshes underneath it', () => {
    show([A, B])
    edit('M001')
    type(textarea(), 'My rewrite')
    show([{ ...A, question_text: 'Which of these is prime?' }, B])
    expect(textarea().value).toBe('My rewrite')
  })

  it('closes the editor when its question is no longer in the queue', () => {
    show([A, B])
    edit('M001')
    show([B])
    expect(pane()).toBeNull()
  })
})

describe('review queue inspector: focus', () => {
  it('returns focus to the row button that opened it, even if the click did not focus it (Safari)', () => {
    show([A, B])
    const opener = edit('M001')
    // Safari does not focus a clicked button: focus is still on <body>.
    expect(document.activeElement).not.toBe(opener)
    const close = Array.from(pane()!.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === 'Close')!
    act(() => close.click())
    expect(pane()).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
})
