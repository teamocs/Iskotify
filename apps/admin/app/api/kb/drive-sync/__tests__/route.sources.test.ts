import { describe, it, expect, vi, beforeEach } from 'vitest'

// Routing by drive_sources (migration 068). The original route.test.ts runs
// untouched against the same route: with no drive_sources rows it must behave
// exactly as before (KB_DRIVE_FOLDER_ID only, same response).

vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: vi.fn() }))

const serviceClient = { tag: 'service' }
vi.mock('@iskotify/utils', () => ({ createServerClient: vi.fn(() => serviceClient) }))

const mockSync = vi.fn()
vi.mock('@/lib/kb/syncDriveFolder', () => ({ syncDriveFolder: (...a: unknown[]) => mockSync(...a) }))
const mockLogRun = vi.fn((_db: unknown, _trigger: string, run: () => Promise<unknown>) => run())
vi.mock('@/lib/kb/syncRuns', () => ({ logSyncRun: (...a: [unknown, string, () => Promise<unknown>]) => mockLogRun(...a) }))
const mockGateway = vi.fn(() => ({ tag: 'drive' }))
vi.mock('@/lib/kb/driveClient', () => ({
  createDriveGateway: () => mockGateway(),
  createMediaStore: vi.fn(() => ({ tag: 'media' })),
}))

const mockLoad = vi.fn()
vi.mock('@/lib/driveSources/sources', async () => {
  const actual = await vi.importActual<typeof import('@/lib/driveSources/sources')>('@/lib/driveSources/sources')
  return { ...actual, loadSyncSources: (...a: unknown[]) => mockLoad(...a) }
})
const mockContent = vi.fn()
vi.mock('@/lib/driveContent/syncContent', () => ({ syncContentSources: (...a: unknown[]) => mockContent(...a) }))

const cron = () => new Request('http://localhost/api/kb/drive-sync', {
  headers: { authorization: 'Bearer cron-secret-value' },
}) as unknown as import('next/server').NextRequest

const EMPTY = { imported: [], skipped: [], needsMapping: [], errors: [], unchanged: 0, remaining: 0, aiMapped: 0 }
const Q_ENV = { id: null, contentType: 'questions', folderId: 'env-questions-folder-0000', label: 'KB_DRIVE_FOLDER_ID' }
const Q_ROW = { id: 'q2', contentType: 'questions', folderId: 'more-questions-folder-000', label: 'More questions' }
const LISTINGS = { id: 'l1', contentType: 'listings', folderId: 'listings-folder-00000000', label: 'Listings' }
const REPORTS = { id: 'a1', contentType: 'announcements', folderId: 'reports-folder-000000000', label: 'Reports' }
const CONTENT = { files: [{ contentType: 'listings', driveFileId: 'f', name: 'f', status: 'previewed' }], unchanged: 0, remaining: 0, aiCalls: 0, sourceErrors: [] }

