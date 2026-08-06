import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'

import { GenerateExplanationsButton } from '../GenerateExplanationsButton'

describe('GenerateExplanationsButton', () => {
  it('renders the default label for flashcards', () => {
    const html = renderToStaticMarkup(
      React.createElement(GenerateExplanationsButton, { source: 'flashcards' }),
    )
    expect(html).toContain('Generate explanations')
  })

  it('renders a custom label when provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(GenerateExplanationsButton, { source: 'upcat_questions', label: '✨ Generate explanations for questions' }),
    )
    expect(html).toContain('Generate explanations for questions')
  })

  it('is not disabled in initial (non-pending) state', () => {
    const html = renderToStaticMarkup(
      React.createElement(GenerateExplanationsButton, { source: 'flashcards' }),
    )
    // Tailwind's disabled:opacity-60 class always contains the substring
    // "disabled" — assert the actual HTML attribute is absent, not the class.
    expect(html).not.toContain('disabled=""')
    expect(html).not.toContain(' disabled>')
  })
})
