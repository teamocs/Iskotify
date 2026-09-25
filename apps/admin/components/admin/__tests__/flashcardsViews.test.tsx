import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/flashcards',
  useSearchParams: () => new URLSearchParams(''),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement('a', { href, className }, children),
}))

import { SubjectsView } from '../SubjectsView'
import { TopicCardSection } from '../TopicCardSection'
import { SubjectCardsView } from '../SubjectCardsView'
import { AddTopicButton } from '../AddTopicButton'

const listings = [{ id: 'l1', slug: 'dost-sei', title: 'DOST-SEI', provider: 'DOST', type: 'scholarship' as const }]
const subjects = [
  { id: 'sub1', name: 'Mathematics', listing_slugs: ['dost-sei'], topics: [{ id: 't1', flashcards: [{ id: 'c1' }] }], totalCards: 1, overallStatus: 'published' },
  { id: 'sub2', name: 'Science', listing_slugs: [], topics: [], totalCards: 0, overallStatus: 'draft' },
]

describe('SubjectsView table', () => {
  const html = renderToStaticMarkup(<SubjectsView subjects={subjects} listings={listings} />)

  it('uses human column headers, not uppercase 10px labels', () => {
    for (const h of ['Subject', 'Topics', 'Cards', 'Status']) expect(html).toMatch(new RegExp(`<th[^>]*>(<[^>]+>)*${h}`))
    expect(html).not.toContain('text-[10px]')
    expect(html).not.toContain('uppercase')
  })

  it('opens a subject from its name and labels row actions by subject', () => {
    expect(html).toMatch(/<a href="\/admin\/flashcards\/subjects\/sub1"[^>]*>Mathematics<\/a>/)
    expect(html).toContain('aria-label="Edit Mathematics"')
    expect(html).toContain('aria-label="Delete Mathematics"')
  })

  it('shows status as text badges', () => {
    expect(html).toMatch(/data-tone="success"[^>]*>Published</)
    expect(html).toMatch(/data-tone="warning"[^>]*>Draft</)
  })

  it('has exactly one primary action', () => {
    expect(html.match(/bg-maroon text-ink-inverse/g)?.length).toBe(1)
    expect(html).toContain('New subject')
  })
})

describe('TopicCardSection', () => {
  const topic = { id: 't1', name: 'Philippine History', status: 'published' as const, cardCount: 7 }

  it('is a labelled disclosure whose state is announced', () => {
    const html = renderToStaticMarkup(<TopicCardSection subjectId="s" subjectName="S" topic={topic} defaultOpen={false} />)
    expect(html).toMatch(/<h2[^>]*><button[^>]*aria-expanded="false"/)
    expect(html).toContain('aria-label="Rename Philippine History"')
    expect(html).toContain('aria-label="Delete Philippine History"')
  })

  it('open: offers Add card and Generate as secondary actions without emoji', () => {
    const html = renderToStaticMarkup(<TopicCardSection subjectId="s" subjectName="S" topic={topic} defaultOpen />)
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('Add card')
    expect(html).toContain('Generate with AI')
    expect(html).not.toMatch(/✨|›/)
    expect(html).not.toContain('bg-maroon text-ink-inverse')
  })
})

describe('SubjectCardsView empty state', () => {
  it('says what goes here and how to add it, without quoting a stale button label', () => {
    const html = renderToStaticMarkup(<SubjectCardsView subjectId="s" subjectName="S" topics={[]} />)
    expect(html).toContain('No topics yet')
    expect(html).not.toContain('&quot;+ Add Topic&quot;')
  })
})

describe('AddTopicButton', () => {
  it('is the primary Button with a plus icon', () => {
    const html = renderToStaticMarkup(<AddTopicButton subjectId="s" />)
    expect(html).toContain('bg-maroon text-ink-inverse')
    expect(html).toContain('Add topic')
    expect(html).not.toContain('+ Add Topic')
  })
})
