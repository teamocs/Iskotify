import { describe, it, expect, vi } from 'vitest'
import { parseDriveFolderInput, loadSyncSources, folderUrl } from '../sources'
import { serviceAccountEmail } from '@/lib/google/serviceAccount'

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345'

describe('parseDriveFolderInput', () => {
  it('accepts a bare folder id', () => {
    expect(parseDriveFolderInput(`  ${ID} `)).toBe(ID)
  })

  it('accepts the folder links Drive hands out', () => {
    expect(parseDriveFolderInput(`https://drive.google.com/drive/folders/${ID}`)).toBe(ID)
    expect(parseDriveFolderInput(`https://drive.google.com/drive/folders/${ID}?usp=sharing`)).toBe(ID)
    expect(parseDriveFolderInput(`https://drive.google.com/drive/u/1/folders/${ID}`)).toBe(ID)
    expect(parseDriveFolderInput(`https://drive.google.com/open?id=${ID}`)).toBe(ID)
  })

  it('rejects other hosts, file links, junk and query-breaking ids', () => {
    expect(parseDriveFolderInput(`https://evil.example.com/drive/folders/${ID}`)).toBeNull()
    expect(parseDriveFolderInput(`https://docs.google.com/document/d/${ID}/edit`)).toBeNull()
    expect(parseDriveFolderInput('')).toBeNull()
    expect(parseDriveFolderInput('short')).toBeNull()
    expect(parseDriveFolderInput(`${ID}' or '1'='1`)).toBeNull()
    expect(parseDriveFolderInput(`javascript:alert(1)//${ID}`)).toBeNull()
    expect(parseDriveFolderInput('x'.repeat(200))).toBeNull()
  })

  it('builds the folder link from an id', () => {
    expect(folderUrl(ID)).toBe(`https://drive.google.com/drive/folders/${ID}`)
  })
})

function dbWith(result: { data?: unknown; error?: unknown } | Error) {
  const eq = vi.fn(() => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)))
  const select = vi.fn(() => ({ eq }))
  return { db: { from: vi.fn(() => ({ select })) } as never, select, eq }
}

describe('loadSyncSources', () => {
  it('keeps KB_DRIVE_FOLDER_ID as an implicit questions source, first', async () => {
    const { db, eq } = dbWith({ data: [
      { id: 's1', content_type: 'listings', folder_id: 'listings-folder-000000', label: 'Listings' },
      { id: 's2', content_type: 'announcements', folder_id: 'reports-folder-000000', label: null },
    ], error: null })
    const out = await loadSyncSources(db, 'env-questions-folder-0000')
    expect(eq).toHaveBeenCalledWith('enabled', true)
    expect(out.sources).toEqual([
      { id: null, contentType: 'questions', folderId: 'env-questions-folder-0000', label: 'KB_DRIVE_FOLDER_ID' },
      { id: 's1', contentType: 'listings', folderId: 'listings-folder-000000', label: 'Listings' },
      { id: 's2', contentType: 'announcements', folderId: 'reports-folder-000000', label: null },
    ])
    expect(out.warning).toBeUndefined()
  })

  it('does not run the env folder twice when it is also listed as a questions source', async () => {
    const { db } = dbWith({ data: [{ id: 's1', content_type: 'questions', folder_id: 'env-questions-folder-0000', label: 'Q' }], error: null })
    const out = await loadSyncSources(db, 'env-questions-folder-0000')
    expect(out.sources).toHaveLength(1)
    expect(out.sources[0]).toMatchObject({ id: 's1', contentType: 'questions' })
  })

  it('drops rows whose folder id or content type is invalid', async () => {
    const { db } = dbWith({ data: [
      { id: 's1', content_type: 'listings', folder_id: "bad' id", label: null },
      { id: 's2', content_type: 'schools', folder_id: 'some-folder-000000000', label: null },
    ], error: null })
    const out = await loadSyncSources(db, undefined)
    expect(out.sources).toEqual([])
  })

  it('falls back to the env folder alone when drive_sources cannot be read (e.g. before migration 068)', async () => {
    const { db } = dbWith({ data: null, error: { message: 'relation "drive_sources" does not exist' } })
    const out = await loadSyncSources(db, 'env-questions-folder-0000')
    expect(out.sources).toEqual([{ id: null, contentType: 'questions', folderId: 'env-questions-folder-0000', label: 'KB_DRIVE_FOLDER_ID' }])
    expect(out.warning).toMatch(/drive_sources/)
  })

  it('also falls back when the client throws', async () => {
    const out = await loadSyncSources({ tag: 'not-a-client' } as never, 'env-questions-folder-0000')
    expect(out.sources).toHaveLength(1)
    expect(out.warning).toBeTruthy()
  })
})

describe('serviceAccountEmail', () => {
  it('returns only the client_email', () => {
    expect(serviceAccountEmail(JSON.stringify({ client_email: 'sync@x.iam.gserviceaccount.com', private_key: 'secret' }))).toBe('sync@x.iam.gserviceaccount.com')
  })

  it('is null when unset or malformed', () => {
    expect(serviceAccountEmail(undefined)).toBeNull()
    expect(serviceAccountEmail('{nope')).toBeNull()
    expect(serviceAccountEmail(JSON.stringify({ client_email: 42 }))).toBeNull()
  })
})
