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

const listings = [
  { id: 'l1', slug: 'dost-sei', title: 'DOST-SEI', provider: 'DOST', type: 'scholarship' as const },
  { id: 'l2', slug: 'cse', title: 'CSE', provider: 'CSC', type: 'exam' as const },
]

const subjects = [
  {
    id: 'sub1',
    name: 'Mathematics',
    listing_slugs: ['dost-sei'],
    topics: [{ id: 't1', flashcards: [{ id: 'c1' }, { id: 'c2' }] }],
    totalCards: 2,
    overallStatus: 'published',
  },
  {
    id: 'sub2',
    name: 'Science',
    listing_slugs: [],
    topics: [],
    totalCards: 0,
    overallStatus: 'draft',
  },
]

describe('SubjectsView', () => {
  it('renders a row for each subject', () => {
    const html = renderToStaticMarkup(
      React.createElement(SubjectsView, { subjects, listings })
    )
    expect(html).toContain('Mathematics')
    expect(html).toContain('Science')
  })

  it('renders listing pills for linked subjects', () => {
    const html = renderToStaticMarkup(
      React.createElement(SubjectsView, { subjects, listings })
    )
    expect(html).toContain('DOST-SEI')
  })

  // The subject name is now the link that opens it (was a separate "View").
  it('renders an open link plus labelled Edit and Delete actions for each subject', () => {
    const html = renderToStaticMarkup(
      React.createElement(SubjectsView, { subjects, listings })
    )
    expect(html).toContain('href="/admin/flashcards/subjects/sub1"')
    expect(html).toContain('href="/admin/flashcards/subjects/sub2"')
    expect(html).toContain('aria-label="Edit Science"')
    expect(html).toContain('aria-label="Delete Science"')
  })

  it('renders empty state when subjects array is empty', () => {
    const html = renderToStaticMarkup(
      React.createElement(SubjectsView, { subjects: [], listings })
    )
    expect(html).toContain('No subjects yet')
  })
})
