import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock('@/components/admin/Topbar', () => ({
  Topbar: ({ title, actions }: { title: string; actions?: React.ReactNode }) => <header><h1>{title}</h1>{actions}</header>,
}))
vi.mock('@/components/flashcards/DraftsTable', () => ({ DraftsTable: () => <div data-testid="drafts-table" /> }))

import DraftsPage from '../page'

describe('DraftsPage', () => {
  it('has one h1 from the Topbar and no repeated title in the body', () => {
    const out = renderToStaticMarkup(<DraftsPage />)
    expect((out.match(/<h1/g) ?? []).length).toBe(1)
    expect(out).not.toMatch(/<h2/)
    expect(out).toContain('drafts-table')
  })

  it('puts Import CSV in the Topbar actions as a link to the question bank importer', () => {
    expect(renderToStaticMarkup(<DraftsPage />)).toMatch(/<header>[\s\S]*<a href="\/admin\/upcat\/import"[^>]*>[\s\S]*Import CSV[\s\S]*<\/header>/)
  })
})
