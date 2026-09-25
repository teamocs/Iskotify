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

  // Empty fields are caught on submit with an error next to each field
  // (validateCard, see flashcardDialogs.test.tsx), so the submit stays enabled.
  it('submit is enabled in the initial empty state and blank fields are required', () => {
    const html = renderToStaticMarkup(
      React.createElement(AddCardModal, { topicId: 'topic-1', topicStatus: 'published', onClose: vi.fn() })
    )
    expect(html).toMatch(/<button type="submit"(?![^>]*disabled="")[^>]*>/)
    expect(html.match(/<textarea[^>]*required=""/g)?.length).toBe(2)
  })

  it('renders "Add card" title', () => {
    const html = renderToStaticMarkup(
      React.createElement(AddCardModal, { topicId: 'topic-1', topicStatus: 'published', onClose: vi.fn() })
    )
    expect(html).toContain('Add card')
  })
})
