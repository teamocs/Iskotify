import { describe, it, expect, vi } from 'vitest'
import { fakeDb } from '@/lib/kb/__tests__/fakeDb'
import { entry, gateway } from '@/lib/kb/__tests__/syncFixtures'
import { syncContentSources, type ContentSource } from '../syncContent'

const SHEET = 'application/vnd.google-apps.spreadsheet'
const DOC = 'application/vnd.google-apps.document'

const LISTINGS: ContentSource = { id: 'src-l', contentType: 'listings', folderId: 'listings-folder-0000', label: 'Listings' }
const REPORTS: ContentSource = { id: 'src-a', contentType: 'announcements', folderId: 'reports-folder-0000', label: 'Reports' }

// A sheet with a merged title banner above the real header.
const LISTINGS_CSV = [
  'Iskotify Scholarships & Exams 2026,,,',
  'Type,Title,Provider,Deadline',
  'scholarship,DOST-SEI Merit Scholarship,DOST,2026-08-31',
  'exam,UPCAT 2027,UP,2026-09-15',
].join('\n')

const REPORT = `Weekly Admissions Report — June 14, 2026

Urgent (Iskotify Action Required)
PUP — PUPCET
The PUPCET application deadline was moved to June 20, 2026.
Source: https://www.pup.edu.ph/iapply

No Change Confirmed
ADMU — ACET: no new announcement.
`

const AI_JSON = {
  report_date: '2026-06-14',
  items: [{
    section: 'urgent', school: 'PUP', exam: 'PUPCET',
    title: 'PUPCET deadline moved to June 20',
    body: 'The PUPCET application deadline was moved to June 20, 2026.',
    quote: 'The PUPCET application deadline was moved to June 20, 2026.',
    event_date: '2026-06-20', event_type: 'deadline', action_required: null,
    sources: ['https://www.pup.edu.ph/iapply'],
  }],
}

const sheetEntry = (p: Partial<Parameters<typeof entry>[0]> = {}) =>
  entry({ id: 'sheet-1', name: 'Listings 2026', mimeType: SHEET, md5Checksum: null, modifiedTime: '2026-09-01T00:00:00Z', path: '', ...p })
const docEntry = (p: Partial<Parameters<typeof entry>[0]> = {}) =>
  entry({ id: 'doc-1', name: 'Weekly report', mimeType: DOC, md5Checksum: null, modifiedTime: '2026-06-15T00:00:00Z', path: '', ...p })

function routedGateway(byFolder: Record<string, ReturnType<typeof entry>[]>, texts: Record<string, string>) {
  const drive = gateway([], texts)
  drive.listTree = vi.fn(async (rootId: string) => {
    if (!(rootId in byFolder)) throw new Error(`File not found: ${rootId}`)
    return byFolder[rootId]!
  })
  return drive
}

const noAsk = vi.fn(async () => null)

