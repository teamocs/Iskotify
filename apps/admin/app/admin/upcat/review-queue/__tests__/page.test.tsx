import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/admin/Topbar', () => ({
  Topbar: ({ title }: { title: string }) => <div data-testid="topbar">{title}</div>,
}))

let queuedRows: unknown[] = []

vi.mock('@iskotify/utils', () => ({
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        order: () => ({
          limit: () => Promise.resolve({ data: queuedRows, error: null }),
        }),
      }),
    }),
  }),
}))

describe('ReviewQueuePage', () => {
  it('lists a question whose options fail a heuristic and omits a clean one', async () => {
    queuedRows = [
      {
        question_id: 'Q1', question_text: 'Clean question?',
        options: ['Alpha', 'Beta', 'Gamma', 'Delta'], correct_index: 0,
        main_subject: 'Math', topic: 'Algebra', subtest: 'Math', status: 'published',
      },
      {
        question_id: 'Q2', question_text: 'Flagged question?',
        options: ['12', '15', '13', 'All of the above'], correct_index: 0,
        main_subject: 'Math', topic: 'Algebra', subtest: 'Math', status: 'published',
      },
    ]
    const { default: Page } = await import('../page')
    const element = await Page()
    const html = renderToStaticMarkup(element as React.ReactElement)
    expect(html).toContain('Q2')
    expect(html).not.toContain('Q1')
    expect(html).toContain('Flagged question?')
  })

  it('shows the matching flag label for the failing rule', async () => {
    queuedRows = [{
      question_id: 'Q2', question_text: 'Flagged question?',
      options: ['12', '15', '13', 'All of the above'], correct_index: 0,
      main_subject: 'Math', topic: 'Algebra', subtest: 'Math', status: 'published',
    }]
    const { default: Page } = await import('../page')
    const element = await Page()
    const html = renderToStaticMarkup(element as React.ReactElement)
    expect(html).toMatch(/none\/all of the above/i)
  })

  it('shows the flagged/scanned summary counts', async () => {
    queuedRows = [
      {
        question_id: 'Q1', question_text: 'Clean question?',
        options: ['Alpha', 'Beta', 'Gamma', 'Delta'], correct_index: 0,
        main_subject: 'Math', topic: 'Algebra', subtest: 'Math', status: 'published',
      },
      {
        question_id: 'Q2', question_text: 'Flagged question?',
        options: ['12', '15', '13', 'All of the above'], correct_index: 0,
        main_subject: 'Math', topic: 'Algebra', subtest: 'Math', status: 'published',
      },
    ]
    const { default: Page } = await import('../page')
    const element = await Page()
    const html = renderToStaticMarkup(element as React.ReactElement)
    expect(html).toContain('1 flagged out of 2 scanned')
  })

  it('renders a friendly empty state when nothing is flagged', async () => {
    queuedRows = [{
      question_id: 'Q1', question_text: 'Clean question?',
      options: ['Alpha', 'Beta', 'Gamma', 'Delta'], correct_index: 0,
      main_subject: 'Math', topic: 'Algebra', subtest: 'Math', status: 'published',
    }]
    const { default: Page } = await import('../page')
    const element = await Page()
    const html = renderToStaticMarkup(element as React.ReactElement)
    expect(html).toContain('No flagged questions')
  })
})
