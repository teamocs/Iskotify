import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/admin/Topbar', () => ({
  Topbar: ({ title, actions }: { title: string; actions?: React.ReactNode }) => <div data-testid="topbar">{title}{actions}</div>,
}))

import QuestionBankImportPage from '../page'

describe('QuestionBankImportPage', () => {
  it('renders no h1 in the body and no h2 repeating the title', () => {
    const html = renderToStaticMarkup(<QuestionBankImportPage />)
    expect(html).not.toContain('<h1')
    expect(html).not.toMatch(/<h2[^>]*>Import the Question Bank<\/h2>/)
  })

  it('offers explanation generation as a Topbar action without emoji', () => {
    const html = renderToStaticMarkup(<QuestionBankImportPage />)
    expect(html).toContain('Generate explanations for questions')
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