describe('/api/kb/drive-sync — Drive sources', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSync.mockReset()
    mockLoad.mockReset()
    mockContent.mockReset()
    mockLogRun.mockClear()
    vi.stubEnv('CRON_SECRET', 'cron-secret-value')
    vi.stubEnv('KB_DRIVE_FOLDER_ID', 'env-questions-folder-0000')
    mockContent.mockResolvedValue(CONTENT)
  })

  it('reads the sources with KB_DRIVE_FOLDER_ID as the implicit questions folder', async () => {
    mockLoad.mockResolvedValue({ sources: [Q_ENV] })
    mockSync.mockResolvedValue({ ...EMPTY, unchanged: 2 })
    const { GET } = await import('../route')
    const res = await GET(cron())
    expect(res.status).toBe(200)
    expect(mockLoad).toHaveBeenCalledWith(serviceClient, 'env-questions-folder-0000')
    // No content sources: the response is the questions summary, unchanged.
    expect(await res.json()).toEqual({ ...EMPTY, unchanged: 2 })
    expect(mockContent).not.toHaveBeenCalled()
  })

  it('runs every questions folder through the question pipeline and the rest through the content sync', async () => {
    mockLoad.mockResolvedValue({ sources: [Q_ENV, Q_ROW, LISTINGS, REPORTS] })
    mockSync
      .mockResolvedValueOnce({ ...EMPTY, imported: [{ driveFileId: 'a', name: 'a.csv' }], unchanged: 1 })
      .mockResolvedValueOnce({ ...EMPTY, unchanged: 4, remaining: 2, aiMapped: 1 })
    const { GET } = await import('../route')
    const res = await GET(cron())
    expect(res.status).toBe(200)

    expect(mockSync.mock.calls.map(c => c[3].rootId)).toEqual(['env-questions-folder-0000', 'more-questions-folder-000'])
    const deadline = mockSync.mock.calls[0]![3].deadline
    expect(mockSync.mock.calls[1]![3].deadline).toBe(deadline)

    const [db, drive, sources, opts] = mockContent.mock.calls[0]!
    expect(db).toBe(serviceClient)
    expect(drive).toEqual({ tag: 'drive' })
    expect(sources).toEqual([LISTINGS, REPORTS])
    expect(opts).toEqual({ deadline })

    const body = await res.json()
    expect(body).toMatchObject({ imported: [{ driveFileId: 'a' }], unchanged: 5, remaining: 2, aiMapped: 1, content: CONTENT })
    // One run in the History log for the whole sync.
    expect(mockLogRun).toHaveBeenCalledTimes(1)
  })

  it('syncs content folders even with no questions folder configured', async () => {
    vi.stubEnv('KB_DRIVE_FOLDER_ID', '')
    mockLoad.mockResolvedValue({ sources: [REPORTS] })
    const { GET } = await import('../route')
    const res = await GET(cron())
    expect(res.status).toBe(200)
    expect(mockSync).not.toHaveBeenCalled()
    expect((await res.json()).content).toEqual(CONTENT)
  })

  it('a failing content sync never fails the question sync', async () => {
    mockLoad.mockResolvedValue({ sources: [Q_ENV, LISTINGS] })
    mockSync.mockResolvedValue(EMPTY)
    mockContent.mockRejectedValue(new Error('drive_content_files read failed: relation does not exist'))
    const { GET } = await import('../route')
    const res = await GET(cron())
    expect(res.status).toBe(200)
    expect((await res.json()).content).toEqual({ error: expect.stringMatching(/drive_content_files/) })
  })

  it('one unreadable questions folder is reported without stopping the others', async () => {
    mockLoad.mockResolvedValue({ sources: [Q_ENV, Q_ROW] })
    mockSync
      .mockRejectedValueOnce(new Error('File not found: env-questions-folder-0000'))
      .mockResolvedValueOnce({ ...EMPTY, unchanged: 3 })
    const { GET } = await import('../route')
    const res = await GET(cron())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.unchanged).toBe(3)
    expect(body.errors).toEqual([{ driveFileId: 'env-questions-folder-0000', name: 'Folder “KB_DRIVE_FOLDER_ID”', message: 'File not found: env-questions-folder-0000' }])
  })

  it('a missing service account fails inside the logged run, so History shows it', async () => {
    mockLoad.mockResolvedValue({ sources: [Q_ENV, LISTINGS] })
    mockGateway.mockImplementationOnce(() => { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing or malformed') })
    let ranInsideLog = false
    mockLogRun.mockImplementationOnce(async (_db, _t, run) => {
      try { return await run() } catch (err) { ranInsideLog = true; throw err }
    })
    const { GET } = await import('../route')
    const res = await GET(cron())
    expect(res.status).toBe(500)
    expect(ranInsideLog).toBe(true)
    expect(mockContent).not.toHaveBeenCalled()
  })

  it('still runs KB_DRIVE_FOLDER_ID when drive_sources cannot be read (response unchanged)', async () => {
    mockLoad.mockResolvedValue({ sources: [Q_ENV], warning: 'drive_sources could not be read (x); syncing KB_DRIVE_FOLDER_ID only' })
    mockSync.mockResolvedValue(EMPTY)
    const { GET } = await import('../route')
    const res = await GET(cron())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(EMPTY)
  })
})
