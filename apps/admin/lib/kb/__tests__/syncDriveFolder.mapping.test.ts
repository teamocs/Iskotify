import { describe, it, expect, vi } from 'vitest'
import { syncDriveFolder } from '../syncDriveFolder'
import { fakeDb } from './fakeDb'
import { MATH_CSV, SCI_CSV, entry, gateway, mediaStore, aiReturns, pngBytes } from './syncFixtures'
import { makeXlsx } from './xlsxFixture'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
// A hand-made workbook: a title row above headers no dialect knows.
const GK_XLSX = makeXlsx([
  ['ACET General Knowledge — 300 Questions'],
  ['No.', 'Item', 'Choice 1', 'Choice 2', 'Choice 3', 'Choice 4', 'Key', 'Area'],
  [1, 'Capital of the Philippines?', 'Cebu', 'Manila', 'Davao', 'Iloilo', 'B', 'Geography'],
  [2, 'National hero?', 'Rizal', 'Bonifacio', 'Mabini', 'Luna', 'A', 'History'],
])
const GK_COLUMNS = { id: 'No.', question: 'Item', option_a: 'Choice 1', option_b: 'Choice 2', option_c: 'Choice 3', option_d: 'Choice 4', answer: 'Key', topic: 'Area' }

describe('syncDriveFolder — mapping, Excel and review state', () => {
  it('imports an .xlsx file: a file rule fixes the pool, AI maps the unfamiliar columns', async () => {
    const { db, rows } = fakeDb()
    const drive = gateway([entry({ id: 'x1', name: 'ACET_General_Knowledge_300Q.xlsx', mimeType: XLSX_MIME })], {}, { x1: GK_XLSX })
    const ask = aiReturns({ columns: GK_COLUMNS, choices: {} })
    const res = await syncDriveFolder(db as any, drive, mediaStore(), { rootId: 'root', ask })

    expect(res.imported).toEqual([expect.objectContaining({ driveFileId: 'x1', rows: 2 })])
    expect(res.aiMapped).toBe(1)
    expect(rows('upcat_questions').map(q => [q.question_id, q.subtest, q.skill_category, q.status])).toEqual([
      ['acet-general-knowledge-300q:0001', 'General Information', 'General Information', 'draft'],
      ['acet-general-knowledge-300q:0002', 'General Information', 'General Information', 'draft'],
    ])
    expect(rows('kb_drive_files')[0]).toMatchObject({ status: 'imported', dialect: 'mapped', mapping_source: 'ai' })
    expect(rows('kb_file_mappings')[0]).toMatchObject({ drive_file_id: 'x1', subtest: 'General Information', source: 'ai', columns: GK_COLUMNS })
  })

  it('lets AI pick the pool too when no file rule matches the name', async () => {
    const { db, rows } = fakeDb()
    const drive = gateway([entry({ id: 'n1', name: 'Trivia batch.xlsx', mimeType: XLSX_MIME })], {}, { n1: GK_XLSX })
    const ask = aiReturns({ columns: GK_COLUMNS, choices: { subtest: 'General Information' } })
    await syncDriveFolder(db as any, drive, mediaStore(), { rootId: 'root', ask })
    expect(rows('upcat_questions')).toHaveLength(2)
    expect(rows('upcat_questions')[0]).toMatchObject({ subtest: 'General Information' })
  })

  it('keeps a file in needs_mapping when the AI mapping yields no usable questions, and saves no mapping', async () => {
    const { db, rows } = fakeDb()
    const drive = gateway([entry({ id: 'x1', name: 'ACET_General_Knowledge_300Q.xlsx', mimeType: XLSX_MIME })], {}, { x1: GK_XLSX })
    // Plausible-looking but wrong: the answer column is mapped to the topic.
    const { topic: _topic, ...rest } = GK_COLUMNS
    const ask = aiReturns({ columns: { ...rest, answer: 'Area' }, choices: {} })
    const res = await syncDriveFolder(db as any, drive, mediaStore(), { rootId: 'root', ask })
    expect(res.needsMapping).toEqual([expect.objectContaining({ message: expect.stringMatching(/AI mapping/i) })])
    expect(rows('upcat_questions')).toEqual([])
    expect(rows('kb_file_mappings')).toEqual([])
  })

  it('uses a saved admin mapping before any rule or AI, and re-imports when the mapping changes', async () => {
    const { db, rows } = fakeDb({
      kb_drive_files: [{ drive_file_id: 'x1', md5_checksum: 'md5-x1', status: 'imported', imported_at: '2026-09-20T00:00:00Z' }],
      kb_file_mappings: [{ drive_file_id: 'x1', subtest: 'Mental Ability', main_subject: 'Mental Ability', skill_category: 'Verbal Reasoning', columns: GK_COLUMNS, source: 'admin', updated_at: '2026-09-21T00:00:00Z' }],
    })
    const drive = gateway([entry({ id: 'x1', name: 'Some file.xlsx', mimeType: XLSX_MIME })], {}, { x1: GK_XLSX })
    const ask = vi.fn(async () => null)
    const res = await syncDriveFolder(db as any, drive, mediaStore(), { rootId: 'root', ask })
    expect(res.imported).toHaveLength(1)
    expect(ask).not.toHaveBeenCalled()
    expect(rows('upcat_questions')[0]).toMatchObject({ subtest: 'Mental Ability', skill_category: 'Verbal Reasoning' })
    expect(rows('kb_drive_files')[0]).toMatchObject({ mapping_source: 'admin' })
  })

  it('retries needs_mapping files every run even when the file itself is unchanged', async () => {
    const { db } = fakeDb({ kb_drive_files: [{ drive_file_id: 'x1', md5_checksum: 'md5-x1', status: 'needs_mapping' }] })
    const drive = gateway([entry({ id: 'x1', name: 'ACET_General_Knowledge_300Q.xlsx', mimeType: XLSX_MIME })], {}, { x1: GK_XLSX })
    const res = await syncDriveFolder(db as any, drive, mediaStore(), { rootId: 'root', ask: aiReturns({ columns: GK_COLUMNS, choices: {} }) })
    expect(res.unchanged).toBe(0)
    expect(res.imported).toHaveLength(1)
  })

  it('maps a file held for a spent AI budget on the next run, then reuses that AI mapping without asking again', async () => {
    const { db, rows } = fakeDb()
    const ask = aiReturns({ columns: GK_COLUMNS, choices: { subtest: 'General Information' } })
    const v1 = gateway([entry({ id: 'n1', name: 'Trivia batch.xlsx', mimeType: XLSX_MIME })], {}, { n1: GK_XLSX })

    const first = await syncDriveFolder(db as any, v1, mediaStore(), { rootId: 'root', ask, maxAiCalls: 0 })
    expect(first.needsMapping).toEqual([expect.objectContaining({ message: expect.stringMatching(/next sync/) })])
    expect(ask).not.toHaveBeenCalled()

    // Next nightly run, file unchanged: retried, mapped by AI, mapping saved.
    const second = await syncDriveFolder(db as any, v1, mediaStore(), { rootId: 'root', ask })
    expect(second.imported).toHaveLength(1)
    expect(ask).toHaveBeenCalledTimes(1)
    expect(rows('kb_file_mappings')).toEqual([expect.objectContaining({ drive_file_id: 'n1', source: 'ai', subtest: 'General Information' })])

    // The sheet is edited later: re-imported through the saved mapping, no new AI call.
    const v2 = gateway([entry({ id: 'n1', name: 'Trivia batch.xlsx', mimeType: XLSX_MIME, md5Checksum: 'md5-n1-v2' })], {}, { n1: GK_XLSX })
    const third = await syncDriveFolder(db as any, v2, mediaStore(), { rootId: 'root', ask })
    expect(third.imported).toHaveLength(1)
    expect(third.aiMapped).toBe(0)
    expect(ask).toHaveBeenCalledTimes(1)
    expect(rows('kb_drive_files')[0]).toMatchObject({ status: 'imported', mapping_source: 'ai' })
  })

  it('gives new and changed files the AI budget before files already stuck in needs_mapping', async () => {
    // A stuck file listed first must not use up the run's AI calls every night.
    const { db } = fakeDb({ kb_drive_files: [{ drive_file_id: 'stuck', md5_checksum: 'md5-stuck', status: 'needs_mapping' }] })
    const drive = gateway(
      [
        entry({ id: 'stuck', name: 'Mystery.xlsx', mimeType: XLSX_MIME }),
        entry({ id: 'x1', name: 'ACET_General_Knowledge_300Q.xlsx', mimeType: XLSX_MIME }),
      ],
      {}, { stuck: GK_XLSX, x1: GK_XLSX },
    )
    const ask = aiReturns({ columns: GK_COLUMNS, choices: {} })
    const res = await syncDriveFolder(db as any, drive, mediaStore(), { rootId: 'root', ask, maxAiCalls: 1 })
    expect(res.imported.map(o => o.driveFileId)).toEqual(['x1'])
    expect(res.needsMapping.map(o => o.driveFileId)).toEqual(['stuck'])
  })

  it('retries a file skipped as unsupported once its type can be imported', async () => {
    const { db } = fakeDb({ kb_drive_files: [{ drive_file_id: 'x1', md5_checksum: 'md5-x1', status: 'skipped' }] })
    const drive = gateway([entry({ id: 'x1', name: 'ACET_General_Knowledge_300Q.xlsx', mimeType: XLSX_MIME })], {}, { x1: GK_XLSX })
    const res = await syncDriveFolder(db as any, drive, mediaStore(), { rootId: 'root', ask: aiReturns({ columns: GK_COLUMNS, choices: {} }) })
    expect(res.imported).toHaveLength(1)
  })

  it('re-imports an unchanged file with missing figures once new images appear in the folder', async () => {
    const { db } = fakeDb()
    const csv = entry({ id: 'f2', name: 'UPCAT-Science-600-Questions.csv' })
    await syncDriveFolder(db as any, gateway([csv], { f2: SCI_CSV }), mediaStore(), { rootId: 'root' })

    // Same CSV, same folder: nothing to do.
    expect((await syncDriveFolder(db as any, gateway([csv], { f2: SCI_CSV }), mediaStore(), { rootId: 'root' })).unchanged).toBe(1)

    // The author uploads a figure: the file is picked up again and it attaches.
    const withImages = gateway(
      [csv, entry({ id: 'img1', name: 'circuit_3.png', mimeType: 'image/png', path: 'Iskotify Questions/diagrams' })],
      { f2: SCI_CSV }, { img1: pngBytes(10, 10) },
    )
    const res = await syncDriveFolder(db as any, withImages, mediaStore(), { rootId: 'root' })
    expect(res.imported).toEqual([expect.objectContaining({ driveFileId: 'f2', missingMedia: 1 })])
  })

  it('skips the preview when a re-import has nothing new to review', async () => {
    const { db, rows } = fakeDb({
      kb_drive_files: [{ drive_file_id: 'f1', md5_checksum: 'old', status: 'imported' }],
      upcat_questions: [
        { question_id: 'upcat-math-500-questions:UPCAT-MATH-001', question_text: 'Q1?', options: ['a', 'b', 'c', 'd'], correct_index: 1, status: 'published', image_url: null },
        { question_id: 'upcat-math-500-questions:UPCAT-MATH-002', question_text: 'Q2?', options: ['a', 'b', 'c', 'd'], correct_index: 0, status: 'published', image_url: null },
      ],
    })
    const drive = gateway([entry({ id: 'f1', name: 'UPCAT-Math-500-Questions.csv' })], { f1: MATH_CSV })
    await syncDriveFolder(db as any, drive, mediaStore(), { rootId: 'root' })
    const led = rows('kb_drive_files')[0]!
    expect(led.rows_drafted).toBe(0)
    expect(led.published_at).toBe(led.imported_at)
  })

  it('ignores unsupported files when checking for same-named twins', async () => {
    const { db, rows } = fakeDb()
    const drive = gateway(
      [
        entry({ id: 'a', name: 'UPCAT-Math-500-Questions.csv' }),
        entry({ id: 'b', name: 'UPCAT-Math-500-Questions.pdf', mimeType: 'application/pdf' }),
      ],
      { a: MATH_CSV },
    )
    const res = await syncDriveFolder(db as any, drive, mediaStore(), { rootId: 'root' })
    expect(res.imported.map(o => o.driveFileId)).toEqual(['a'])
    expect(rows('kb_drive_files').find(r => r.drive_file_id === 'b')).toMatchObject({ status: 'skipped' })
  })

  it('syncs only the requested files, even unchanged ones', async () => {
    const { db } = fakeDb({ kb_drive_files: [{ drive_file_id: 'f1', md5_checksum: 'md5-f1', status: 'imported' }] })
    const drive = gateway(
      [entry({ id: 'f1', name: 'UPCAT-Math-500-Questions.csv' }), entry({ id: 'f2', name: 'UPCAT-Science-600-Questions.csv' })],
      { f1: MATH_CSV, f2: SCI_CSV },
    )
    const res = await syncDriveFolder(db as any, drive, mediaStore(), { rootId: 'root', onlyFileIds: ['f1'] })
    expect(res.imported.map(o => o.driveFileId)).toEqual(['f1'])
    expect(drive.downloadText).toHaveBeenCalledTimes(1)
  })

  it('records rejected rows so the preview can show them', async () => {
    const { db, rows } = fakeDb()
    const csv = MATH_CSV + '\nUPCAT-MATH-003,Algebra,x,Easy,,a,b,c,d,A,s'
    const drive = gateway([entry({ id: 'f1', name: 'UPCAT-Math-500-Questions.csv' })], { f1: csv })
    await syncDriveFolder(db as any, drive, mediaStore(), { rootId: 'root' })
    expect(rows('kb_drive_files')[0]).toMatchObject({
      rows_rejected: 1,
      rejected_rows: [{ localId: 'UPCAT-MATH-003', reason: 'missing question text' }],
    })
  })
})
