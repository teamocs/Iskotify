import { describe, it, expect, vi } from 'vitest'
import { loadMappingContext, saveMapping, clearMapping, suggestMapping } from '../fileMapping'
import { fakeDb } from './fakeDb'

const headers = ['Item', 'Choice 1', 'Choice 2', 'Choice 3', 'Choice 4', 'Key']
const columns = { question: 'Item', option_a: 'Choice 1', option_b: 'Choice 2', option_c: 'Choice 3', option_d: 'Choice 4', answer: 'Key' }
const summary = { imported: [{ driveFileId: 'f1', name: 'x', rows: 3 }], skipped: [], needsMapping: [], errors: [], unchanged: 0, remaining: 0, aiMapped: 0 }

function seed(extra: Record<string, unknown[]> = {}) {
  return fakeDb({
    kb_drive_files: [{ drive_file_id: 'f1', name: 'Trivia.xlsx', status: 'needs_mapping', headers, sample_rows: [{ Item: 'Q?', Key: 'A' }] }],
    ...(extra as Record<string, Record<string, unknown>[]>),
  })
}

describe('loadMappingContext', () => {
  it('returns the file’s headers, sample rows, saved mapping and the pool its name implies', async () => {
    const { db } = seed({ kb_file_mappings: [{ drive_file_id: 'f1', subtest: 'Science', main_subject: 'Science', skill_category: '', columns, source: 'ai' }] })
    const ctx = await loadMappingContext(db as any, 'f1')
    expect(ctx).toMatchObject({ name: 'Trivia.xlsx', headers, sampleRows: [{ Item: 'Q?', Key: 'A' }], rulePool: null })
    expect(ctx?.mapping).toMatchObject({ subtest: 'Science', columns, source: 'ai' })
  })

  it('returns null for an unknown file', async () => {
    const { db } = fakeDb()
    expect(await loadMappingContext(db as any, 'nope')).toBeNull()
  })
})

describe('saveMapping', () => {
  it('stores an admin mapping and re-syncs just that file', async () => {
    const { db, rows } = seed()
    const resync = vi.fn(async () => summary)
    const out = await saveMapping(db as any, 'f1', { subtest: 'Science', columns }, resync)
    expect(out).toMatchObject({ ok: true, summary })
    expect(resync).toHaveBeenCalledWith('f1')
    expect(rows('kb_file_mappings')[0]).toMatchObject({ drive_file_id: 'f1', subtest: 'Science', main_subject: 'Science', source: 'admin', columns, updated_at: expect.any(String) })
  })

  it('refuses a mapping that does not fit the file, without touching anything', async () => {
    const { db, rows } = seed()
    const resync = vi.fn()
    const out = await saveMapping(db as any, 'f1', { subtest: 'Science', columns: { ...columns, answer: 'Answer' } }, resync)
    expect(out).toMatchObject({ ok: false, status: 400, error: expect.stringContaining('Answer') })
    expect(rows('kb_file_mappings')).toEqual([])
    expect(resync).not.toHaveBeenCalled()
  })

  it('404s for an unknown file', async () => {
    const { db } = fakeDb()
    expect(await saveMapping(db as any, 'nope', { subtest: 'Science', columns }, vi.fn())).toMatchObject({ ok: false, status: 404 })
  })
})

describe('clearMapping', () => {
  it('removes the saved mapping and re-syncs the file', async () => {
    const { db, rows } = seed({ kb_file_mappings: [{ drive_file_id: 'f1', subtest: 'Science', main_subject: 'Science', skill_category: '', columns, source: 'ai' }] })
    const resync = vi.fn(async () => summary)
    await clearMapping(db as any, 'f1', resync)
    expect(rows('kb_file_mappings')).toEqual([])
    expect(resync).toHaveBeenCalledWith('f1')
  })
})

describe('suggestMapping', () => {
  it('asks the model with the file’s headers and returns a mapping for the dialog', async () => {
    const { db } = seed()
    const ask = vi.fn(async () => JSON.stringify({ columns, choices: { subtest: 'General Information' } }))
    const s = await suggestMapping(db as any, 'f1', ask)
    expect(s).toMatchObject({ subtest: 'General Information', columns })
    expect(String((ask.mock.calls[0] as unknown as [string])[0])).toContain('Choice 1')
  })

  it('returns null when the model cannot help', async () => {
    const { db } = seed()
    expect(await suggestMapping(db as any, 'f1', async () => null)).toBeNull()
  })
})
