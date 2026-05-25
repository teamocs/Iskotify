import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { AddCardModal } from '../AddCardModal'

describe('AddCardModal', () => {
  it('renders question, answer, and explanation fields', () => {
    const html = renderToStaticMarkup(
      React.createElement(AddCardModal, { topicId: 'topic-1', topicStatus: 'published', onClose: vi.fn() })
    )
    expect(html).toContain('Question')
    expect(html).toContain('Answer')
    expect(html).toContain('Explanation')
  })

  it('save button is disabled in initial empty state', () => {
    const html = renderToStaticMarkup(
      React.createElement(AddCardModal, { topicId: 'topic-1', topicStatus: 'published', onClose: vi.fn() })
    )
    expect(html).toContain('disabled')
  })

  it('renders "Add Card" title', () => {
    const html = renderToStaticMarkup(
      React.createElement(AddCardModal, { topicId: 'topic-1', topicStatus: 'published', onClose: vi.fn() })
    )
    expect(html).toContain('Add Card')
  })
})
