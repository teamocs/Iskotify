import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const mockRequireAdmin = vi.fn()
vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => mockRequireAdmin() }))

const serviceClient = { tag: 'service' }
vi.mock('@iskotify/utils', () => ({ createServerClient: vi.fn(() => serviceClient) }))

const mockSync = vi.fn()
vi.mock('@/lib/kb/syncDriveFolder', () => ({ syncDriveFolder: (...a: unknown[]) => mockSync(...a) }))
vi.mock('@/lib/kb/driveClient', () => ({
  createDriveGateway: vi.fn(() => ({ tag: 'drive' })),
  createMediaStore: vi.fn(() => ({ tag: 'media' })),
}))

function req(authorization?: string) {
  return new Request('http://localhost/api/kb/drive-sync', {
    headers: authorization ? { authorization } : {},
  }) as unknown as import('next/server').NextRequest
}

async function load() {
  return await import('../route')
}

const SUMMARY = { imported: [], skipped: [], needsMapping: [], errors: [], unchanged: 3, remaining: 0 }

describe('/api/kb/drive-sync', () => {
  beforeEach(() => {
    vi.resetModules()
    mockRequireAdmin.mockReset()
    mockSync.mockReset()
    mockSync.mockResolvedValue(SUMMARY)
    vi.stubEnv('CRON_SECRET', 'cron-secret-value')
    vi.stubEnv('KB_DRIVE_FOLDER_ID', 'test-folder-id-0000000000')
    mockRequireAdmin.mockResolvedValue({ error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) })
  })

  it('rejects a request with neither the cron secret nor an admin session', async () => {
    const { GET } = await load()
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(mockSync).not.toHaveBeenCalled()
  })

  it('rejects a wrong bearer token', async () => {
    const { GET } = await load()
    const res = await GET(req('Bearer nope'))
    expect(res.status).toBe(401)
    expect(mockSync).not.toHaveBeenCalled()
  })

  it('runs the sync for the Vercel cron (GET + Bearer CRON_SECRET) with a time budget', async () => {
    const { GET } = await load()
    const res = await GET(req('Bearer cron-secret-value'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(SUMMARY)
    const [db, , , opts] = mockSync.mock.calls[0]!
    expect(db).toBe(serviceClient)
    expect(opts).toMatchObject({ rootId: 'test-folder-id-0000000000', deadline: expect.any(Number) })
  })

  it('runs the sync for an admin session (POST from the Sync now button)', async () => {
    mockRequireAdmin.mockResolvedValue({ supabase: serviceClient })
    const { POST } = await load()
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(mockSync).toHaveBeenCalledTimes(1)
  })

  it('does not accept an admin session on GET (no cross-site GET-triggered syncs)', async () => {
    mockRequireAdmin.mockResolvedValue({ supabase: serviceClient })
    const { GET } = await load()
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(mockRequireAdmin).not.toHaveBeenCalled()
    expect(mockSync).not.toHaveBeenCalled()
  })

  it('returns 500 when the Drive folder is not configured', async () => {
    vi.stubEnv('KB_DRIVE_FOLDER_ID', '')
    const { GET } = await load()
    const res = await GET(req('Bearer cron-secret-value'))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/KB_DRIVE_FOLDER_ID/)
  })

  it('returns 500 with the message when the sync throws', async () => {
    mockSync.mockRejectedValue(new Error('kb_drive_files read failed: relation does not exist'))
    const { GET } = await load()
    const res = await GET(req('Bearer cron-secret-value'))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/kb_drive_files/)
  })
})