describe('syncContentSources — listings', () => {
  it('turns a Drive sheet into a listings preview tagged with the file, skipping a title banner', async () => {
    const { db, rows } = fakeDb()
    const drive = routedGateway({ [LISTINGS.folderId]: [sheetEntry()] }, { 'sheet-1': LISTINGS_CSV })

    const s = await syncContentSources(db as never, drive, [LISTINGS], { ask: noAsk })

    expect(s.files).toEqual([expect.objectContaining({ contentType: 'listings', driveFileId: 'sheet-1', status: 'previewed' })])
    const [batch] = rows('listing_import_batches')
    expect(batch).toMatchObject({
      status: 'preview', source: 'drive', drive_file_id: 'sheet-1', sheet_id: 'sheet-1', sheet_title: 'Listings 2026',
      new_count: 2, update_count: 0, invalid_count: 0, missing: [],
    })
    expect(batch!.rows.map((r: { slug: string }) => r.slug)).toEqual(['dost-sei-merit-scholarship', 'upcat-2027'])
    // Aliases resolved the columns, so no AI was needed.
    expect(noAsk).not.toHaveBeenCalled()
    expect(rows('drive_content_files')).toEqual([expect.objectContaining({
      content_type: 'listings', drive_file_id: 'sheet-1', source_id: 'src-l', status: 'previewed', batch_id: String(batch!.id),
      drive_modified_at: '2026-09-01T00:00:00Z',
    })])
  })

  it('makes no new preview for an unchanged file', async () => {
    const { db, rows } = fakeDb()
    const drive = routedGateway({ [LISTINGS.folderId]: [sheetEntry()] }, { 'sheet-1': LISTINGS_CSV })
    await syncContentSources(db as never, drive, [LISTINGS], {})
    const again = await syncContentSources(db as never, drive, [LISTINGS], {})
    expect(again.files).toEqual([])
    expect(again.unchanged).toBe(1)
    expect(rows('listing_import_batches')).toHaveLength(1)
    expect(drive.downloadText).toHaveBeenCalledTimes(1)
  })

  it('replaces the file’s live preview when the file changes (one live preview per file)', async () => {
    const { db, rows } = fakeDb()
    await syncContentSources(db as never, routedGateway({ [LISTINGS.folderId]: [sheetEntry()] }, { 'sheet-1': LISTINGS_CSV }), [LISTINGS], {})
    const edited = sheetEntry({ modifiedTime: '2026-09-02T00:00:00Z' })
    await syncContentSources(db as never, routedGateway({ [LISTINGS.folderId]: [edited] }, { 'sheet-1': LISTINGS_CSV }), [LISTINGS], {})
    const batches = rows('listing_import_batches')
    expect(batches.map(b => b.status)).toEqual(['discarded', 'preview'])
    expect(batches[0]!.discarded_at).toEqual(expect.any(String))
  })

  it('records no_changes (and no preview) when every row already matches what is live', async () => {
    const live = [
      { slug: 'dost-sei-merit-scholarship', type: 'scholarship', title: 'DOST-SEI Merit Scholarship', provider: 'DOST', deadline: '2026-08-31', status: 'active' },
      { slug: 'upcat-2027', type: 'exam', title: 'UPCAT 2027', provider: 'UP', deadline: '2026-09-15', status: 'active' },
    ].map(l => ({ description: '', requirements: [], coverage: '', exam_date: null, results_date: null, events: [], target_courses: [], target_year_levels: [], tags: [], region: '', grant_amount: null, external_url: '', image_url: '', ...l }))
    const { db, rows } = fakeDb({ listings: live })
    const s = await syncContentSources(db as never, routedGateway({ [LISTINGS.folderId]: [sheetEntry()] }, { 'sheet-1': LISTINGS_CSV }), [LISTINGS], {})
    expect(s.files[0]).toMatchObject({ status: 'no_changes' })
    expect(rows('listing_import_batches')).toHaveLength(0)
  })

  it('holds a sheet with no readable listings, saying why', async () => {
    const { db, rows } = fakeDb()
    const csv = 'Program,When\nSomething,soon\n'
    const s = await syncContentSources(db as never, routedGateway({ [LISTINGS.folderId]: [sheetEntry()] }, { 'sheet-1': csv }), [LISTINGS], { ask: noAsk })
    expect(s.files[0]).toMatchObject({ status: 'held', message: expect.stringMatching(/No listings could be read/) })
    expect(rows('listing_import_batches')).toHaveLength(0)
  })

  it('skips files that are not sheets (e.g. a Doc dropped in the listings folder)', async () => {
    const { db, rows } = fakeDb()
    const s = await syncContentSources(db as never, routedGateway({ [LISTINGS.folderId]: [docEntry()] }, {}), [LISTINGS], {})
    expect(s.files[0]).toMatchObject({ status: 'skipped', message: expect.stringMatching(/Google Sheets, CSV or Excel/) })
    expect(rows('drive_content_files')[0]).toMatchObject({ status: 'skipped' })
  })
})

