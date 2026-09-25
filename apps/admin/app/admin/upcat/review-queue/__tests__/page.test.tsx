import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { optionsFingerprint } from '@/lib/admin/reviewQueue'

vi.mock('@/components/admin/Topbar', () => ({
  Topbar: ({ title }: { title: string }) => <div data-testid="topbar">{title}</div>,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/upcat/review-queue',
  useSearchParams: () => new URLSearchParams(''),
}))

let queuedRows: unknown[] = []
let queuedError: { message: string } | null = null

let queuedDismissals: unknown[] = []
let dismissalsError: { message: string } | null = null

vi.mock('@iskotify/utils', () => ({
  createServerClient: () => ({
    from: (table: string) => table === 'question_flag_dismissals'
      ? {
          select: () => Promise.resolve({ data: dismissalsError ? null : queuedDismissals, error: dismissalsError }),
        }
      : {
          select: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: queuedError ? null : queuedRows, error: queuedError }),
            }),
          }),
        },
  }),
}))

describe('ReviewQueuePage', () => {
  beforeEach(() => { queuedError = null; queuedDismissals = []; dismissalsError = null })

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

  it('does not repeat the page title as a heading (the Topbar owns the h1)', async () => {
    queuedRows = [{
      question_id: 'Q2', question_text: 'Flagged question?',
      options: ['12', '15', '13', 'All of the above'], correct_index: 0,
      main_subject: 'Math', topic: 'Algebra', subtest: 'Math', status: 'published',
    }]
    const { default: Page } = await import('../page')
    const html = renderToStaticMarkup((await Page()) as React.ReactElement)
    expect(html).not.toMatch(/<h[12][^>]*>Distractor Review Queue/)
    expect(html).toContain('None/All of the above')
    expect(html).toContain('(correct answer)')
  })

  it('shows an error banner instead of an empty queue when the query fails', async () => {
    queuedError = { message: 'permission denied for table upcat_questions' }
    const { default: Page } = await import('../page')
    const html = renderToStaticMarkup((await Page()) as React.ReactElement)
    expect(html).toContain('role="alert"')
    expect(html).toContain('permission denied for table upcat_questions')
    expect(html).not.toContain('No flagged questions')
  })

  const flaggedRow = {
    question_id: 'Q2', question_text: 'Flagged question?',
    options: ['12', '15', '13', 'All of the above'], correct_index: 0,
    main_subject: 'Math', topic: 'Algebra', subtest: 'Math', status: 'published',
  }

  it('hides a question dismissed by anyone on the team (server dismissals)', async () => {
    queuedRows = [flaggedRow]
    queuedDismissals = [{ question_id: 'Q2', options_fingerprint: optionsFingerprint(flaggedRow.options) }]
    const { default: Page } = await import('../page')
    const html = renderToStaticMarkup((await Page()) as React.ReactElement)
    expect(html).not.toContain('Flagged question?')
    expect(html).toMatch(/Show dismissed \(1\)/)
  })

  it('keeps showing the queue with an error banner when dismissals fail to load', async () => {
    queuedRows = [flaggedRow]
    dismissalsError = { message: 'relation "question_flag_dismissals" does not exist' }
    const { default: Page } = await import('../page')
    const html = renderToStaticMarkup((await Page()) as React.ReactElement)
    expect(html).toContain('role="alert"')
    expect(html).toContain('question_flag_dismissals')
    expect(html).toContain('Flagged question?')
  })
})
