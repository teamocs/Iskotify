import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/sync',
  useSearchParams: () => new URLSearchParams(''),
}))

import { DriveSourcesPanel } from '../DriveSourcesPanel'
import { DriveListingsCard } from '../DriveListingsCard'
import { DriveAnnouncementsCard } from '../DriveAnnouncementsCard'
import type { DriveSourceRow } from '@/lib/driveSources/sources'
import type { ImportBatch } from '@/lib/listings/types'
import type { AnnouncementBatch, AnnouncementRow } from '@/lib/announcements/types'
import type { ContentFileRow } from '../types'

const FOLDER = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345'
const source = (p: Partial<DriveSourceRow> = {}): DriveSourceRow => ({
  id: '7c1e3f0a-1b2c-4d5e-8f90-0123456789ab', content_type: 'announcements', folder_id: FOLDER, label: 'Weekly reports',
  enabled: true, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', ...p,
})

describe('DriveSourcesPanel', () => {
  const render = (p: Partial<React.ComponentProps<typeof DriveSourcesPanel>> = {}) =>
    renderToStaticMarkup(React.createElement(DriveSourcesPanel, {
      sources: [source()], envFolderId: 'env-questions-folder-0000', serviceAccountEmail: 'sync@x.iam.gserviceaccount.com', ...p,
    }))

  it('lists each folder with its type, a link to it, and pause/remove actions', () => {
    const html = render({ sources: [source(), source({ id: 'b', content_type: 'listings', label: null, enabled: false })] })
    expect(html).toContain('id="drive-sources"')
    expect(html).toContain('Weekly reports')
    expect(html).toContain('Announcements')
    expect(html).toContain('Listings (exams &amp; scholarships)')
    expect(html).toContain(`href="https://drive.google.com/drive/folders/${FOLDER}"`)
    expect(html).toContain('>Pause<')
    expect(html).toContain('>Resume<')
    expect(html).toContain('Paused')
    expect(html).toMatch(/Remove/)
  })

  it('shows the KB_DRIVE_FOLDER_ID folder as a fixed questions source', () => {
    const html = render()
    expect(html).toContain('KB_DRIVE_FOLDER_ID')
    expect(html).toContain('https://drive.google.com/drive/folders/env-questions-folder-0000')
  })

  it('says who to share folders with — the service-account email only', () => {
    const html = render()
    expect(html).toContain('sync@x.iam.gserviceaccount.com')
    expect(html).toMatch(/as Viewer/)
    expect(html).toContain('Copy email')
  })

  it('warns when the service account is not configured', () => {
    expect(render({ serviceAccountEmail: null })).toMatch(/GOOGLE_SERVICE_ACCOUNT_JSON/)
  })

  it('has an add form: folder link or id, what it holds, an optional name', () => {
    const html = render()
    expect(html).toContain('Drive folder link or id')
    expect(html).toMatch(/<select[^>]*>.*Questions.*Listings.*Announcements/s)
    expect(html).toContain('Add folder')
  })

  it('shows a load error instead of the list (e.g. before migration 068)', () => {
    const html = render({ sources: [], loadError: 'relation "drive_sources" does not exist' })
    expect(html).toContain('relation &quot;drive_sources&quot; does not exist')
  })
})

const LISTING = {
  slug: 'dost-sei', title: 'DOST-SEI Merit', type: 'scholarship' as const, provider: 'DOST', description: '', requirements: [],
  coverage: '', deadline: null, exam_date: null, results_date: null, events: [], target_courses: [], target_year_levels: [],
  tags: [], status: 'active' as const, region: '', grant_amount: null, external_url: '', image_url: '',
} as unknown as ImportBatch['rows'][number]['listing']

const listingBatch = (p: Partial<ImportBatch> = {}): ImportBatch => ({
  id: 'lb-1', sheet_id: 'sheet-1', sheet_url: 'https://drive.google.com/open?id=sheet-1', sheet_title: 'Scholarships 2026', tab: null,
  status: 'preview', rows: [
    { slug: 'dost-sei', title: 'DOST-SEI Merit', action: 'new', changes: [], listing: LISTING },
    { slug: 'upcat', title: 'UPCAT', action: 'update', changes: ['deadline'], listing: LISTING },
  ],
  invalid: [{ row: 5, title: 'Broken', errors: ['type: Invalid enum value'] }], missing: [], column_map: null, mapped_by_ai: false,
  new_count: 1, update_count: 1, unchanged_count: 3, invalid_count: 1, closed_count: 0,
  created_by: null, created_at: '2026-10-01T00:00:00Z', published_by: null, published_at: null, discarded_at: null,
  source: 'drive', drive_file_id: 'sheet-1', ...p,
})

const heldFile = (p: Partial<ContentFileRow> = {}): ContentFileRow => ({
  content_type: 'listings', drive_file_id: 'f9', name: 'Notes.docx', path: '', status: 'held',
  message: 'No listings could be read', synced_at: '2026-10-01T00:00:00Z', ...p,
})

