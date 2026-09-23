import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { KbDriveSyncPanel, type KbDriveFile } from '../KbDriveSyncPanel'

function file(p: Partial<KbDriveFile>): KbDriveFile {
  return {
    drive_file_id: 'f1', name: 'UPCAT-Science-600-Questions.csv', path: 'Iskotify Questions',
    status: 'imported', dialect: 'abcd-letter', rows_total: 600, rows_imported: 600,
    rows_missing_media: 152, rows_drafted: 600, message: '152 missing figure(s): diagrams/circuit_3.png',
    imported_at: '2026-09-24T02:00:00Z', published_at: null, updated_at: '2026-09-24T02:00:00Z', ...p,
  }
}

const render = (files: KbDriveFile[]) => renderToStaticMarkup(React.createElement(KbDriveSyncPanel, { files }))

describe('KbDriveSyncPanel', () => {
  it('lists imported files with question and missing-figure counts and a publish action', () => {
    const html = render([file({})])
    expect(html).toContain('UPCAT-Science-600-Questions.csv')
    expect(html).toContain('600 questions')
    expect(html).toContain('152 missing figures')
    expect(html).toContain('Publish drafts')
  })

  it('explains skipped and needs-mapping files and offers no publish for them', () => {
    const html = render([
      file({ drive_file_id: 'p1', name: 'PSHS_NCE_300_Questions.csv', status: 'skipped', rows_imported: 0, rows_missing_media: 0, message: 'PSHS NCE is for Grade 6 pupils' }),
      file({ drive_file_id: 'u1', name: 'random.csv', status: 'needs_mapping', rows_imported: 0, rows_missing_media: 0, message: 'No import rule for this file name.' }),
    ])
    expect(html).toContain('PSHS NCE is for Grade 6 pupils')
    expect(html).toContain('No import rule for this file name.')
    expect(html).toContain('Needs mapping')
    expect(html).not.toContain('Publish drafts')
  })

  it('shows when a file was last published', () => {
    const html = render([file({ published_at: '2026-09-25T03:00:00Z' })])
    expect(html).toMatch(/Published/)
  })

  it('has a Sync now control and a setup hint when nothing has synced yet', () => {
    const html = render([])
    expect(html).toContain('Sync now')
    expect(html).toContain('KB_DRIVE_FOLDER_ID')
  })
})
