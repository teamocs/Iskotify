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
    expect(html).toContain('Add Topic')
  })

  it('save button is disabled in initial empty state', () => {
    const html = renderToStaticMarkup(
      React.createElement(AddTopicModal, { subjectId: 'sub-1', onClose: vi.fn() })
    )
    expect(html).toContain('disabled')
  })
})
