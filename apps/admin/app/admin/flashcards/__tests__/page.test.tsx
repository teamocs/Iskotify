import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// --- mocks ---

vi.mock('@iskotify/utils', () => ({
  createServerClient: () => ({
    from: (table: string) => ({
      select: (_cols: string) => {
        if (table === 'flashcard_subjects') {
          return {
            order: () => ({
              data: [
                {
                  id: 'sub1',
                  name: 'Mathematics',
                  listing_slugs: [],
                  flashcard_topics: [
                    { id: 't1', status: 'published', flashcards: [{ id: 'c1' }] },
                  ],
                },
              ],
              error: null,
            }),
          }
        }
        // listings
        return {
          in: () => ({
            order: () => ({
              order: () => ({
                data: [
                  { id: 'l1', slug: 'dost-sei', title: 'DOST-SEI', provider: 'DOST', type: 'scholarship' },
                ],
                error: null,
              }),
            }),
          }),
        }
      },
    }),
  }),
}))

vi.mock('@/components/admin/Topbar', () => ({
  Topbar: ({ title }: { title: string }) => <div data-testid="topbar">{title}</div>,
}))

vi.mock('@/components/admin/SubjectsView', () => ({
  SubjectsView: ({ subjects, listings }: { subjects: { name: string }[]; listings: { slug: string }[] }) => (
    <div data-testid="subjects-view">
      {subjects.map(s => <span key={s.name}>{s.name}</span>)}
      {listings.map(l => <span key={l.slug}>{l.slug}</span>)}
    </div>
  ),
}))

// --- tests ---

describe('FlashcardsPage', () => {
  beforeEach(() => vi.resetModules())

  it('renders SubjectsView', async () => {
    const { default: Page } = await import('../page')
    const element = await Page()
    const html = renderToStaticMarkup(element as React.ReactElement)
    expect(html).toContain('subjects-view')
  })

  it('passes subjects data to SubjectsView', async () => {
    const { default: Page } = await import('../page')
    const element = await Page()
    const html = renderToStaticMarkup(element as React.ReactElement)
    expect(html).toContain('Mathematics')
  })

  it('passes listings data to SubjectsView', async () => {
    const { default: Page } = await import('../page')
    const element = await Page()
    const html = renderToStaticMarkup(element as React.ReactElement)
    expect(html).toContain('dost-sei')
  })
})
