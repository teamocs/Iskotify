import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NAV_GROUPS } from '@/lib/nav/adminNav'

let subjectsError: { message: string } | null = null
let listingsError: { message: string } | null = null

vi.mock('@iskotify/utils', () => ({
  createServerClient: () => ({
    from: (table: string) => ({
      select: () => {
        if (table === 'flashcard_subjects') {
          return {
            order: () => Promise.resolve(subjectsError
              ? { data: null, error: subjectsError }
              : { data: [{ id: 'sub1', name: 'Mathematics', listing_slugs: [], flashcard_topics: [] }], error: null }),
          }
        }
        return {
          in: () => ({ order: () => ({ order: () => Promise.resolve(listingsError ? { data: null, error: listingsError } : { data: [], error: null }) }) }),
        }
      },
    }),
  }),
}))

vi.mock('@/components/admin/Topbar', () => ({
  Topbar: ({ title, actions }: { title: string; actions?: React.ReactNode }) => <header><h1>{title}</h1>{actions}</header>,
}))
vi.mock('@/components/admin/SubjectsView', () => ({ SubjectsView: () => <div data-testid="subjects-view" /> }))
vi.mock('@/components/admin/GenerateExplanationsButton', () => ({
  GenerateExplanationsButton: ({ label }: { label?: string }) => <button>{label}</button>,
}))
vi.mock('@/components/admin/RegenerateDistractorsPanel', () => ({ RegenerateDistractorsPanel: () => <div /> }))

const navLabel = NAV_GROUPS.flatMap(g => g.items).find(i => i.href === '/admin/flashcards')!.label

async function render() {
  const { default: Page } = await import('../page')
  return renderToStaticMarkup((await Page()) as React.ReactElement)
}

describe('Knowledge base page structure', () => {
  beforeEach(() => { subjectsError = null; listingsError = null; vi.resetModules() })

  it('titles the page with the sidebar label, once', async () => {
    const html = await render()
    expect(html).toContain(`<h1>${navLabel}</h1>`)
    expect(html.match(/<h[12][^>]*>[^<]*Knowledge/gi)?.length).toBe(1)
  })

  it('drops emoji from the explanations action', async () => {
    const html = await render()
    expect(html).not.toContain('✨')
  })

  it('shows an error banner instead of an empty list when subjects fail to load', async () => {
    subjectsError = { message: 'permission denied' }
    const html = await render()
    expect(html).toContain('role="alert"')
    expect(html).toContain('permission denied')
    expect(html).not.toContain('subjects-view')
  })

  it('shows an error banner when listings fail to load', async () => {
    listingsError = { message: 'listings timeout' }
    const html = await render()
    expect(html).toContain('role="alert"')
    expect(html).toContain('listings timeout')
  })
})
