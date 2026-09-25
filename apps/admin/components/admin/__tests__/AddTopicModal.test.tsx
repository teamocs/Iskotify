import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { AddTopicModal } from '../AddTopicModal'

describe('AddTopicModal', () => {
  it('renders the topic name input', () => {
    const html = renderToStaticMarkup(
      React.createElement(AddTopicModal, { subjectId: 'sub-1', onClose: vi.fn() })
    )
    expect(html).toContain('Topic name')
    expect(html).toContain('Add topic')
  })

  // A blank name is caught on submit with an inline error (validateTopicName),
  // so the submit stays enabled.
  it('submit is enabled in the initial empty state and the name is required', () => {
    const html = renderToStaticMarkup(
      React.createElement(AddTopicModal, { subjectId: 'sub-1', onClose: vi.fn() })
    )
    expect(html).toMatch(/<button type="submit"(?![^>]*disabled="")[^>]*>/)
    expect(html).toMatch(/<input[^>]*required=""/)
  })
})