describe('syncContentSources — announcements', () => {
  it('reads a report Doc with the AI into an announcement preview, never publishing it', async () => {
    const { db, rows } = fakeDb()
    const ask = vi.fn(async () => JSON.stringify(AI_JSON))
    const s = await syncContentSources(db as never, routedGateway({ [REPORTS.folderId]: [docEntry()] }, { 'doc-1': REPORT }), [REPORTS], { ask })

    expect(ask).toHaveBeenCalledTimes(1)
    expect(s.aiCalls).toBe(1)
    expect(s.files[0]).toMatchObject({ contentType: 'announcements', status: 'previewed' })
    const [batch] = rows('announcement_import_batches')
    expect(batch).toMatchObject({ status: 'preview', drive_file_id: 'doc-1', file_name: 'Weekly report', report_date: '2026-06-14', new_count: 1, update_count: 0 })
    expect(batch!.rows[0]).toMatchObject({ action: 'new', update: { severity: 'urgent', event_date: '2026-06-20', verified: true } })
    expect(rows('admissions_updates')).toHaveLength(0)
  })

  it('holds the file with a clear message when the AI output is malformed, and retries it next run', async () => {
    const { db, rows } = fakeDb()
    const drive = routedGateway({ [REPORTS.folderId]: [docEntry()] }, { 'doc-1': REPORT })
    const bad = vi.fn(async () => 'Here you go: {items: oops')
    const s = await syncContentSources(db as never, drive, [REPORTS], { ask: bad })
    expect(s.files[0]).toMatchObject({ status: 'held', message: expect.stringMatching(/wasn.t valid JSON/) })
    expect(rows('announcement_import_batches')).toHaveLength(0)
    expect(rows('drive_content_files')[0]).toMatchObject({ status: 'held' })

    const good = vi.fn(async () => JSON.stringify(AI_JSON))
    const again = await syncContentSources(db as never, drive, [REPORTS], { ask: good })
    expect(good).toHaveBeenCalledTimes(1)
    expect(again.files[0]).toMatchObject({ status: 'previewed' })
  })

  it('gives the same row ids when a changed Doc is read again', async () => {
    const { db, rows } = fakeDb()
    const ask = vi.fn(async () => JSON.stringify(AI_JSON))
    await syncContentSources(db as never, routedGateway({ [REPORTS.folderId]: [docEntry()] }, { 'doc-1': REPORT }), [REPORTS], { ask })
    await syncContentSources(db as never, routedGateway({ [REPORTS.folderId]: [docEntry({ modifiedTime: '2026-06-16T00:00:00Z' })] }, { 'doc-1': REPORT }), [REPORTS], { ask })
    const [first, second] = rows('announcement_import_batches')
    expect(first!.status).toBe('discarded')
    expect(second!.status).toBe('preview')
    expect(second!.rows.map((r: { id: string }) => r.id)).toEqual(first!.rows.map((r: { id: string }) => r.id))
  })

  it('records no_changes when every finding is already live', async () => {
    const ask = vi.fn(async () => JSON.stringify(AI_JSON))
    const first = fakeDb()
    await syncContentSources(first.db as never, routedGateway({ [REPORTS.folderId]: [docEntry()] }, { 'doc-1': REPORT }), [REPORTS], { ask })
    const live = first.rows('announcement_import_batches')[0]!.rows.map((r: { update: unknown }) => r.update)

    const { db, rows } = fakeDb({ admissions_updates: live })
    const s = await syncContentSources(db as never, routedGateway({ [REPORTS.folderId]: [docEntry()] }, { 'doc-1': REPORT }), [REPORTS], { ask })
    expect(s.files[0]).toMatchObject({ status: 'no_changes' })
    expect(rows('announcement_import_batches')).toHaveLength(0)
  })

  it('stops calling the AI when the run’s budget is spent, holding the rest for the next run', async () => {
    const { db } = fakeDb()
    const ask = vi.fn(async () => JSON.stringify(AI_JSON))
    const docs = [docEntry({ id: 'doc-1' }), docEntry({ id: 'doc-2', name: 'Another report' })]
    const s = await syncContentSources(db as never, routedGateway({ [REPORTS.folderId]: docs }, { 'doc-1': REPORT, 'doc-2': REPORT }), [REPORTS], { ask, maxAiCalls: 1 })
    expect(ask).toHaveBeenCalledTimes(1)
    expect(s.files.map(f => f.status)).toEqual(['previewed', 'held'])
    expect(s.files[1]!.message).toMatch(/next sync/)
  })

  it('skips files that are not Docs (e.g. a Word file)', async () => {
    const { db } = fakeDb()
    const word = docEntry({ id: 'w-1', name: 'report.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    const s = await syncContentSources(db as never, routedGateway({ [REPORTS.folderId]: [word] }, {}), [REPORTS], { ask: noAsk })
    expect(s.files[0]).toMatchObject({ status: 'skipped', message: expect.stringMatching(/Google Doc/) })
  })
})

describe('syncContentSources — run control', () => {
  it('routes each folder by its content type in one run', async () => {
    const { db, rows } = fakeDb()
    const ask = vi.fn(async () => JSON.stringify(AI_JSON))
    const drive = routedGateway({ [LISTINGS.folderId]: [sheetEntry()], [REPORTS.folderId]: [docEntry()] }, { 'sheet-1': LISTINGS_CSV, 'doc-1': REPORT })
    const s = await syncContentSources(db as never, drive, [LISTINGS, REPORTS], { ask })
    expect(s.files.map(f => [f.contentType, f.status])).toEqual([['listings', 'previewed'], ['announcements', 'previewed']])
    expect(rows('listing_import_batches')).toHaveLength(1)
    expect(rows('announcement_import_batches')).toHaveLength(1)
  })

  it('reports a folder it cannot list and carries on with the others', async () => {
    const { db } = fakeDb()
    const drive = routedGateway({ [LISTINGS.folderId]: [sheetEntry()] }, { 'sheet-1': LISTINGS_CSV })
    const s = await syncContentSources(db as never, drive, [REPORTS, LISTINGS], { ask: noAsk })
    expect(s.sourceErrors).toEqual([{ sourceId: 'src-a', contentType: 'announcements', folderId: REPORTS.folderId, label: 'Reports', message: expect.stringMatching(/not found/) }])
    expect(s.files[0]).toMatchObject({ contentType: 'listings', status: 'previewed' })
  })

  it('leaves files for the next run once the deadline passes', async () => {
    const { db, rows } = fakeDb()
    const drive = routedGateway({ [LISTINGS.folderId]: [sheetEntry(), sheetEntry({ id: 'sheet-2' })] }, { 'sheet-1': LISTINGS_CSV, 'sheet-2': LISTINGS_CSV })
    let t = 0
    const s = await syncContentSources(db as never, drive, [LISTINGS], { deadline: 1, now: () => t++ })
    expect(s.files).toHaveLength(1)
    expect(s.remaining).toBe(1)
    expect(rows('drive_content_files')).toHaveLength(1)
  })

  it('does not start a report’s AI read without enough time left before the deadline', async () => {
    const { db, rows } = fakeDb()
    const ask = vi.fn(async () => JSON.stringify(AI_JSON))
    const drive = routedGateway({ [REPORTS.folderId]: [docEntry()], [LISTINGS.folderId]: [sheetEntry()] }, { 'doc-1': REPORT, 'sheet-1': LISTINGS_CSV })
    // 10 s left: a sheet still fits, a model call (up to ~30 s) does not.
    const s = await syncContentSources(db as never, drive, [REPORTS, LISTINGS], { ask, deadline: 10_000, now: () => 0 })
    expect(ask).not.toHaveBeenCalled()
    expect(s.remaining).toBe(1)
    expect(s.files.map(f => f.contentType)).toEqual(['listings'])
    expect(rows('drive_content_files').map(r => r.content_type)).toEqual(['listings'])
  })

  it('records an error outcome when a download fails, and retries it next run', async () => {
    const { db, rows } = fakeDb()
    const s = await syncContentSources(db as never, routedGateway({ [LISTINGS.folderId]: [sheetEntry()] }, {}), [LISTINGS], {})
    expect(s.files[0]).toMatchObject({ status: 'error', message: expect.stringMatching(/boom/) })
    expect(rows('drive_content_files')[0]).toMatchObject({ status: 'error' })
  })
})