describe('DriveListingsCard', () => {
  const render = (p: Partial<React.ComponentProps<typeof DriveListingsCard>> = {}) =>
    renderToStaticMarkup(React.createElement(DriveListingsCard, { previews: [listingBatch()], history: [], files: [], ...p }))

  it('shows each Drive file’s preview with its counts, its rows, and Publish / Discard', () => {
    const html = render()
    expect(html).toContain('id="drive-listings"')
    expect(html).toContain('Scholarships 2026')
    expect(html).toContain('1 new')
    expect(html).toContain('1 updated')
    expect(html).toContain('1 invalid')
    expect(html).toContain('DOST-SEI Merit')
    expect(html).toContain('deadline')
    expect(html).toContain('Row 5')
    expect(html).toContain('>Publish 2 changes<')
    expect(html).toContain('Discard')
    expect(html).toContain('href="https://drive.google.com/open?id=sheet-1"')
  })

  it('lists files the sync held back, with why', () => {
    const html = render({ previews: [], files: [heldFile()] })
    expect(html).toContain('Notes.docx')
    expect(html).toContain('No listings could be read')
    expect(html).toMatch(/Nothing waiting to publish/)
  })

  it('shows the history of published and discarded Drive previews', () => {
    const { rows: _r, invalid: _i, missing: _m, ...summary } = listingBatch({ id: 'h1', status: 'published', published_at: '2026-10-02T00:00:00Z' })
    const html = render({ previews: [], history: [summary] })
    expect(html).toContain('Published')
    expect(html).toContain('Scholarships 2026')
  })
})

const annRow = (id: string, p: Partial<AnnouncementRow> = {}, u: Partial<AnnouncementRow['update']> = {}): AnnouncementRow => ({
  id, action: 'new', changes: [], section: 'urgent', quote: 'q',
  update: {
    id, report_date: '2026-06-14', severity: 'urgent', school_slug: null, school_name: 'PUP — PUPCET', title: `Title ${id}`,
    body: `Body ${id}`, action_required: null, event_date: '2026-06-20', event_type: 'deadline', sources: ['https://www.pup.edu.ph/iapply'], verified: true, ...u,
  },
  ...p,
})

const annBatch = (p: Partial<AnnouncementBatch> = {}): AnnouncementBatch => ({
  id: 'ab-1', drive_file_id: 'doc-1', file_name: 'Weekly report — June 14', report_date: '2026-06-14', status: 'preview',
  rows: [
    annRow('a'),
    annRow('b', { action: 'update', changes: ['title'], section: 'new' }, { severity: 'important' }),
    annRow('c', { action: 'unchanged', section: 'info' }, { severity: 'info' }),
    annRow('d', { section: 'social' }, { severity: 'info', verified: false }),
  ],
  skipped: [{ title: 'UPCAT cancelled', reason: 'Its quoted text was not found in the document' }],
  new_count: 2, update_count: 1, unchanged_count: 1, skipped_count: 1, published_count: 0,
  created_at: '2026-06-15T00:00:00Z', published_by: null, published_at: null, discarded_at: null, ...p,
})

describe('DriveAnnouncementsCard', () => {
  const render = (p: Partial<React.ComponentProps<typeof DriveAnnouncementsCard>> = {}) =>
    renderToStaticMarkup(React.createElement(DriveAnnouncementsCard, { previews: [annBatch()], history: [], files: [], ...p }))

  it('shows every extracted announcement for review, with severity, school, date and sources', () => {
    const html = render()
    expect(html).toContain('id="drive-announcements"')
    expect(html).toContain('Weekly report — June 14')
    for (const t of ['Title a', 'Title b', 'Title d']) expect(html).toContain(t)
    expect(html).toContain('Urgent')
    expect(html).toContain('Important')
    expect(html).toContain('PUP — PUPCET')
    expect(html).toContain('href="https://www.pup.edu.ph/iapply"')
    expect(html).toContain('Unverified')
  })

  it('lets the admin leave rows out: a checkbox on each new or changed row, none on unchanged ones', () => {
    const html = render()
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(3)
    expect(html).toContain('No change')
    expect(html).toContain('>Publish 3 announcements<')
  })

  it('lists what the AI read but the validator left out, and why', () => {
    const html = render()
    expect(html).toContain('UPCAT cancelled')
    expect(html).toContain('not found in the document')
  })

  it('says nothing is published without an admin', () => {
    expect(render({ previews: [] })).toMatch(/nothing goes live until you publish/i)
  })

  it('lists held report files (e.g. unreadable AI output) and the history', () => {
    const { rows: _r, skipped: _s, ...summary } = annBatch({ id: 'h', status: 'discarded', discarded_at: '2026-06-16T00:00:00Z' })
    const html = render({
      previews: [],
      files: [heldFile({ content_type: 'announcements', name: 'June 21 report', message: 'The AI’s answer wasn’t valid JSON' })],
      history: [summary],
    })
    expect(html).toContain('June 21 report')
    expect(html).toContain('valid JSON')
    expect(html).toContain('Discarded')
  })
})
