import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock('@/components/admin/Topbar', () => ({
  Topbar: ({ title, actions }: { title: string; actions?: React.ReactNode }) => <header><h1>{title}</h1>{actions}</header>,
}))

import NewFlashcardsPage from '../page'

const html = () => renderToStaticMarkup(<NewFlashcardsPage />)

describe('NewFlashcardsPage', () => {
  it('has exactly one h1, from the Topbar, and section headings as h2', () => {
    const out = html()
    expect((out.match(/<h1/g) ?? []).length).toBe(1)
    expect(out).toMatch(/<h2[^>]*>Subject and topic<\/h2>/)
    expect(out).toMatch(/<h2[^>]*>Generate with AI<\/h2>/)
    expect(out).toMatch(/<h2[^>]*>Flashcards<\/h2>/)
  })

  it('is a real form so Enter submits, with a submit button', () => {
    const out = html()
    expect(out).toMatch(/<form[^>]*novalidate/i)
    expect(out).toMatch(/<button[^>]*type="submit"[^>]*>Save to Knowledge base/)
  })

  it('wires every input to a visible label and marks required fields', () => {
    const out = html()
    for (const label of ['Subject', 'Topic', 'Question', 'Answer', 'Explanation', 'Format instructions', 'Sample questions to imitate']) {
      const m = out.match(new RegExp(`<label for="([^"]+)"[^>]*>${label}(<|\\s)`))
      expect(m, `label ${label}`).not.toBeNull()
      expect(out).toContain(`id="${m![1]}"`)
    }
    expect(out).toMatch(/<input[^>]*required=""[^>]*placeholder="e.g. Science"/)
    expect((out.match(/aria-hidden="true" class="ml-0.5 text-danger">\*/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })

  it('has a Cancel link back to the Knowledge base', () => {
    expect(html()).toMatch(/<a href="\/admin\/flashcards"[^>]*>Cancel<\/a>/)
  })

  it('uses no emoji or ALL-CAPS labels', () => {
    const out = html()
    expect(out).not.toContain('✨')
    expect(out).not.toMatch(/>SUBJECT<|>QUESTION<|>CARD 1</)
  })
})
