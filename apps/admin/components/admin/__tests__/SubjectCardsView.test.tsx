import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { SubjectCardsView } from '../SubjectCardsView'

const topics = [
  { id: 't1', name: 'Philippine History', status: 'published' as const, cardCount: 5 },
  { id: 't2', name: 'World Events', status: 'draft' as const, cardCount: 3 },
]

describe('SubjectCardsView', () => {
  it('renders a section for each topic', () => {
    const html = renderToStaticMarkup(
      React.createElement(SubjectCardsView, {
        subjectId: 'sub-1',
        subjectName: 'Test Subject',
        topics,
        defaultOpenTopicId: undefined,
      })
    )
    expect(html).toContain('Philippine History')
    expect(html).toContain('World Events')
  })

  it('shows empty state message when topics array is empty', () => {
    const html = renderToStaticMarkup(
      React.createElement(SubjectCardsView, {
        subjectId: 'sub-1',
        subjectName: 'Test Subject',
        topics: [],
        defaultOpenTopicId: undefined,
      })
    )
    expect(html).toContain('No topics')
  })
})
