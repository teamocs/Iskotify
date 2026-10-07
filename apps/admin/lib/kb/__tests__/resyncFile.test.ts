import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSync = vi.fn()
vi.mock('../syncDriveFolder', () => ({ syncDriveFolder: (...a: unknown[]) => mockSync(...a) }))
vi.mock('../syncRuns', () => ({ logSyncRun: (_db: unknown, _t: string, run: () => Promise<unknown>) => run() }))
vi.mock('../driveClient', () => ({ createDriveGateway: () => ({}), createMediaStore: () => ({}) }))

const EMPTY = { imported: [], skipped: [], needsMapping: [], errors: [], unchanged: 0, remaining: 0, aiMapped: 0 }

function dbWithSources(rows: unknown[]) {
  return { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: rows, error: null }) }) }) }) } as never
}

describe('driveResync', () => {
  beforeEach(() => {
    mockSync.mockReset()
    mockSync.mockResolvedValue(EMPTY)
    vi.stubEnv('KB_DRIVE_FOLDER_ID', 'env-questions-folder-0000')
  })

  it('re-syncs the one file across every questions folder (env + drive_sources), never content folders', async () => {
    const { driveResync } = await import('../resyncFile')
    await driveResync(dbWithSources([
      { id: 'q2', content_type: 'questions', folder_id: 'more-questions-folder-000', label: null },
      { id: 'l1', content_type: 'listings', folder_id: 'listings-folder-00000000', label: null },
    ]))('file-1')
    expect(mockSync.mock.calls.map(c => [c[3].rootId, c[3].onlyFileIds])).toEqual([
      ['env-questions-folder-0000', ['file-1']],
      ['more-questions-folder-000', ['file-1']],
    ])
  })

  it('fails clearly when no questions folder is configured', async () => {
    vi.stubEnv('KB_DRIVE_FOLDER_ID', '')
    const { driveResync } = await import('../resyncFile')
    await expect(driveResync(dbWithSources([]))('file-1')).rejects.toThrow(/KB_DRIVE_FOLDER_ID/)
  })
})
