import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'

import { RegenerateDistractorsPanel } from '../RegenerateDistractorsPanel'

const subjects = [
  { id: 's1', name: 'Mathematics', topics: [{ id: 't1', name: 'Algebra' }, { id: 't2', name: 'Geometry' }] },
  { id: 's2', name: 'Biology', topics: [{ id: 't3', name: 'Cell Biology' }] },
]

describe('RegenerateDistractorsPanel', () => {
  it('renders the "hard mode" label', () => {
    const html = renderToStaticMarkup(React.createElement(RegenerateDistractorsPanel, { subjects }))
    expect(html).toContain('Regenerate distractors (hard mode)')
  })

  it('lists every subject as a select option', () => {
    const html = renderToStaticMarkup(React.createElement(RegenerateDistractorsPanel, { subjects }))
    expect(html).toContain('Mathematics')
    expect(html).toContain('Biology')
  })

  it('renders both scope options (ai-enhanced-only and all)', () => {
    const html = renderToStaticMarkup(React.createElement(RegenerateDistractorsPanel, { subjects }))
    expect(html).toContain('Only already AI-enhanced cards')
    expect(html).toContain('All cards in scope')
  })

  it('renders the Run button, not disabled in the initial (non-pending) state', () => {
    const html = renderToStaticMarkup(React.createElement(RegenerateDistractorsPanel, { subjects }))
    // The topic <select> is legitimately disabled until a subject is chosen —
    // so assert on the Run <button> element specifically, not the whole page.
    const buttonMatch = html.match(/<button\b[^>]*>Run<\/button>/)
    expect(buttonMatch).not.toBeNull()
    // Tailwind's disabled:opacity-60 class always contains the substring
    // "disabled" — assert the actual HTML attribute is absent, not the class.
    expect(buttonMatch![0]).not.toContain('disabled=""')
    expect(buttonMatch![0]).not.toContain(' disabled>')
  })

  it('handles an empty subjects list without crashing', () => {
    const html = renderToStaticMarkup(React.createElement(RegenerateDistractorsPanel, { subjects: [] }))
    expect(html).toContain('All subjects')
  })
})
