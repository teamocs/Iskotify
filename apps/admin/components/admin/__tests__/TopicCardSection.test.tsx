import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { TopicCardSection } from '../TopicCardSection'

const topic = {
  id: 't1',
  name: 'Philippine History',
  status: 'published' as const,
  cardCount: 7,
}

describe('TopicCardSection', () => {
  it('renders collapsed with topic name and card count in header', () => {
    const html = renderToStaticMarkup(
      React.createElement(TopicCardSection, {
        subjectId: 'sub-1',
        topic,
        defaultOpen: false,
      })
    )
    expect(html).toContain('Philippine History')
    expect(html).toContain('7 cards')
    // Collapsed: no table headers visible
    expect(html).not.toContain('Question')
  })

  it('renders open when defaultOpen is true, showing table headers', () => {
    const html = renderToStaticMarkup(
      React.createElement(TopicCardSection, {
        subjectId: 'sub-1',
        topic,
        defaultOpen: true,
      })
    )
    expect(html).toContain('Philippine History')
    // Open: desktop table headers visible
    expect(html).toContain('Question')
    expect(html).toContain('Answer')
  })
})
