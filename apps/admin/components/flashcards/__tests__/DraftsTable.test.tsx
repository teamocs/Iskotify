import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/admin/flashcards/drafts',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))

import { DraftsTable, DraftsTableView, type Draft } from '../DraftsTable'

const drafts: Draft[] = [
  { topic_id: 't1', topic_name: 'Cell Biology', subject_id: 's1', subject_name: 'Science', source_type: 'csv', created_at: '2026-09-20T10:00:00Z', total_cards: 10, cards_with_options: 10, cards_enhanced: 0, cards_needing_enhancement: 0 },
  { topic_id: 't2', topic_name: 'Fractions', subject_id: 's2', subject_name: 'Math', source_type: 'ai', created_at: '2026-09-21T10:00:00Z', total_cards: 4, cards_with_options: 1, cards_enhanced: 0, cards_needing_enhancement: 3 },
]

const view = (p: Partial<React.ComponentProps<typeof DraftsTableView>> = {}) => renderToStaticMarkup(
  <DraftsTableView drafts={drafts} error={null} selected={[]} onSelectedChange={() => {}} onPublishSelected={() => {}} onRetry={() => {}} {...p} />,
)

describe('DraftsTableView', () => {
  it('is a DataTable with human column labels', () => {
    const out = view()
    expect(out).toMatch(/<caption[^>]*>Drafts<\/caption>/)
    for (const h of ['Topic', 'Subject', 'Cards', 'Distractors', 'Source', 'Imported']) expect(out).toContain(`${h}<`)
    expect(out).not.toContain('uppercase')
    expect(out).not.toContain('created_at')
  })

  it('links each topic to its review page from the first cell', () => {
    expect(view()).toMatch(/<a href="\/admin\/flashcards\/review\/t1"[^>]*>Cell Biology<\/a>/)
  })

  it('labels the source with a Badge in words, not raw palette colours', () => {
    const out = view()
    expect(out).toMatch(/data-tone="info"[^>]*>CSV</)
    expect(out).toMatch(/data-tone="brand"[^>]*>AI</)
    expect(out).not.toMatch(/purple|gray-/)
  })

  it('shows complete distractors without a check glyph, and progress as a progressbar', () => {
    const out = view()
    expect(out).not.toContain('✓')
    expect(out).toMatch(/Complete/)
    expect(out).toMatch(/role="progressbar"[^>]*aria-valuenow="1"|aria-valuenow="1"[^>]*role="progressbar"/)
  })

  it('offers search and source / distractor filters', () => {
    const out = view()
    expect(out).toContain('type="search"')
    expect(out).toMatch(/<label[^>]*>Source<\/label>/)
    expect(out).toMatch(/<label[^>]*>Distractors<\/label>/)
  })

  it('shows a bulk "Publish N drafts" action once rows are selected', () => {
    expect(view()).not.toContain('Publish 2 drafts')
    const out = view({ selected: ['t1', 't2'] })
    expect(out).toContain('2 selected')
    expect(out).toMatch(/<button[^>]*>Publish 2 drafts<\/button>/)
  })

  it('renders an ErrorBanner with retry instead of an empty table when loading fails', () => {
    const out = view({ drafts: null, error: 'boom' })
    expect(out).toContain('role="alert"')
    expect(out).toContain('boom')
    expect(out).toContain('Try again')
    expect(out).not.toContain('<table')
  })

  it('shows a skeleton while loading', () => {
    expect(view({ drafts: null })).toMatch(/aria-busy="true"/)
  })

  it('explains the empty state and how drafts get here', () => {
    const out = view({ drafts: [] })
    expect(out).toContain('No drafts to publish')
    expect(out).toMatch(/Import a CSV/)
  })
})

describe('DraftsTable', () => {
  it('starts in the loading state', () => {
    expect(renderToStaticMarkup(<DraftsTable />)).toMatch(/aria-busy="true"/)
  })
})
