import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

let search = ''
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => '/admin/reports',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))

import { ReportsManager, ReportsView, QuestionEditorDrawer, type QuestionReport } from '../ReportsManager'

const noop = () => {}
const report = (over: Partial<QuestionReport>): QuestionReport => ({
  id: 'r1',
  question_id: 'q1',
  source_table: 'flashcards',
  question_text: 'What is the capital of Camarines Sur?',
  reason: 'Wrong answer',
  user_id: null,
  status: 'new',
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  ...over,
})
const rows = [
  report({}),
  report({ id: 'r2', question_id: 'UP-12', source_table: 'upcat_questions', question_text: 'Solve for x', reason: 'Typo or formatting issue', status: 'reviewed' }),
]

const view = (props: Partial<React.ComponentProps<typeof ReportsView>> = {}) =>
  renderToStaticMarkup(
    <ReportsView
      rows={rows}
      loading={false}
      error=""
      selected={[]}
      onSelectedChange={noop}
      bulkBusy={false}
      onBulk={noop}
      onRetry={noop}
      onEdit={noop}
      onSetStatus={noop}
      onDelete={noop}
      {...props}
    />,
  )

beforeEach(() => { search = '' })

describe('ReportsView table', () => {
  it('uses human column labels, never database column names', () => {
    const html = view()
    for (const h of ['Question', 'Source', 'Reason', 'Status', 'Reported']) expect(html).toContain(`>${h}<`)
    expect(html).not.toContain('created_at')
    expect(html).not.toContain('source_table')
  })

  it('shows sources and statuses as labelled badges', () => {
    const html = view()
    expect(html).toContain('>Flashcard<')
    expect(html).toContain('>UPCAT<')
    expect(html).toContain('>New<')
    expect(html).toContain('>Reviewed<')
  })

  it('offers status, reason and source filters', () => {
    const html = view()
    expect(html).toMatch(/<label[^>]*>Status<\/label>/)
    expect(html).toMatch(/<label[^>]*>Reason<\/label>/)
    expect(html).toMatch(/<label[^>]*>Source<\/label>/)
    expect(html).toContain('Wrong answer')
  })

  it('filters by status from the URL', () => {
    search = 'status=reviewed'
    const html = view()
    expect(html).toContain('Solve for x')
    expect(html).not.toContain('capital of Camarines Sur')
  })

  it('makes the question text the row’s primary action and labels row actions', () => {
    const html = view()
    expect(html).toMatch(/<button[^>]*>What is the capital of Camarines Sur\?<\/button>/)
    expect(html).toContain('aria-label="Edit question: What is the capital of Camarines Sur?"')
    expect(html).toContain('aria-label="Delete report: What is the capital of Camarines Sur?"')
  })

  it('renders an error banner instead of an empty table when loading fails', () => {
    const html = view({ rows: [], error: 'Database error' })
    expect(html).toContain('role="alert"')
    expect(html).toContain('Couldn’t load reported questions')
    expect(html).toContain('Database error')
    expect(html).toContain('Try again')
    expect(html).not.toContain('<table')
  })

  it('says what would be here when there are no reports', () => {
    const html = view({ rows: [] })
    expect(html).toContain('No reported questions')
  })
})

describe('ReportsView bulk status change', () => {
  it('has no bulk bar while nothing is selected', () => {
    expect(view()).not.toContain('aria-label="Bulk actions"')
  })

  it('shows the count and one action per target status once rows are selected', () => {
    const html = view({ selected: ['r1', 'r2'] })
    expect(html).toContain('aria-label="Bulk actions"')
    expect(html).toContain('2 selected')
    expect(html).toContain('Mark new')
    expect(html).toContain('Mark reviewed')
    expect(html).toContain('Mark resolved')
  })

  it('names each row checkbox', () => {
    expect(view()).toContain('aria-label="Select What is the capital of Camarines Sur?"')
  })
})

describe('ReportsManager page body', () => {
  it('does not repeat the page title (the Topbar owns the one h1)', () => {
    const html = renderToStaticMarkup(<ReportsManager />)
    expect(html).not.toMatch(/<h[12][^>]*>Reported questions<\/h[12]>/)
    expect(html).not.toContain('<h1')
  })
})

describe('QuestionEditorDrawer', () => {
  const labelledControl = (html: string, label: string) => {
    const m = html.match(new RegExp(`<label for="([^"]+)"[^>]*>${label}(<span[^>]*>\\*</span>)?</label>`))
    expect(m, `label ${label}`).not.toBeNull()
    expect(html).toMatch(new RegExp(`id="${m![1]}"`))
    return m!
  }

  it('is a real form with wired, required-marked flashcard fields', () => {
    const html = renderToStaticMarkup(
      <QuestionEditorDrawer
        report={report({})}
        onClose={noop}
        onResolved={noop}
        initialQuestion={{ id: 'q1', question: 'Q?', answer: 'A', explanation: '' }}
      />,
    )
    expect(html).toContain('role="dialog"')
    expect(html).toMatch(/<form[^>]*novalidate/i)
    expect(labelledControl(html, 'Question')[2]).toBeTruthy()
    expect(labelledControl(html, 'Answer')[2]).toBeTruthy()
    labelledControl(html, 'Explanation')
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>.*Save question/)
    expect(html).toContain('Wrong answer')
  })

  it('labels every UPCAT option and groups the correct-answer radios', () => {
    const html = renderToStaticMarkup(
      <QuestionEditorDrawer
        report={report({ source_table: 'upcat_questions', question_id: 'UP-12' })}
        onClose={noop}
        onResolved={noop}
        initialQuestion={{ question_id: 'UP-12', question_text: 'Solve', options: ['1', '2', '3', '4'], correct_index: 1, explanation: '', status: 'published' }}
      />,
    )
    expect(html).toMatch(/<form[^>]*novalidate/i)
    labelledControl(html, 'Question text')
    for (const n of [1, 2, 3, 4]) labelledControl(html, `Option ${n}`)
    expect(html).toMatch(/<legend[^>]*>Correct answer/)
    expect(html).toContain('aria-label="Option 2 is correct"')
    labelledControl(html, 'Visibility')
  })

  it('tells the editor when the question no longer exists', () => {
    const html = renderToStaticMarkup(
      <QuestionEditorDrawer report={report({})} onClose={noop} onResolved={noop} initialQuestion={null} />,
    )
    expect(html).toContain('This question no longer exists')
  })
})
