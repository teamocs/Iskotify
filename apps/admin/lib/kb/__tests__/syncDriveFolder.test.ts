import { describe, it, expect, vi } from 'vitest'
import { syncDriveFolder } from '../syncDriveFolder'
import { fakeDb } from './fakeDb'
import { MATH_CSV, SCI_CSV, entry, gateway, mediaStore, noAi, pngBytes } from './syncFixtures'

describe('syncDriveFolder', () => {
  it('imports a new CSV as namespaced drafts and records it in the ledger', async () => {
    const { db, rows } = fakeDb()
    const drive = gateway([entry({ id: 'f1', name: 'UPCAT-Math-500-Questions.csv' })], { f1: MATH_CSV })
    const res = await syncDriveFolder(db as any, drive, mediaStore(), { rootId: 'root' })

    expect(res.imported).toEqual([expect.objectContaining({ driveFileId: 'f1', rows: 2 })])
    expect(rows('upcat_questions').map(q => [q.question_id, q.status, q.subtest])).toEqual([
      ['upcat-math-500-questions:UPCAT-MATH-001', 'draft', 'Mathematics'],
      ['upcat-math-500-questions:UPCAT-MATH-002', 'draft', 'Mathematics'],
    ])
    expect(rows('kb_drive_files')[0]).toMatchObject({
      drive_file_id: 'f1', status: 'imported', dialect: 'abcd-letter', md5_checksum: 'md5-f1',
      rows_total: 2, rows_imported: 2, rows_missing_media: 0,
      question_ids: ['upcat-math-500-questions:UPCAT-MATH-001', 'upcat-math-500-questions:UPCAT-MATH-002'],
    })
  })

  it('uploads each referenced figure once (content-addressed) and flags missing ones', async () => {
    const { db, rows } = fakeDb()
    const drive = gateway(
      [
        entry({ id: 'f2', name: 'UPCAT-Science-600-Questions.csv' }),
        entry({ id: 'img1', name: 'circuit_3.png', mimeType: 'image/png', path: 'Iskotify Questions/diagrams' }),
      ],
      { f2: SCI_CSV },
      { img1: pngBytes(640, 480) },
    )
    const media = mediaStore()
    const res = await syncDriveFolder(db as any, drive, media, { rootId: 'root' })

    expect(media.upload).toHaveBeenCalledTimes(1)
    expect(vi.mocked(media.upload).mock.calls[0]![0]).toMatch(/^[0-9a-f]{64}\.png$/)
    expect(vi.mocked(media.upload).mock.calls[0]![2]).toBe('image/png')

    const q = Object.fromEntries(rows('upcat_questions').map(r => [r.question_id.split(':')[1], r]))
    expect(q['UPCAT-SCI-001']).toMatchObject({ has_visual: false, image_url: null })
    expect(q['UPCAT-SCI-003']).toMatchObject({ has_visual: true, image_alt: 'Series circuit', image_width: 640, image_height: 480 })
    expect(q['UPCAT-SCI-003'].image_url).toMatch(/^https:\/\/cdn\.test\/question-media\/[0-9a-f]{64}\.png$/)
    expect(q['UPCAT-SCI-004'].image_url).toBe(q['UPCAT-SCI-003'].image_url)
    expect(q['UPCAT-SCI-005']).toMatchObject({ has_visual: true, image_url: null })
    expect(res.imported[0]).toMatchObject({ missingMedia: 1 })
    expect(rows('kb_drive_files')[0]).toMatchObject({ rows_missing_media: 1 })
    // Full list (not just the first 5 in the note) so the author knows exactly what to upload.
    expect(rows('kb_drive_files')[0]!.missing_figures).toEqual([
      { question_id: 'upcat-science-600-questions:UPCAT-SCI-005', file: 'diagrams/missing.png', caption: 'A cell' },
    ])
  })

  it('skips files whose checksum matches the ledger without downloading them', async () => {
    const { db } = fakeDb({ kb_drive_files: [{ drive_file_id: 'f1', md5_checksum: 'md5-f1', status: 'imported' }] })
    const drive = gateway([entry({ id: 'f1', name: 'UPCAT-Math-500-Questions.csv' })], { f1: MATH_CSV })
    const res = await syncDriveFolder(db as any, drive, mediaStore(), { rootId: 'root' })
    expect(res.unchanged).toBe(1)
    expect(drive.downloadText).not.toHaveBeenCalled()
  })

  it('records unknown, out-of-scope and unsupported files without importing rows', async () => {
    const { db, rows } = fakeDb()
    const drive = gateway(
      [
        entry({ id: 'u1', name: 'random-questions.csv' }),
        entry({ id: 'p1', name: 'PSHS_NCE_300_Questions.csv' }),
        entry({ id: 'x1', name: 'ACET_Abstract_Reasoning_300Q_Visual.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
        entry({ id: 'h1', name: 'UPCAT-Math-Extra.csv' }),
      ],
      { u1: 'a,b\n1,2', p1: 'x', h1: 'foo,bar\n1,2' },
    )
    const res = await syncDriveFolder(db as any, drive, mediaStore(), { rootId: 'root', ask: noAi })
    const byId = Object.fromEntries(rows('kb_drive_files').map(r => [r.drive_file_id, r]))
    expect(byId.u1.status).toBe('needs_mapping')
    expect(byId.p1.status).toBe('skipped')
    expect(byId.x1).toMatchObject({ status: 'skipped', message: expect.stringMatching(/Word.*CSV, Excel/) })
    expect(byId.h1).toMatchObject({ status: 'needs_mapping', message: expect.stringMatching(/column/i) })
    // What the manual mapping dialog needs: the file's real headers and a few rows.
    expect(byId.h1).toMatchObject({ headers: ['foo', 'bar'], sample_rows: [{ foo: '1', bar: '2' }] })
    expect(rows('upcat_questions')).toEqual([])
    expect(res.needsMapping).toHaveLength(2)
    expect(res.skipped).toHaveLength(2)
    expect(drive.downloadText).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }))
  })

  it('skips a file whose downloaded text exceeds the size cap (native Sheets report no size)', async () => {
    const { db, rows } = fakeDb()
    const drive = gateway(
      [entry({ id: 's1', name: 'UPCAT-Math-500-Questions', mimeType: 'application/vnd.google-apps.spreadsheet', md5Checksum: null })],
      { s1: MATH_CSV },
    )
    const res = await syncDriveFolder(db as any, drive, mediaStore(), { rootId: 'root', maxSheetBytes: 64 })
    expect(res.skipped).toEqual([expect.objectContaining({ driveFileId: 's1', message: expect.stringMatching(/larger than/) })])
    expect(rows('upcat_questions')).toEqual([])
  })

  it('holds back same-named files (their question ids would collide) instead of overwriting one with the other', async () => {
    const { db, rows } = fakeDb()
    const drive = gateway(
      [
        entry({ id: 'a', name: 'UPCAT-Math-500-Questions.csv' }),
        entry({ id: 'b', name: 'UPCAT-Math-500-Questions.csv', path: 'Iskotify Questions/old' }),
      ],
      { a: MATH_CSV, b: MATH_CSV },
    )
    const res = await syncDriveFolder(db as any, drive, mediaStore(), { rootId: 'root' })
    expect(res.needsMapping.map(o => o.driveFileId).sort()).toEqual(['a', 'b'])
    expect(res.needsMapping[0]!.message).toMatch(/same name/i)
    expect(rows('upcat_questions')).toEqual([])
  })

  it('says how many live questions were re-drafted by an edit and re-runs the flashcard projection', async () => {
    const { db, rpcCalls } = fakeDb({
      kb_drive_files: [{ drive_file_id: 'f1', md5_checksum: 'old', status: 'imported' }],
      upcat_questions: [
        { question_id: 'upcat-math-500-questions:UPCAT-MATH-002', question_text: 'Old wording?', options: ['a', 'b', 'c', 'd'], correct_index: 0, status: 'published', image_url: null },
      ],
    })
    const drive = gateway([entry({ id: 'f1', name: 'UPCAT-Math-500-Questions.csv' })], { f1: MATH_CSV })
    const res = await syncDriveFolder(db as any, drive, mediaStore(), { rootId: 'root' })
    expect(res.imported[0]!.message).toMatch(/1 live question\(s\) changed/)
    expect(rpcCalls).toEqual(['project_question_bank_to_flashcards'])
  })

  it('records a download failure as an error and keeps going', async () => {
    const { db, rows } = fakeDb()
    const drive = gateway(
      [entry({ id: 'bad', name: 'UPCAT-Science-600-Questions.csv' }), entry({ id: 'f1', name: 'UPCAT-Math-500-Questions.csv' })],
      { f1: MATH_CSV },
    )
    const res = await syncDriveFolder(db as any, drive, mediaStore(), { rootId: 'root' })
    expect(res.errors).toEqual([expect.objectContaining({ driveFileId: 'bad', message: expect.stringContaining('boom') })])
    expect(res.imported).toHaveLength(1)
    expect(rows('kb_drive_files').find(r => r.drive_file_id === 'bad')).toMatchObject({ status: 'error' })
  })

  it('stops at the deadline and reports the remaining files', async () => {
    const { db } = fakeDb()
    let t = 0
    const drive = gateway(
      [entry({ id: 'f1', name: 'UPCAT-Math-500-Questions.csv' }), entry({ id: 'f2', name: 'UPCAT-Science-600-Questions.csv' })],
      { f1: MATH_CSV, f2: SCI_CSV },
    )
    const res = await syncDriveFolder(db as any, drive, mediaStore(), { rootId: 'root', deadline: 1, now: () => t++ })
    expect(res.imported).toHaveLength(1)
    expect(res.remaining).toBe(1)
  })

  it('on a changed file keeps untouched published questions live and re-drafts edited ones', async () => {
    const { db, rows } = fakeDb({
      kb_drive_files: [{ drive_file_id: 'f1', md5_checksum: 'old', status: 'imported' }],
      upcat_questions: [
        { question_id: 'upcat-math-500-questions:UPCAT-MATH-001', question_text: 'Q1?', options: ['a', 'b', 'c', 'd'], correct_index: 1, status: 'published', image_url: null },
        { question_id: 'upcat-math-500-questions:UPCAT-MATH-002', question_text: 'Old wording?', options: ['a', 'b', 'c', 'd'], correct_index: 0, status: 'published', image_url: null },
      ],
    })
    const drive = gateway([entry({ id: 'f1', name: 'UPCAT-Math-500-Questions.csv' })], { f1: MATH_CSV })
    await syncDriveFolder(db as any, drive, mediaStore(), { rootId: 'root' })
    const status = Object.fromEntries(rows('upcat_questions').map(r => [r.question_id.split(':')[1], r.status]))
    expect(status).toEqual({ 'UPCAT-MATH-001': 'published', 'UPCAT-MATH-002': 'draft' })
  })
})
