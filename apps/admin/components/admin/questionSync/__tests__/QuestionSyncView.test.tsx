import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/sync',
  useSearchParams: () => new URLSearchParams(''),
}))

import { QuestionSyncView } from '../QuestionSyncView'
import type { KbFileRow, PublishEventRow, SyncRunRow } from '../types'

function file(p: Partial<KbFileRow>): KbFileRow {
  return {
    drive_file_id: 'f1', name: 'UPCAT-Science-600-Questions.csv', path: '', status: 'imported', dialect: 'abcd-letter',
    mapping_source: 'rule', rows_total: 600, rows_imported: 600, rows_missing_media: 152, rows_drafted: 600, rows_rejected: 0,
    headers: ['ID'], message: null, imported_at: '2026-09-24T02:00:00Z', published_at: null, updated_at: '2026-09-24T02:00:00Z', ...p,
  }
}

const render = (files: KbFileRow[], runs: SyncRunRow[] = [], events: PublishEventRow[] = []) =>
  renderToStaticMarkup(React.createElement(QuestionSyncView, { files, runs, events }))

describe('QuestionSyncView', () => {
  it('lists unpublished imports in Preview with Preview and Publish actions', () => {
    const html = render([file({})])
    expect(html).toContain('id="preview"')
    expect(html).toContain('UPCAT-Science-600-Questions.csv')
    expect(html).toContain('>Preview<')
    expect(html).toContain('>Publish<')
    expect(html).toMatch(/600 draft questions across 1 file/)
  })

  it('moves a published file out of Preview and into History, with its last publish result', () => {
    const html = render(
      [file({ published_at: '2026-09-25T00:00:00Z' })],
      [],
      [{ id: 1, drive_file_id: 'f1', file_name: 'x', published: 448, already_published: 0, held_missing_media: 152, held_few_options: 0, held_duplicate: 0, created_at: '2026-09-25T00:00:00Z' }],
    )
    expect(html).toContain('Nothing waiting to publish')
    expect(html).toContain('448 questions published')
    expect(html).toContain('Held back: 152 missing a figure')
    // The held-back drafts stay reachable from History.
    expect(html).toContain('Review held back')
  })

  it('offers no held-back review when everything published', () => {
    const html = render(
      [file({ published_at: '2026-09-25T00:00:00Z', rows_missing_media: 0 })],
      [],
      [{ id: 1, drive_file_id: 'f1', file_name: 'x', published: 600, already_published: 0, held_missing_media: 0, held_few_options: 0, held_duplicate: 0, created_at: '2026-09-25T00:00:00Z' }],
    )
    expect(html).not.toContain('Review held back')
  })

  it('puts files the sync could not read under Needs attention with a Map columns action', () => {
    const html = render([
      file({ drive_file_id: 'u1', name: 'Trivia.xlsx', status: 'needs_mapping', rows_imported: 0, message: 'AI mapping couldn’t work it out.' }),
    ])
    expect(html).toContain('id="needs-attention"')
    expect(html).toContain('Needs mapping')
    expect(html).toContain('Map columns')
  })

  it('keeps deliberately skipped files out of the flow, behind a disclosure', () => {
    const html = render([file({ drive_file_id: 'p1', name: 'PSHS_NCE_300_Questions.csv', status: 'skipped', rows_imported: 0, message: 'PSHS NCE is for Grade 6 pupils' })])
    expect(html).toContain('Not imported (1)')
    expect(html).toContain('PSHS NCE is for Grade 6 pupils')
    expect(html).not.toContain('Map columns')
  })

  it('labels AI-mapped files and offers to edit the mapping', () => {
    const html = render([file({ mapping_source: 'ai', mapped_subtest: 'General Information', name: 'ACET_General_Knowledge_300Q.xlsx' })])
    expect(html).toContain('Mapped by AI')
    expect(html).toContain('General Information')
    expect(html).toContain('Edit mapping')
  })

  it('shows the last run and the stage counts as jump links', () => {
    const html = render([file({})], [{ id: 1, trigger: 'cron', status: 'warn', imported: 1, unchanged: 5, needs_mapping: 1, skipped: 0, errors: 0, remaining: 0, ai_mapped: 1, message: null, started_at: '2026-09-27T18:00:00Z', finished_at: '2026-09-27T18:00:30Z' }])
    expect(html).toMatch(/Last sync [^<]+<span[^>]*>Needs attention</)
    expect(html).toContain('href="#preview"')
    expect(html).toContain('href="#history"')
  })
})
